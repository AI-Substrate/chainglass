import {
  type PijStatusRecord,
  STATUS_STALE_MS,
  fakeStatusRecord,
  newestStatusByPeer,
  readSeatRole,
  resolveSeatStatus,
} from '@/features/089-first-class-pij/server/pij-status.contract';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-07-29T00:30:00.000Z');

function status(overrides: Partial<PijStatusRecord> = {}): PijStatusRecord {
  return fakeStatusRecord({
    peer: fakeStatusRecord().peer,
    prev: 'Finished the contract tests.',
    next: 'Implement the contract seam.',
    ts: new Date(NOW - 1_000).toISOString(),
    seq: 10,
    ...overrides,
  });
}

describe('JC-1 status consumption', () => {
  it('selects the newest record by spine seq, not producer timestamp', () => {
    const records = [
      status({ seq: 10, ts: '2026-07-29T00:29:59.000Z', prev: 'older seq' }),
      status({ seq: 12, ts: '2026-07-29T00:00:00.000Z', prev: 'newest seq' }),
      status({ seq: 11, ts: '2026-07-29T00:30:01.000Z', prev: 'newest clock' }),
    ];

    expect(newestStatusByPeer(records).get(fakeStatusRecord().peer)?.prev).toBe('newest seq');
  });

  it('treats the exact threshold as current and one millisecond beyond it as stale', () => {
    const role = readSeatRole({ orchestrationRole: 'pm' });

    expect(
      resolveSeatStatus(role, status({ ts: new Date(NOW - STATUS_STALE_MS).toISOString() }), NOW)
        .reason
    ).toBe('current');

    const stale = resolveSeatStatus(
      role,
      status({ ts: new Date(NOW - STATUS_STALE_MS - 1).toISOString() }),
      NOW
    );
    expect(stale.reason).toBe('status-stale');
    expect(stale.status?.prev).toBe('Finished the contract tests.');
  });

  it.each([
    ['not-a-pm', { orchestrationRole: 'worker' }, status()],
    ['role-unknown', { orchestrationRole: null }, status()],
    ['role-unknown', {}, status()],
    ['no-status-yet', { orchestrationRole: 'pm' }, undefined],
  ] as const)('returns the %s data-reason discriminator', (reason, record, latest) => {
    expect(resolveSeatStatus(readSeatRole(record), latest, NOW).reason).toBe(reason);
  });
});
