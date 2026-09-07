import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  RsClient,
  RsCursorEvent,
  RsEvent,
  RsSeat,
  RsStateReport,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import {
  type RsEventStreamOptions,
  createRsEventStream,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-event-stream';
import {
  getPijPoller,
  pijRsAddr,
  pijRsStateDir,
  pijSource,
  resetPijPollerForTests,
} from '../../../../apps/web/src/features/089-first-class-pij/server/start-pij-poller';
import ROLE_ROW from '../../../../docs/plans/093-pij-rs-reader/assets/inputs/live-role-prime-2026-09-07.json';

const roleFrame = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '../../../../docs/plans/093-pij-rs-reader/assets/inputs/live-role-set-20991.ndjson'
    ),
    'utf8'
  )
) as RsCursorEvent;

const captured = readFileSync(
  join(
    import.meta.dirname,
    '../../../../docs/plans/093-pij-rs-reader/assets/inputs/live-report-frames-6012-14473.ndjson'
  ),
  'utf8'
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as RsCursorEvent);

class BootstrapRsClient implements RsClient {
  seatReads = 0;

  constructor(private readonly responses: Array<Promise<RsSeat[]>>) {}

  async seats(): Promise<RsSeat[]> {
    this.seatReads += 1;
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected descriptor read');
    return response;
  }

  async state(id: string): Promise<RsStateReport> {
    return { id, unsupported: [] };
  }

  events(): AsyncIterable<RsEvent> {
    throw new Error('This test invokes the production onEvent callback without a socket');
  }
}

afterEach(() => {
  resetPijPollerForTests();
});

describe('pij-rs source selection', () => {
  it('defaults to rs and retains explicit legacy selection', () => {
    expect(pijSource({})).toBe('rs');
    expect(pijSource({ PIJ_SOURCE: 'legacy' })).toBe('legacy');
    expect(pijSource({ PIJ_SOURCE: 'rs' })).toBe('rs');
    expect(pijSource({ PIJ_SOURCE: 'unexpected' })).toBe('rs');
  });

  it('warns only when constructing an unrecognised source and keeps env selection pure', () => {
    const warnings: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      for (const source of [undefined, 'rs', 'legacy', '', 'RS', 'unexpected']) {
        const env = { PIJ_SOURCE: source, PIJ_POLLER: 'on' };
        expect(pijSource(env)).toBe(source === 'legacy' ? 'legacy' : 'rs');
        expect(warnings).toEqual([]);
        const poller = getPijPoller(env);
        expect(getPijPoller(env)).toBe(poller);
        if (source === undefined || source === 'rs' || source === 'legacy') {
          expect(warnings).toEqual([]);
        } else {
          expect(warnings).toEqual([
            [
              `[pij] unrecognised PIJ_SOURCE=${JSON.stringify(source)}; defaulting to rs. Set PIJ_SOURCE=rs or PIJ_SOURCE=legacy.`,
            ],
          ]);
        }
        resetPijPollerForTests();
        warnings.length = 0;
      }
    } finally {
      console.warn = warn;
    }
  });

  it('honours rs transport configuration without changing its defaults', () => {
    expect(pijRsAddr({})).toBe('127.0.0.1:7461');
    expect(pijRsAddr({ PIJ_RS_ADDR: '127.0.0.1:9999' })).toBe('127.0.0.1:9999');
    expect(pijRsStateDir({ PIJ_RS_STATE_DIR: '/scratch/pij-rs' })).toBe('/scratch/pij-rs');
    expect(pijRsStateDir({})).toMatch(/\.pij-rs$/);
  });
});

describe('getPijPoller rs event composition', () => {
  it('refreshes the captured asserted role and fences a stale declaration through production dispatch', async () => {
    const oldReport = captured.find(
      (frame) =>
        frame.event.kind === 'report.state' &&
        JSON.parse(frame.event.payload).state !== ROLE_ROW.semantic_state
    );
    if (!oldReport) throw new Error('Missing distinct captured declaration');
    // Scripted race around an unchanged role-set capture, not a captured daemon timeline.
    // Only the historical report identity/cursor are rebound; its payload stays unchanged.
    const staleReport: RsCursorEvent = {
      ...oldReport,
      machine: roleFrame.machine,
      cursor: roleFrame.cursor - 1,
      event: { ...oldReport.event, seat: roleFrame.event.seat },
    };
    let release!: (rows: RsSeat[]) => void;
    const client = new BootstrapRsClient([
      Promise.resolve([
        { ...ROLE_ROW, role: null, semantic_state: JSON.parse(staleReport.event.payload).state },
      ]),
      new Promise<RsSeat[]>((resolve) => {
        release = resolve;
      }),
    ]);
    let onEvent!: RsEventStreamOptions['onEvent'];
    const poller = getPijPoller(
      { PIJ_SOURCE: 'rs' },
      {
        rsClient: client,
        createEventStream(options) {
          onEvent = options.onEvent;
          return createRsEventStream(options);
        },
      }
    );
    await poller.refreshRecords();
    expect(poller.snapshot().rows[0].orchestrationRole).toBeNull();
    expect(roleFrame.cursor).toBe(20991);
    expect(JSON.parse(roleFrame.event.payload).record.role).toBe('prime');
    const refreshing = onEvent(roleFrame);
    expect(client.seatReads).toBe(2);
    await onEvent(staleReport);
    release([ROLE_ROW]);
    await refreshing;
    expect(poller.snapshot().rows[0]).toMatchObject({
      id: ROLE_ROW.id,
      orchestrationRole: 'prime',
      extra: { semanticState: ROLE_ROW.semantic_state },
    });
    expect(poller.snapshot().status.lastError).toBeNull();
  });

  it.each(['spawn.bound', 'spawn.failed'])(
    'refreshes descriptors for %s and fences late reports through the production onEvent',
    async (kind) => {
      const report = captured.find((frame) => frame.event.kind === 'report.state');
      const card = captured.find((frame) => frame.event.kind === 'report.now');
      const spawn = captured.find((frame) => frame.event.kind === kind);
      if (!report || !card || !spawn) throw new Error('Missing captured report/spawn frames');
      // Scripted regression, NOT a wire capture: only this spawn's identity/cursor are rebound.
      // Its captured payload and timestamp, and both captured report frames, stay unchanged.
      const pushed: RsCursorEvent = {
        ...spawn,
        cursor: report.cursor + 1,
        event: { ...spawn.event, seat: report.event.seat },
      };
      const row: RsSeat = {
        id: report.event.seat,
        machine: report.machine,
        folder: '/scripted-regression',
        state: 'idle',
        semantic_state: null,
      };
      let release!: (rows: RsSeat[]) => void;
      const client = new BootstrapRsClient([
        Promise.resolve([{ ...row, semantic_state: JSON.parse(report.event.payload).state }]),
        new Promise<RsSeat[]>((resolve) => {
          release = resolve;
        }),
      ]);
      let onEvent!: RsEventStreamOptions['onEvent'];
      const poller = getPijPoller(
        { PIJ_SOURCE: 'rs', PIJ_POLLER: 'off' },
        {
          rsClient: client,
          createEventStream(options) {
            // Capture the actual bootstrap closure, never reproduce its dispatch in the test.
            onEvent = options.onEvent;
            return createRsEventStream(options);
          },
        }
      );
      await poller.refreshRecords();
      expect(client.seatReads).toBe(1);
      expect(poller.snapshot().rows[0].extra.semanticState).toBe(
        JSON.parse(report.event.payload).state
      );
      const refreshing = onEvent(pushed);
      expect(client.seatReads).toBe(2);
      await onEvent(report);
      release([row]);
      await refreshing;
      expect(poller.snapshot().rows[0]).toMatchObject({
        state: 'idle',
        extra: { semanticState: null, stateNote: null },
      });
      await onEvent(report);
      await onEvent(card);
      expect(poller.snapshot().rows[0].extra.semanticState).toBeNull();
      expect(poller.snapshot().statuses).toEqual([
        {
          peer: card.event.seat,
          prev: JSON.parse(card.event.payload).did,
          next: JSON.parse(card.event.payload).next,
          seq: card.cursor,
          ts: new Date(card.event.at).toISOString(),
        },
      ]);
      expect(client.seatReads).toBe(2);
      expect(poller.snapshot().status.lastError).toBeNull();
    }
  );
});
