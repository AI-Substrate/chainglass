#!/usr/bin/env node
/** Live, read-only Plan 093 proofs. No daemon writes, restarts, SQLite, or synthetic frames. */
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual, parseArgs } from 'node:util';

const HELP = `Usage: node scripts/verify-rs-reader.mjs MODE [options]

Modes (exactly one):
  --seat <id>        Compare every mapped field for this daemon seat (including absence).
  --all              Compare the entire roster in both directions, including tombstones.
  --replay           Measure finite fresh transport replay, then real stream + poller replay.
  --auth             Prove real 401/200 retry and 401/401 stop using an owned scratch key.
  --watch-seat <id>   Wait for an externally created, initially absent seat; prove <=10s
                     appearance and that reconnect since maps never skip its first seat.put.
  --watch-pane <id>   Watch an initially unregistered tmux pane, learning its minted seat ID
                     from the real reader row after external adoption; same arrival assertions.
  --help             Print this help; no daemon access.

Options:
  --addr <address>    Daemon address (PIJ_RS_ADDR, otherwise 127.0.0.1:7461).
  --state-dir <dir>   Real key directory (PIJ_RS_STATE_DIR, otherwise ~/.pij-rs); read only.
  --timeout-ms <ms>   Deadline per phase (default 30000, max 300000). Timeout is failure.

Uses installed tsx to load actual repository TypeScript; install workspace dependencies first.
Output is JSON (watch also emits a JSON ready record). Nonzero means mismatch or timeout.
Watch-pane: create an authorized scratch tmux pane first, run --watch-pane with its actual ID,
wait for ready, send the line "trigger" on stdin, and wait for triggerReady:true. Then adopt
that pane OUTSIDE this script and immediately send authorized message/delivery/spawn traffic.
Watch-seat is for external flows whose new seat ID is already known; never guess a minted ID.
The 10s UPPER BOUND starts at the local monotonic trigger marker. Daemon event.at is retained
verbatim (seat.put may report 0), never interpreted as an arrival clock. Success also requires
a pushed control frame after the marker, on its pre-recycle connection, beyond seat.put's cursor.
No mode mutates the daemon. Auth removes only its own mkdtemp directory, never the real key.
Replay uses 409 cursor_reset.data.newest for a finite target; transport and integrated costs
are separate. One subscriber at a time in this process, not a claim about other processes.
Equality uses the exact live response consumed by RsPijRecords, avoiding a two-read race.
Unobserved missing/null/tombstone cases are reported as coverage, never invented as fixtures.
`;
const DESCRIPTORS = new Set(['seat.put', 'seat.tombstone', 'spawn.bound', 'spawn.failed']);
const ROOT = new URL('../apps/web/src/features/089-first-class-pij/server/', import.meta.url);
const started = performance.now();
const result = { command: `node scripts/verify-rs-reader.mjs ${process.argv.slice(2).join(' ')}`, count: 0, errors: [] };
const shutdown = new AbortController();
const interrupt = () => shutdown.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

class ProofFailure extends Error {
  constructor(check, details = {}) {
    super(check);
    this.check = check;
    this.details = details;
  }
}
function check(condition, name, details) {
  if (!condition) throw new ProofFailure(name, details);
}
function equal(actual, expected, name, details) {
  check(isDeepStrictEqual(actual, expected), name, details);
}
function elapsed(since) { return Math.round((performance.now() - since) * 100) / 100; }
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function bounded(promise, signal, name) {
  signal.throwIfAborted();
  let abort;
  const stopped = new Promise((_, reject) => {
    abort = () => reject(new ProofFailure(name));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([promise, stopped]); }
  finally { signal.removeEventListener('abort', abort); }
}

async function main() {
  const { values } = parseArgs({ options: {
    seat: { type: 'string' }, all: { type: 'boolean' }, replay: { type: 'boolean' },
    auth: { type: 'boolean' }, 'watch-seat': { type: 'string' }, 'watch-pane': { type: 'string' }, help: { type: 'boolean' },
    addr: { type: 'string' }, 'state-dir': { type: 'string' }, 'timeout-ms': { type: 'string' },
  } });
  if (values.help) { process.stdout.write(HELP); return; }
  const modes = ['seat', 'all', 'replay', 'auth', 'watch-seat', 'watch-pane'].filter((key) => values[key] !== undefined && values[key] !== false);
  check(modes.length === 1, 'choose_exactly_one_mode');
  const mode = modes[0];
  result.mode = mode;
  const timeoutMs = Number(values['timeout-ms'] ?? 30000);
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300000, 'invalid_timeout_ms');
  const addr = values.addr ?? process.env.PIJ_RS_ADDR ?? '127.0.0.1:7461';
  const url = new URL(addr.includes('://') ? addr : `http://${addr}`);
  check(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'invalid_daemon_address');
  const stateDir = values['state-dir'] ?? process.env.PIJ_RS_STATE_DIR ?? join(homedir(), '.pij-rs');
  const { register } = await import('tsx/esm/api');
  const unregister = register();
  try {
    const [{ createRsClient }, { createRsPijRecords }, { FLEET_ROW_FIELDS }] = await Promise.all([
      import(new URL('rs/rs-client.ts', ROOT)),
      import(new URL('rs/rs-pij-records.ts', ROOT)),
      import(new URL('join.ts', ROOT)),
    ]);
    const context = { createRsClient, createRsPijRecords, FLEET_ROW_FIELDS, addr, stateDir, timeoutMs };
    if (mode === 'auth') await authProof(context);
    else if (mode === 'seat' || mode === 'all') await equalityProof(context, values.seat);
    else await replayProof(context, values['watch-seat'], values['watch-pane']);
    result.ok = true;
    result.milliseconds = elapsed(started);
    console.log(JSON.stringify(result));
  } finally { await unregister(); }
}

// Decorate actual transport, never its answers. Keys and payloads never enter output metrics.
function instrument(context, signal, { onResponse, onSeats, onState } = {}) {
  const metrics = {
    eventFrames: 0, helloFrames: 0, ignoredFrames: 0, wireBytes: 0, connections: 0,
    seatsReads: 0, stateReads: 0, maxConcurrentReads: 0, maxSubscribers: 0, since: [], kinds: {},
  };
  let reads = 0;
  let subscribers = 0;
  const client = context.createRsClient({
    addr: context.addr, stateDir: context.stateDir,
    fetch: async (input, init) => {
      const requestSignal = AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]);
      const response = await fetch(input, { ...init, signal: requestSignal });
      await onResponse?.(response, new URL(input));
      if (new URL(input).pathname !== '/v1/events' || !response.ok || !response.body) return response;
      const body = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
        metrics.wireBytes += chunk.byteLength;
        controller.enqueue(chunk);
      } }));
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
  async function read(kind, operation, observe) {
    metrics[kind] += 1;
    metrics.maxConcurrentReads = Math.max(metrics.maxConcurrentReads, ++reads);
    try { const value = await operation(); observe?.(value); return value; }
    finally { reads -= 1; }
  }
  return { metrics, client: {
    seats: () => read('seatsReads', () => client.seats(), onSeats),
    state: (id) => read('stateReads', () => client.state(id), onState),
    async *events(from, connectionSignal) {
      metrics.connections += 1;
      metrics.since.push({ connection: metrics.connections, since: from ? { ...from } : null });
      metrics.maxSubscribers = Math.max(metrics.maxSubscribers, ++subscribers);
      try {
        for await (const frame of client.events(from, AbortSignal.any([signal, ...(connectionSignal ? [connectionSignal] : [])]))) {
          if (frame.type === 'event') {
            metrics.eventFrames += 1;
            metrics.kinds[frame.event.kind] = (metrics.kinds[frame.event.kind] ?? 0) + 1;
          } else if (frame.hello) metrics.helloFrames += 1;
          else metrics.ignoredFrames += 1;
          yield frame;
        }
      } finally { subscribers -= 1; }
    },
  } };
}
function phaseSignal(context, controller) {
  return AbortSignal.any([shutdown.signal, AbortSignal.timeout(context.timeoutMs), controller.signal]);
}

async function equalityProof(context, seatId) {
  const controller = new AbortController();
  let direct;
  let unsupported = [];
  const { client, metrics } = instrument(context, phaseSignal(context, controller), {
    onSeats: (seats) => { direct = structuredClone(seats); },
    onState: (state) => { unsupported = state.unsupported.map(({ field }) => field); },
  });
  try {
    const before = performance.now();
    const rows = await context.createRsPijRecords({ client }).list();
    check(Array.isArray(direct), 'missing_direct_roster');
    const source = new Map(direct.map((seat) => [seat.id, seat]));
    const mapped = new Map(rows.map((row) => [row.id, row]));
    check(source.size === direct.length && mapped.size === rows.length, 'duplicate_roster_ids');
    equal([...mapped.keys()].sort(), [...source.keys()].sort(), 'roster_membership');
    if (seatId !== undefined) check(source.has(seatId), 'seat_not_found', { seat: seatId });
    const selected = seatId === undefined ? direct : [source.get(seatId)];
    const coverage = { tombstoned: 0, terminalNulls: 0, extraFields: 0, fields: {} };
    for (const seat of selected) {
      const expected = expectedRow(seat, unsupported, context.FLEET_ROW_FIELDS);
      const actual = mapped.get(seat.id);
      // Availability is a set; ordering is not part of the reader contract.
      const normalized = { ...actual, rsUnavailable: [...actual.rsUnavailable].sort() };
      const fields = new Set([...Object.keys(expected), ...Object.keys(normalized)]);
      for (const field of fields) {
        equal(Object.hasOwn(normalized, field), Object.hasOwn(expected, field), 'mapped_field_presence', { seat: seat.id, field });
        equal(normalized[field], expected[field], 'mapped_field_value', { seat: seat.id, field });
      }
      if (seat.tombstoned_at != null || seat.tombstone_reason != null) coverage.tombstoned += 1;
      if (expected.terminal && (expected.terminal.tombstoneCursor === null || expected.terminal.tombstoneReason === null)) coverage.terminalNulls += 1;
      for (const field of ['proc', 'semantic_state', 'role', 'model', 'provider', 'tombstoned_at', 'tombstone_reason']) {
        const counts = coverage.fields[field] ??= { missing: 0, null: 0, value: 0 };
        counts[!Object.hasOwn(seat, field) ? 'missing' : seat[field] === null ? 'null' : 'value'] += 1;
      }
      coverage.extraFields += Object.keys(seat).filter((field) => !context.FLEET_ROW_FIELDS.has(field) && !['proc', 'semantic_state', 'role', 'model', 'provider', 'tombstoned_at', 'tombstone_reason'].includes(field)).length;
    }
    result.count = selected.length;
    result.equality = { milliseconds: elapsed(before), rosterCount: direct.length, comparedCount: selected.length, coverage, ...metrics };
  } finally { controller.abort(); }
}

// Independent contract oracle: all additive facts survive except explicitly translated keys.
function expectedRow(seat, unsupported, consumed) {
  const translated = { semantic_state: 'semanticState', role: 'orchestrationRole', model: 'boundModel', provider: 'boundProvider' };
  const expected = { ...seat };
  for (const field of ['proc', 'tombstoned_at', 'tombstone_reason', ...Object.keys(translated)]) delete expected[field];
  for (const [source, destination] of Object.entries(translated)) {
    if (Object.hasOwn(seat, source)) expected[destination] = seat[source];
  }
  expected.pid = seat.proc?.pid ?? null;
  if (seat.tombstoned_at !== undefined || seat.tombstone_reason !== undefined) {
    expected.terminal = { source: 'pij-rs', tombstoneCursor: seat.tombstoned_at ?? null, tombstoneReason: seat.tombstone_reason ?? null };
  }
  const missing = new Set([...unsupported.map((field) => field === 'liveness:stale' ? 'liveness' : field), ...consumed]);
  for (const [field, value] of Object.entries(expected)) if (value !== undefined) missing.delete(field);
  expected.rsUnavailable = [...missing].sort();
  return expected;
}

async function authProof(context) {
  const directory = await mkdtemp(join(tmpdir(), 'verify-rs-reader-'));
  const keyPath = join(directory, 'daemon.key');
  const controller = new AbortController();
  const signal = phaseSignal(context, controller);
  try {
    for (const rotate of [true, false]) {
      await writeFile(keyPath, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
      const statuses = [];
      let attempts = 0;
      const before = performance.now();
      const client = context.createRsClient({ addr: context.addr, stateDir: directory, fetch: async (input, init) => {
        check(++attempts <= 2, 'auth_third_attempt', { rotate, attempts });
        const response = await fetch(input, { ...init, signal });
        statuses.push(response.status);
        if (rotate && statuses.length === 1 && response.status === 401) {
          // Copy bytes only after observing the real rejection. Production owns auth and retry.
          const key = await readFile(join(context.stateDir, 'daemon.key'));
          try { await writeFile(keyPath, key, { mode: 0o600 }); }
          finally { key.fill(0); }
        }
        return response;
      } });
      let failure;
      let seats;
      try { seats = await client.seats(); } catch (error) { failure = error; }
      result[rotate ? 'authRotation' : 'authSecondFailure'] = { milliseconds: elapsed(before), calls: statuses.length, attempts, statuses, count: seats?.length ?? 0 };
      check(attempts === 2, 'auth_attempt_count', { rotate, attempts });
      equal(statuses, rotate ? [401, 200] : [401, 401], 'auth_exactly_two_calls', { rotate, statuses });
      check(rotate ? !failure && Array.isArray(seats) : failure?.status === 401, 'auth_outcome', { rotate });
    }
    result.count = 4;
  } finally {
    controller.abort();
    await rm(directory, { recursive: true, force: true });
  }
}

async function highWater(context) {
  const controller = new AbortController();
  let reset;
  const { client, metrics } = instrument(context, phaseSignal(context, controller), {
    onResponse: async (response, url) => {
      if (url.pathname === '/v1/events' && response.status === 409) reset = await response.clone().json();
    },
  });
  const before = performance.now();
  try {
    const seats = await client.seats();
    const aliases = [...new Set(seats.map((seat) => seat.machine).filter((alias) => typeof alias === 'string'))];
    check(aliases.length > 0, 'cannot_discover_machine_alias');
    let failure;
    try { for await (const _frame of client.events(Object.fromEntries(aliases.map((alias) => [alias, Number.MAX_SAFE_INTEGER])), controller.signal)) {
      throw new ProofFailure('future_cursor_unexpectedly_opened_stream');
    } } catch (error) { failure = error; }
    check(failure?.status === 409 && reset?.error === 'cursor_reset', 'missing_cursor_reset_high_water');
    const newest = reset.data?.newest;
    // The daemon's reset is local-spine metadata, not a federation-wide high-water map.
    check(aliases.length === 1 && Number.isSafeInteger(newest) && newest > 0, 'unsupported_high_water_shape_or_aliases', { aliases: aliases.length });
    const target = { [aliases[0]]: newest };
    result.highWater = { target, milliseconds: elapsed(before), count: seats.length, ...metrics };
    return { target, seats };
  } finally { controller.abort(); }
}
function reached(observed, target) {
  return Object.entries(target).every(([alias, cursor]) => (observed[alias] ?? 0) >= cursor);
}
function observe(frame, observed) {
  if (frame.type === 'event') observed[frame.machine] = Math.max(observed[frame.machine] ?? 0, frame.cursor);
}
function rememberReport(frame, reports, states, revision) {
  const { kind, seat, payload: encoded } = frame.event;
  if (kind !== 'report.now' && kind !== 'report.state') return;
  let payload;
  try { payload = JSON.parse(encoded); } catch { return; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const at = new Date(frame.event.at).toISOString();
  if (kind === 'report.now') {
    if (typeof payload.did !== 'string' || typeof payload.next !== 'string') return;
    if ((reports.get(seat)?.seq ?? -1) < frame.cursor) reports.set(seat, {
      peer: seat, prev: payload.did, next: payload.next, ts: at, seq: frame.cursor,
    });
  } else {
    if ((payload.state !== null && typeof payload.state !== 'string') ||
        (payload.note !== null && typeof payload.note !== 'string') ||
        typeof payload.registry_seq !== 'number') return;
    if ((states.get(seat)?.seq ?? -1) < frame.cursor) states.set(seat, {
      seq: frame.cursor, revision, semanticState: payload.state,
      stateNote: payload.note === null ? null : { text: payload.note, state: payload.state, at },
    });
  }
}

async function transportReplay(context, target) {
  const controller = new AbortController();
  const { client, metrics } = instrument(context, phaseSignal(context, controller));
  const observed = {};
  const before = performance.now();
  try {
    for await (const frame of client.events(Object.fromEntries(Object.keys(target).map((alias) => [alias, 0])), controller.signal)) {
      observe(frame, observed);
      if (reached(observed, target)) break;
    }
    check(reached(observed, target), 'transport_ended_before_high_water');
  } finally {
    controller.abort();
    result.transport = { milliseconds: elapsed(before), observed, ...metrics,
      byteScope: 'Actual downloaded NDJSON bytes; the final network chunk may include frames beyond the target.' };
  }
}

async function replayProof(context, watchId, watchPane) {
  const watching = watchId !== undefined || watchPane !== undefined;
  const matchesWatch = (row) => watchId !== undefined ? row.id === watchId : row.extra?.pane === watchPane;
  const { target, seats } = await highWater(context);
  if (watching) check(!seats.some((seat) => watchId !== undefined ? seat.id === watchId : seat.pane === watchPane),
    'watch_target_already_registered', { seat: watchId, pane: watchPane });
  else await transportReplay(context, target);
  const [{ createRsEventStream }, { createPijPoller }] = await Promise.all([
    import(new URL('rs/rs-event-stream.ts', ROOT)), import(new URL('pij-poller.service.ts', ROOT)),
  ]);
  const controller = new AbortController();
  // Bootstrap, trigger input, and arrival each have a finite deadline.
  const signal = AbortSignal.any([shutdown.signal, controller.signal]);
  let latestSeats = [];
  let lastRead;
  let eventVersion = 0;
  const { client, metrics } = instrument(context, signal, { onSeats: (rows) => { latestSeats = rows; } });
  const records = context.createRsPijRecords({ client });
  const observed = {};
  const reports = new Map();
  const stateReports = new Map();
  const descriptorCursors = new Map();
  const pending = new Set();
  const caughtUp = deferred();
  const arrived = deferred();
  const stopped = deferred();
  const refresh = { requested: 0, reads: 0, active: 0, maxConcurrent: 0 };
  const broadcasts = {};
  const streamStatuses = {};
  const before = performance.now();
  let firstPut;
  const firstPuts = new Map();
  let appearedAt;
  let appearedMonotonic;
  let trigger;
  const pushedFrames = [];
  let readyAt;
  let stream;
  let applicationFailure;
  const watchEvidence = () => ({ seat: watchId, pane: watchPane, readyAt, trigger, appearedAt, appearedMonotonic, firstPut, pushedFrames });
  const poller = createPijPoller({
    // A guard, not a fake backend: any attempted legacy read fails this live rs proof.
    cursor: { seq: 0, async read() { throw new ProofFailure('unexpected_legacy_spine_read'); } },
    records: { state: (id) => records.state(id), async list() {
      refresh.reads += 1;
      refresh.maxConcurrent = Math.max(refresh.maxConcurrent, ++refresh.active);
      const startedVersion = eventVersion;
      try {
        const rows = await records.list();
        lastRead = { seats: latestSeats, startedVersion };
        return rows;
      } finally { refresh.active -= 1; }
    } },
    pollSpine: false, pollRecords: false,
    broadcast: (_channel, type) => { broadcasts[type] = (broadcasts[type] ?? 0) + 1; },
    logger: { warn() { applicationFailure = new ProofFailure('poller_warning'); } },
  });
  async function apply(frame) {
    eventVersion += 1;
    observe(frame, observed);
    rememberReport(frame, reports, stateReports, eventVersion);
    if (DESCRIPTORS.has(frame.event.kind)) {
      descriptorCursors.set(frame.event.seat, Math.max(descriptorCursors.get(frame.event.seat) ?? 0, frame.cursor));
    }
    if (trigger && metrics.connections === trigger.connection && /^(message|delivery|spawn)\./.test(frame.event.kind)) {
      pushedFrames.push({ kind: frame.event.kind, machine: frame.machine, cursor: frame.cursor, at: frame.event.at, connection: metrics.connections });
    }
    if (watching && frame.event.kind === 'seat.put' && !firstPuts.has(frame.event.seat)) {
      firstPuts.set(frame.event.seat, { cursor: frame.cursor, machine: frame.machine, at: frame.event.at, connection: metrics.connections });
    }
    poller.ingest(frame);
    if (DESCRIPTORS.has(frame.event.kind)) {
      refresh.requested += 1;
      await poller.refreshRecords();
      if (watching && appearedAt === undefined) {
        const rows = poller.snapshot().rows.filter(matchesWatch);
        check(rows.length <= 1, 'watch_pane_matches_multiple_seats', { ...watchEvidence(), count: rows.length });
        if (rows.length === 1) {
          watchId = rows[0].id;
          appearedAt = Date.now();
          appearedMonotonic = performance.now();
        }
      }
    }
    if (watching && watchId !== undefined) firstPut ??= firstPuts.get(watchId);
    if (reached(observed, target)) caughtUp.resolve();
    if (firstPut && appearedAt !== undefined) arrived.resolve();
  }
  try {
    await bounded(poller.start(), phaseSignal(context, controller), 'bootstrap_timeout');
    check(!poller.snapshot().status.lastError, 'initial_records_failed');
    if (watching) check(!poller.snapshot().rows.some(matchesWatch), 'watch_seat_created_before_ready', watchEvidence());
    stream = createRsEventStream({ client, onEvent: (frame) => {
      const work = apply(frame);
      pending.add(work);
      void work.then(() => pending.delete(work), (error) => { pending.delete(work); applicationFailure = error; });
      return work;
    }, onStatus: (status) => {
      streamStatuses[status.state] = (streamStatuses[status.state] ?? 0) + 1;
      if (status.state === 'stopped') stopped.resolve();
    } });
    stream.start();
    await bounded(caughtUp.promise, phaseSignal(context, controller), 'integrated_high_water_timeout');
    await bounded(Promise.all([...pending]), phaseSignal(context, controller), 'integrated_refresh_timeout');
    if (watching) {
      check(firstPut === undefined && appearedAt === undefined, 'watch_seat_created_before_ready', watchEvidence());
      readyAt = Date.now();
      const input = createInterface({ input: process.stdin, terminal: false });
      try {
        const marked = new Promise((resolve, reject) => {
          input.once('line', (line) => {
            if (line.trim() !== 'trigger') {
              reject(new ProofFailure('watch_expected_trigger_marker', watchEvidence()));
              return;
            }
            trigger = { at: Date.now(), monotonicMs: performance.now(), connection: metrics.connections };
            resolve();
          });
          input.once('close', () => reject(new ProofFailure('watch_trigger_input_closed', watchEvidence())));
        });
        console.log(JSON.stringify({ command: result.command, mode: result.mode, ready: true, seat: watchId, pane: watchPane, target, readyAt, timeoutMs: context.timeoutMs }));
        await bounded(marked, phaseSignal(context, controller), 'watch_trigger_timeout');
      } finally { input.close(); }
      check(appearedMonotonic === undefined || appearedMonotonic >= trigger.monotonicMs, 'watch_appearance_preceded_trigger', watchEvidence());
      console.log(JSON.stringify({ command: result.command, mode: result.mode, triggerReady: true, ...watchEvidence() }));
      await bounded(arrived.promise, phaseSignal(context, controller), 'watch_seat_timeout');
      check(appearedMonotonic >= trigger.monotonicMs, 'watch_appearance_preceded_trigger', watchEvidence());
      const appearanceMs = Math.round((appearedMonotonic - trigger.monotonicMs) * 100) / 100;
      check(appearanceMs <= 10000, 'watch_appearance_exceeded_10s', { ...watchEvidence(), milliseconds: appearanceMs });
      check(firstPut.connection > trigger.connection, 'watch_put_not_observed_on_reconnect', watchEvidence());
      const beforeDelivery = metrics.since.filter(({ connection }) => connection <= firstPut.connection);
      check(beforeDelivery.every(({ since }) => since && (since[firstPut.machine] ?? 0) < firstPut.cursor),
        'resume_skipped_first_seat_put', { ...watchEvidence(), beforeDelivery });
      const controls = pushedFrames.filter((frame) => frame.machine === firstPut.machine && frame.cursor > firstPut.cursor);
      check(controls.length > 0, 'watch_missing_pushed_burn_control', watchEvidence());
      result.arrival = { ...watchEvidence(), milliseconds: appearanceMs, clock: 'local-monotonic-trigger-upper-bound', checkedSinceMaps: beforeDelivery.length, controls };
    }
    // Abort before a final snapshot so no later frame can race the finite comparison.
    stream.stop();
    await bounded(stopped.promise, phaseSignal(context, controller), 'stream_stop_timeout');
    await bounded(Promise.all([...pending]), phaseSignal(context, controller), 'final_refresh_timeout');
    if (applicationFailure) throw applicationFailure;
    const snapshot = poller.snapshot();
    check(!snapshot.status.lastError, 'integrated_records_failed');
    check(snapshot.status.running, 'poller_not_running');
    check(reached(observed, target), 'integrated_ended_before_high_water');
    check(metrics.maxSubscribers === 1, 'subscriber_fanout', { maxSubscribers: metrics.maxSubscribers });
    check(refresh.maxConcurrent === 1, 'records_refresh_fanout', { maxConcurrentReads: refresh.maxConcurrent });
    const visible = new Set(snapshot.rows.map((row) => row.id));
    const expectedCards = [...reports.values()].filter((card) => visible.has(card.peer)).sort((a, b) => a.peer.localeCompare(b.peer));
    equal([...snapshot.statuses].sort((a, b) => a.peer.localeCompare(b.peer)), expectedCards, 'integrated_status_cards');
    check(expectedCards.length > 0, 'no_status_cards_exercised');
    check(lastRead !== undefined, 'missing_integrated_direct_roster');
    const directRows = new Map(lastRead.seats.map((seat) => [seat.id, seat]));
    equal([...visible].sort(), [...directRows.keys()].sort(), 'integrated_roster_membership');
    let semanticReports = 0;
    for (const row of snapshot.rows) {
      const direct = directRows.get(row.id);
      const report = stateReports.get(row.id);
      // The last successful descriptor read is authoritative, except a newer report delivered
      // during/after that read which is beyond this seat's last observed descriptor cursor.
      const reportIsNewer = report && report.revision > lastRead.startedVersion &&
        report.seq > (descriptorCursors.get(row.id) ?? 0);
      const semanticState = reportIsNewer ? report.semanticState : direct.semantic_state;
      const stateNote = !report ? direct.stateNote : semanticState != null && semanticState === report.semanticState
        ? report.stateNote : null;
      equal(row.state, direct.state, 'integrated_mechanical_state', { seat: row.id });
      equal(row.extra.semanticState, semanticState, 'integrated_semantic_state', { seat: row.id, reportCursor: report?.seq, descriptorCursor: descriptorCursors.get(row.id) });
      equal(row.extra.stateNote, stateNote, 'integrated_state_note', { seat: row.id });
      if (report) semanticReports += 1;
    }
    result.count = metrics.eventFrames;
    result.integrated = {
      milliseconds: elapsed(before), observed, ...metrics, refresh, broadcasts, streamStatuses,
      rowCount: snapshot.rows.length, statusCards: snapshot.statuses.length, expectedStatusCards: expectedCards.length, semanticReports,
      byteScope: 'Actual downloaded NDJSON bytes; the final network chunk may include frames beyond the target.',
    };
  } finally {
    stream?.stop();
    controller.abort();
    poller.stop();
    await Promise.allSettled([...pending]);
    if (watching) result.watch = watchEvidence();
    result.count = metrics.eventFrames;
    result.integrated = {
      ...result.integrated, milliseconds: elapsed(before), observed, ...metrics, refresh, broadcasts, streamStatuses,
    };
  }
}

try { await main(); }
catch (error) {
  result.ok = false;
  result.milliseconds = elapsed(started);
  // Never stringify daemon responses, request headers, raw error messages, or bearer material.
  result.errors.push(error instanceof ProofFailure
    ? { check: error.check, ...error.details }
    : { check: shutdown.signal.aborted ? 'interrupted' : 'operation_failed', type: error?.name ?? 'Error', ...(Number.isInteger(error?.status) ? { status: error.status } : {}) });
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally {
  shutdown.abort();
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
