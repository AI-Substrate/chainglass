import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_PIJ_RS_ADDR = '127.0.0.1:7461';
/**
 * Bound on each one-shot request (not the long-lived event stream). Without it a daemon call that
 * never answers freezes the poller's overlap-guarded slow loop until the socket gives up.
 */
export const DEFAULT_RS_REQUEST_TIMEOUT_MS = 5_000;

export function pijRsAddr(env: Record<string, string | undefined> = process.env): string {
  return env.PIJ_RS_ADDR ?? DEFAULT_PIJ_RS_ADDR;
}

export function pijRsStateDir(env: Record<string, string | undefined> = process.env): string {
  return env.PIJ_RS_STATE_DIR ?? join(homedir(), '.pij-rs');
}

export type Cursor = Readonly<Record<string, number>>;

export interface RsSeat {
  id: string;
  machine?: string;
  harness?: string;
  pane?: string;
  proc?: {
    pid?: number;
    proc_start?: number;
    [additive: string]: unknown;
  } | null;
  folder?: string;
  state?: string;
  semantic_state?: string | null;
  role?: string | null;
  model?: string | null;
  provider?: string | null;
  effort?: string | null;
  parent?: string | null;
  relay?: boolean;
  tombstoned_at?: number | null;
  tombstone_reason?: string | null;
  [additive: string]: unknown;
}

export interface RsUnsupportedField {
  field: string;
  why: string;
}

export interface RsStateReport {
  id: string;
  unsupported: RsUnsupportedField[];
  [additive: string]: unknown;
}

export interface RsHelloEvent {
  hello: true;
  build: string;
  v: number;
  [additive: string]: unknown;
}

export interface RsSpineEvent {
  v: number;
  at: number;
  kind: string;
  /**
   * The seat the event is about, or `null` for a machine-level event (e.g.
   * `config.copilot-statusline-ensured`). Seatless events are legitimate spine facts, not wire
   * damage: rejecting one aborts the stream, and since non-resume kinds never advance the cursor
   * the reconnect replays into the same frame forever.
   */
  seat: string | null;
  /** JSON encoded by the event producer; consumers parse it deliberately for the kind they use. */
  payload: string;
  [additive: string]: unknown;
}

export interface RsCursorEvent {
  type: 'event';
  machine: string;
  cursor: number;
  event: RsSpineEvent;
  [additive: string]: unknown;
}

export interface RsIgnoredEvent {
  ignored: true;
  frame: Readonly<Record<string, unknown>>;
}

export type RsEvent = RsHelloEvent | RsCursorEvent | RsIgnoredEvent;

/** `GET /v1/cards`: every local, untombstoned seat's `/v1/state` card in one call (pij plan 188). */
export interface RsCardsPayload {
  cards: RsStateReport[];
  unavailable: Array<{ id: string; error: string }>;
}

/** One `pij project list` record. Only `prime_id` is read here; designation is pij's prime authority. */
export interface RsProject {
  slug: string;
  prime_id?: string | null;
  [additive: string]: unknown;
}

export interface RsClient {
  seats(): Promise<RsSeat[]>;
  /** `POST /v1/project` `project list`; needs no caller evidence. */
  projects(): Promise<RsProject[]>;
  state(id: string): Promise<RsStateReport>;
  cards(): Promise<RsCardsPayload>;
  /** Auth covers connection setup; reconnecting after a stream ends re-reads a rotated key. */
  events(from?: Cursor, signal?: AbortSignal): AsyncIterable<RsEvent>;
}

export interface RsClientOptions {
  addr: string;
  stateDir: string;
  fetch: typeof fetch;
  /** Per-attempt bound for request-style calls; defaults to {@link DEFAULT_RS_REQUEST_TIMEOUT_MS}. */
  requestTimeoutMs?: number;
}

interface RsEnvelope<T> {
  ok: boolean;
  command: string;
  v: number;
  data?: T;
  error?: string;
  meta?: string;
}

interface RsSeatsPayload {
  seats: RsSeat[];
  unavailable?: Array<{ machine: string; reason: string }>;
}

export class RsError extends Error {
  readonly code: string;
  readonly command?: string;
  readonly status?: number;

  constructor(
    code: string,
    message: string,
    options: { command?: string; status?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'RsError';
    this.code = code;
    this.command = options.command;
    this.status = options.status;
  }
}

class HttpRsClient implements RsClient {
  private readonly baseUrl: string;

  constructor(private readonly options: RsClientOptions) {
    const addr = options.addr.includes('://') ? options.addr : `http://${options.addr}`;
    this.baseUrl = addr.replace(/\/+$/, '');
  }

  async seats(): Promise<RsSeat[]> {
    const payload = await this.requestEnvelope<RsSeatsPayload>('/v1/seats', { method: 'GET' });
    if (!Array.isArray(payload.seats)) {
      throw new RsError('wire', 'pij-rs /v1/seats response did not contain a seats array');
    }
    return payload.seats;
  }

  async projects(): Promise<RsProject[]> {
    const payload = await this.requestEnvelope<{ projects: RsProject[] }>('/v1/project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ argv: ['project', 'list'] }),
    });
    if (!Array.isArray(payload.projects)) {
      throw new RsError('wire', 'pij-rs /v1/project list did not contain a projects array');
    }
    return payload.projects;
  }

  async cards(): Promise<RsCardsPayload> {
    const payload = await this.requestEnvelope<RsCardsPayload>('/v1/cards', { method: 'GET' });
    if (!Array.isArray(payload.cards)) {
      throw new RsError('wire', 'pij-rs /v1/cards response did not contain a cards array');
    }
    return { cards: payload.cards, unavailable: payload.unavailable ?? [] };
  }

  state(id: string): Promise<RsStateReport> {
    return this.requestEnvelope<RsStateReport>('/v1/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

  async *events(from?: Cursor, signal?: AbortSignal): AsyncIterable<RsEvent> {
    const url = new URL('/v1/events', `${this.baseUrl}/`);
    if (from) url.searchParams.set('since', JSON.stringify(from));
    const response = await this.fetchWithAuthRetry(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/x-ndjson' },
      signal,
    });
    if (!response.ok) throw await this.errorFromResponse(response);
    if (!response.body) throw new RsError('wire', 'pij-rs /v1/events returned no response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        let newline = pending.indexOf('\n');
        while (newline !== -1) {
          const line = pending.slice(0, newline).trim();
          pending = pending.slice(newline + 1);
          if (line) yield parseEvent(line);
          newline = pending.indexOf('\n');
        }
        if (done) break;
      }
      const finalLine = pending.trim();
      if (finalLine) yield parseEvent(finalLine);
    } finally {
      reader.releaseLock();
    }
  }

  private async requestEnvelope<T>(path: string, init: RequestInit): Promise<T> {
    const timeoutMs = this.options.requestTimeoutMs ?? DEFAULT_RS_REQUEST_TIMEOUT_MS;
    let response: Response;
    let envelope: RsEnvelope<T>;
    try {
      response = await this.fetchWithAuthRetry(`${this.baseUrl}${path}`, init, timeoutMs);
      envelope = await parseEnvelope<T>(response);
    } catch (cause) {
      if (!isTimeout(cause)) throw cause;
      const message = `pij-rs ${path} timed out after ${timeoutMs}ms`;
      console.warn(`[pij-rs] ${message}`);
      throw new RsError('timeout', message, { cause });
    }
    if (!response.ok || !envelope.ok) {
      throw envelopeError(envelope, response.status);
    }
    if (envelope.data === undefined) {
      throw new RsError('wire', `pij-rs ${path} response omitted data`, {
        command: envelope.command,
        status: response.status,
      });
    }
    return envelope.data;
  }

  /** `timeoutMs` bounds each attempt separately; omit it for the long-lived event stream. */
  private async fetchWithAuthRetry(
    url: string,
    init: RequestInit,
    timeoutMs?: number
  ): Promise<Response> {
    let response = await this.fetchOnce(url, init, timeoutMs);
    if (response.status !== 401) return response;

    await response.body?.cancel();
    response = await this.fetchOnce(url, init, timeoutMs);
    return response;
  }

  private async fetchOnce(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    const key = await this.readKey();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${key}`);
    const signal = timeoutMs === undefined ? init.signal : AbortSignal.timeout(timeoutMs);
    return this.options.fetch(url, { ...init, headers, signal });
  }

  private async readKey(): Promise<string> {
    const path = join(this.options.stateDir, 'daemon.key');
    let key: string;
    try {
      key = (await readFile(path, 'utf8')).trim();
    } catch (cause) {
      throw new RsError('auth_key', `Cannot read pij-rs daemon key: ${path}`, { cause });
    }
    if (!key) throw new RsError('auth_key', `pij-rs daemon key is empty: ${path}`);
    return key;
  }

  private async errorFromResponse(response: Response): Promise<RsError> {
    try {
      return envelopeError(await parseEnvelope<unknown>(response), response.status);
    } catch (cause) {
      if (cause instanceof RsError) return cause;
      return new RsError(
        `http_${response.status}`,
        `pij-rs request failed: HTTP ${response.status}`,
        {
          status: response.status,
          cause,
        }
      );
    }
  }
}

export function createRsClient(options: RsClientOptions): RsClient {
  return new HttpRsClient(options);
}

function isTimeout(error: unknown): boolean {
  // A DOMException is not always an `Error` instance across realms, so match on the name alone.
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'TimeoutError'
  );
}

async function parseEnvelope<T>(response: Response): Promise<RsEnvelope<T>> {
  let value: unknown;
  try {
    value = JSON.parse(await response.text());
  } catch (cause) {
    throw new RsError('wire', 'pij-rs returned invalid JSON', {
      status: response.status,
      cause,
    });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RsError('wire', 'pij-rs returned an invalid response envelope', {
      status: response.status,
    });
  }
  const envelope = value as Partial<RsEnvelope<T>>;
  if (typeof envelope.ok !== 'boolean' || typeof envelope.command !== 'string') {
    throw new RsError('wire', 'pij-rs returned an invalid response envelope', {
      status: response.status,
    });
  }
  return envelope as RsEnvelope<T>;
}

function envelopeError(envelope: RsEnvelope<unknown>, status: number): RsError {
  const code = envelope.error ?? `http_${status}`;
  return new RsError(code, envelope.meta ?? `pij-rs ${envelope.command} failed: ${code}`, {
    command: envelope.command,
    status,
  });
}

function parseEvent(line: string): RsEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (cause) {
    throw new RsError('wire', 'pij-rs event stream contained invalid JSON', { cause });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RsError('wire', 'pij-rs event frame was not an object');
  }
  const frame = value as Partial<RsHelloEvent & RsCursorEvent> & Record<string, unknown>;
  if (frame.hello === true && typeof frame.build === 'string' && typeof frame.v === 'number') {
    return frame as unknown as RsHelloEvent;
  }
  if (frame.type !== 'event') return { ignored: true, frame };
  const event = frame.event;
  if (
    typeof frame.machine !== 'string' ||
    typeof frame.cursor !== 'number' ||
    typeof event !== 'object' ||
    event === null ||
    Array.isArray(event)
  ) {
    throw new RsError('wire', 'pij-rs event frame carried invalid cursor data');
  }
  const spineEvent = event as Partial<RsSpineEvent>;
  if (
    typeof spineEvent.v !== 'number' ||
    typeof spineEvent.at !== 'number' ||
    typeof spineEvent.kind !== 'string' ||
    (typeof spineEvent.seat !== 'string' && spineEvent.seat !== null) ||
    typeof spineEvent.payload !== 'string'
  ) {
    throw new RsError('wire', 'pij-rs cursor frame carried an invalid event');
  }
  return frame as unknown as RsCursorEvent;
}
