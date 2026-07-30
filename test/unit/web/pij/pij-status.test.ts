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
    ['prime-not-written', { orchestrationRole: 'prime' }, undefined],
  ] as const)('returns the %s data-reason discriminator', (reason, record, latest) => {
    expect(resolveSeatStatus(readSeatRole(record), latest, NOW).reason).toBe(reason);
  });

  it('renders a prime card that exists, and never calls it stale (optional-but-rendered ruling)', () => {
    /*
    Test Doc:
    - Why: Jordan's ruling (2026-07-30, relayed by albatross): prime cards are NOT REQUIRED but ARE
      RENDERED. Not-required has two consequences a PM's path must not leak in: no absence nag
      (covered by the discriminator case above) and no stale label — the stale reason carries
      watchdog language, and no watchdog obligation exists for an optional card.
    - Contract: prime + record → 'current' with the record and a real age, even past the PM stale
      threshold; the age line is what makes an old card visibly old.
    - Usage Notes: —
    - Quality Contribution: pins that 'optional' was implemented as a distinct policy, not by
      reusing the PM path.
    - Worked Example: a record older than STATUS_STALE_MS resolves 'current', ageMs > threshold.
    */
    const role = readSeatRole({ orchestrationRole: 'prime' });
    const old = resolveSeatStatus(
      role,
      status({ ts: new Date(NOW - STATUS_STALE_MS - 60_000).toISOString() }),
      NOW
    );
    expect(old.reason).toBe('current');
    expect(old.status?.prev).toBe('Finished the contract tests.');
    expect(old.ageMs).toBeGreaterThan(STATUS_STALE_MS);
  });
});
