import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RsError,
  type RsEvent,
  createRsClient,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createStateDir(key = 'key-one'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'chainglass-rs-client-'));
  scratchDirs.push(dir);
  await writeFile(join(dir, 'daemon.key'), `${key}\n`);
  return dir;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function scriptedFetch(handlers: Array<(call: FetchCall) => Response | Promise<Response>>): {
  fetch: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    const handler = handlers.shift();
    if (!handler) throw new Error(`Unexpected fetch: ${call.url}`);
    return handler(call);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function authHeader(call: FetchCall): string | null {
  return new Headers(call.init?.headers).get('authorization');
}

describe('createRsClient', () => {
  it('unwraps GET /v1/seats and reads the bearer key from stateDir', async () => {
    const stateDir = await createStateDir();
    const transport = scriptedFetch([
      () =>
        jsonResponse({
          ok: true,
          command: 'pij list',
          v: 1,
          data: {
            seats: [
              {
                id: 'pij-test-seat',
                folder: '/workspace',
                proc: { pid: 42, proc_start: 20260902010101 },
                state: 'idle',
              },
            ],
            unavailable: [],
          },
        }),
    ]);
    const client = createRsClient({ addr: '127.0.0.1:7461', stateDir, fetch: transport.fetch });

    const seats = await client.seats();

    expect(seats).toEqual([
      {
        id: 'pij-test-seat',
        folder: '/workspace',
        proc: { pid: 42, proc_start: 20260902010101 },
        state: 'idle',
      },
    ]);
    expect(transport.calls[0].url).toBe('http://127.0.0.1:7461/v1/seats');
    expect(transport.calls[0].init?.method).toBe('GET');
    expect(authHeader(transport.calls[0])).toBe('Bearer key-one');
  });

  it('posts the id to /v1/state and returns the typed report', async () => {
    const stateDir = await createStateDir();
    const transport = scriptedFetch([
      () =>
        jsonResponse({
          ok: true,
          command: 'pij state',
          v: 1,
          data: {
            id: 'pij-test-seat',
            state: 'idle',
            unsupported: [{ field: 'watchdog', why: 'rs has no watchdog block' }],
          },
        }),
    ]);
    const client = createRsClient({
      addr: 'http://127.0.0.1:7461/',
      stateDir,
      fetch: transport.fetch,
    });

    const report = await client.state('pij-test-seat');

    expect(report.unsupported).toEqual([{ field: 'watchdog', why: 'rs has no watchdog block' }]);
    expect(transport.calls[0].url).toBe('http://127.0.0.1:7461/v1/state');
    expect(transport.calls[0].init?.method).toBe('POST');
    expect(transport.calls[0].init?.body).toBe(JSON.stringify({ id: 'pij-test-seat' }));
    expect(new Headers(transport.calls[0].init?.headers).get('content-type')).toBe(
      'application/json'
    );
  });

  it('throws a typed RsError for an ok:false daemon envelope', async () => {
    const stateDir = await createStateDir();
    const transport = scriptedFetch([
      () =>
        jsonResponse({
          ok: false,
          command: 'pij state',
          v: 1,
          error: 'not_found',
          meta: 'no such seat',
        }),
    ]);
    const client = createRsClient({ addr: '127.0.0.1:7461', stateDir, fetch: transport.fetch });

    const error = await client.state('missing').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(RsError);
    expect(error).toMatchObject({ code: 'not_found', command: 'pij state', status: 200 });
    expect((error as Error).message).toContain('no such seat');
  });

  it('re-reads daemon.key once after a 401 and retries with the rotated key', async () => {
    const stateDir = await createStateDir();
    const transport = scriptedFetch([
      async () => {
        await writeFile(join(stateDir, 'daemon.key'), 'key-two\n');
        return jsonResponse({ ok: false, command: 'auth', v: 1, error: 'auth' }, 401);
      },
      () => jsonResponse({ ok: true, command: 'pij list', v: 1, data: { seats: [] } }),
    ]);
    const client = createRsClient({ addr: '127.0.0.1:7461', stateDir, fetch: transport.fetch });

    await expect(client.seats()).resolves.toEqual([]);

    expect(transport.calls).toHaveLength(2);
    expect(transport.calls.map(authHeader)).toEqual(['Bearer key-one', 'Bearer key-two']);
  });

  it('throws after a second 401 instead of retrying forever', async () => {
    const stateDir = await createStateDir();
    const unauthorized = () =>
      jsonResponse({ ok: false, command: 'auth', v: 1, error: 'auth' }, 401);
    const transport = scriptedFetch([unauthorized, unauthorized]);
    const client = createRsClient({ addr: '127.0.0.1:7461', stateDir, fetch: transport.fetch });

    await expect(client.seats()).rejects.toMatchObject({ code: 'auth', status: 401 });
    expect(transport.calls).toHaveLength(2);
  });

  it('streams split NDJSON frames and sends the last cursor in the query', async () => {
    const stateDir = await createStateDir();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '{"build":"pij-rs 0.1.0","hello":true,"v":1}\n{"type":"event","machine":"local"'
          )
        );
        controller.enqueue(
          encoder.encode(
            ',"cursor":17,"event":{"v":1,"at":1788318613497,"kind":"message.pushed","seat":"pij-new","payload":"{\\"msg_id\\":\\"message-1\\"}"}}\n{"type":"future-frame","value":1}\n'
          )
        );
        controller.close();
      },
    });
    const transport = scriptedFetch([
      () =>
        new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }),
    ]);
    const client = createRsClient({ addr: '127.0.0.1:7461', stateDir, fetch: transport.fetch });

    const frames: RsEvent[] = [];
    for await (const frame of client.events({ local: 16 })) frames.push(frame);

    expect(frames).toEqual([
      { build: 'pij-rs 0.1.0', hello: true, v: 1 },
      {
        type: 'event',
        machine: 'local',
        cursor: 17,
        event: {
          v: 1,
          at: 1788318613497,
          kind: 'message.pushed',
          seat: 'pij-new',
          payload: '{"msg_id":"message-1"}',
        },
      },
      { ignored: true, frame: { type: 'future-frame', value: 1 } },
    ]);
    const url = new URL(transport.calls[0].url);
    expect(url.pathname).toBe('/v1/events');
    expect(url.searchParams.get('since')).toBe(JSON.stringify({ local: 16 }));
    expect(new Headers(transport.calls[0].init?.headers).get('accept')).toBe(
      'application/x-ndjson'
    );
  });
});
