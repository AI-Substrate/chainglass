import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  parent?: string | null;
  relay?: boolean;
  tombstoned_at?: string | null;
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
  seat: string;
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

export interface RsClient {
  seats(): Promise<RsSeat[]>;
  state(id: string): Promise<RsStateReport>;
  /** Auth covers connection setup; reconnecting after a stream ends re-reads a rotated key. */
  events(from?: Cursor, signal?: AbortSignal): AsyncIterable<RsEvent>;
}

export interface RsClientOptions {
  addr: string;
  stateDir: string;
  fetch: typeof fetch;
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
    const response = await this.fetchWithAuthRetry(`${this.baseUrl}${path}`, init);
    const envelope = await parseEnvelope<T>(response);
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

  private async fetchWithAuthRetry(url: string, init: RequestInit): Promise<Response> {
    let response = await this.fetchOnce(url, init);
    if (response.status !== 401) return response;

    await response.body?.cancel();
    response = await this.fetchOnce(url, init);
    return response;
  }

  private async fetchOnce(url: string, init: RequestInit): Promise<Response> {
    const key = await this.readKey();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${key}`);
    return this.options.fetch(url, { ...init, headers });
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
    typeof spineEvent.seat !== 'string' ||
    typeof spineEvent.payload !== 'string'
  ) {
    throw new RsError('wire', 'pij-rs cursor frame carried an invalid event');
  }
  return frame as unknown as RsCursorEvent;
}
