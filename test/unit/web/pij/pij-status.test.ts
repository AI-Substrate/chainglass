import {
  type PijStatusRecord,
  STATUS_STALE_MS,
  carriesStatus,
  fakeStatusRecord,
  newestStatusByPeer,
  readSeatRole,
  readWatchdogState,
  resolveSeatStatus,
  watchdogSummary,
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
    ['not-a-pm', { orchestrationRole: 'pa' }, status()],
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

describe('JC-2 role vocabulary — three absences, and `pa` (s078)', () => {
  it('reads `pa` as a known role and gives it no status obligation', () => {
    /*
    Test Doc:
    - Why: s078 widened the ratified enum to a fourth value. A Prime Assistant is a real designation,
      so it must read as KNOWN — but it owes the human no prev/next of its own (cheetah's render
      ruling, 2026-07-31): what it owes them is a working PRIME card.
    - Contract: `pa` → `{kind:'known'}`; `carriesStatus` false; the status path resolves 'not-a-pm',
      the silent-absence branch — no nag, no stale label, no watchdog promise.
    - Usage Notes: —
    - Quality Contribution: pins that widening the vocabulary did not widen the card obligation.
    - Worked Example: readSeatRole({orchestrationRole:'pa'}) → known 'pa'.
    */
    const role = readSeatRole({ orchestrationRole: 'pa' });
    expect(role).toEqual({ kind: 'known', role: 'pa' });
    expect(carriesStatus(role)).toBe(false);
  });

  it('distinguishes an unrecognised role from an undesignated one and from a missing key', () => {
    /*
    Test Doc:
    - Why: `null` and an unknown string used to collapse into one `role-unknown`. They are different
      observations: `null` is pij ANSWERING "undesignated"; an unknown string is pij designating
      something this consumer has not been taught. Reading the second as the first renders a
      vocabulary gap in the rail as a fact about the seat — the absence defect at the value level,
      found while ratifying s078 (2026-07-31).
    - Contract: missing key → 'role-field-absent'; `null` → 'role-unknown'; any other unmatched
      value → 'role-unrecognised'.
    - Usage Notes: the render says "role not recognised" for the third, blaming the rail not the seat.
    - Quality Contribution: makes the NEXT enum widening visible as an untaught label rather than a
      silent mislabel.
    - Worked Example: {orchestrationRole:'quartermaster'} → absent/'role-unrecognised'.
    */
    expect(readSeatRole({})).toEqual({ kind: 'absent', reason: 'role-field-absent' });
    expect(readSeatRole({ orchestrationRole: null })).toEqual({
      kind: 'absent',
      reason: 'role-unknown',
    });
    expect(readSeatRole({ orchestrationRole: 'quartermaster' })).toEqual({
      kind: 'absent',
      reason: 'role-unrecognised',
    });
  });
});

describe('watchdog axis — the nudge promise is read, never assumed', () => {
  it.each([
    ['armed', { intervalMs: 1_200_000 }, true],
    ['paused', { pausedBy: 'self', intervalMs: 1_200_000 }, false],
    ['exempt', { exempt: true, exemptRemainingMs: 600_000 }, false],
    ['fleet-disabled', { globallyDisabled: true }, false],
    ['relay', { relay: true }, false],
    ['off', { enabled: false }, false],
  ] as const)(
    'reads %s and only promises a nudge when one fires',
    (reason, watchdog, willNudge) => {
      /*
    Test Doc:
    - Why: the rail told a human "watchdog will nudge" beside a card whose seat was
      `paused (self)` — a promise about daemon behaviour that nothing had measured (caught live
      2026-07-30). Every branch that does NOT nudge must be readable as such.
    - Contract: each shape maps to its reason, and `willNudge` is true for `armed` alone.
    - Usage Notes: shapes mirror `pij list --json`'s watchdog object.
    - Quality Contribution: makes a false nudge promise unreachable from any real state.
    - Worked Example: { pausedBy: 'self' } → reason 'paused', willNudge false.
    */
      const state = readWatchdogState({ watchdog });
      expect(state.reason).toBe(reason);
      expect(state.willNudge).toBe(willNudge);
    }
  );

  it('applies the strongest-wins ladder and never guesses when the field is absent', () => {
    /*
    Test Doc:
    - Why: C9's tiers overlap on real records — an exempt seat also carries a pausedBy, a relay
      seat carries everything. Reading the wrong one understates why no nudge is coming. And a
      record with NO watchdog field is not a seat with the watchdog off: claiming either way is
      the absence-as-evidence defect.
    - Contract: relay > fleet-disabled > off > exempt > paused > armed; a missing field reads
      'unreported' with no nudge promise.
    - Usage Notes: —
    - Quality Contribution: pins precedence and the honest-absence member together.
    - Worked Example: { relay: true, pausedBy: 'self', exempt: true } → 'relay'.
    */
    expect(
      readWatchdogState({ watchdog: { relay: true, exempt: true, pausedBy: 'self' } }).reason
    ).toBe('relay');
    expect(readWatchdogState({ watchdog: { exempt: true, pausedBy: 'self' } }).reason).toBe(
      'exempt'
    );
    expect(
      readWatchdogState({ watchdog: { globallyDisabled: true, pausedBy: 'self' } }).reason
    ).toBe('fleet-disabled');

    const absent = readWatchdogState({});
    expect(absent.reason).toBe('unreported');
    expect(absent.willNudge).toBe(false);
    expect(watchdogSummary(absent)).toBe('watchdog not reported');
  });
});
