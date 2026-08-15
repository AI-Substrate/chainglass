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
  it('renders a PA card that exists, and never calls it stale (optional-but-rendered)', () => {
    /*
    Test Doc:
    - Why: caught against the FIRST LIVE PA (`pij-missing-anaconda`, 2026-08-01). The ratified render
      said a PA carries no card, and this consumer implemented that as `not-a-pm` — which renders
      nothing, ever. The seat then wrote a real card ("Completed PA sweep 2 & registered watchdog on
      pij-wee-albatross") and the rail dropped it. "Owes no card" is not "has no card": exactly the
      error albatross made about PRIME cards on 2026-07-30, which this consumer corrected them on,
      and then reproduced itself one role over.
    - Contract: a PA is the same optional-but-rendered policy as a prime — a written card resolves
      'current' with a real age even past the PM stale threshold, and never a stale label, because
      the stale line carries watchdog language and no obligation exists to breach.
    - Usage Notes: absence stays silent, under its OWN discriminator — see the next test.
    - Quality Contribution: makes the difference between the obligation axis and the render axis
      structural, so widening the role vocabulary again cannot re-collapse them.
    - Worked Example: a PA card older than STATUS_STALE_MS resolves 'current', not 'status-stale'.
    */
    const role = readSeatRole({ orchestrationRole: 'pa' });
    const old = resolveSeatStatus(
      role,
      status({ ts: new Date(NOW - STATUS_STALE_MS - 60_000).toISOString() }),
      NOW
    );
    expect(old.reason).toBe('current');
    expect(old.status?.prev).toBe('Finished the contract tests.');
    expect(old.ageMs).toBeGreaterThan(STATUS_STALE_MS);
  });

  it('reads `pa` as a known role and gives it no status OBLIGATION', () => {
    /*
    Test Doc:
    - Why: s078 widened the ratified enum to a fourth value. A Prime Assistant is a real designation,
      so it must read as KNOWN — but it owes the human no prev/next of its own (cheetah's render
      ruling, 2026-07-31): what it owes them is a working PRIME card.
    - Contract: `pa` → `{kind:'known'}`; `carriesStatus` false — a PA is never nagged for a card and
      never stale-labelled.
    - Usage Notes: `carriesStatus` is the OBLIGATION axis only. Whether a card RENDERS is
      `hasOptionalCard`, and conflating the two is what dropped the first live PA's card.
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

  it('keeps the two optional-card silences apart', () => {
    /*
    Test Doc:
    - Why: a prime with no card and a PA with no card both render nothing, so it is tempting to give
      them one member. They are different silences with different causes, and the moment either
      grows a policy (a digest, an audit, a nag) the merged member cannot express it. Same rule that
      made `prime-not-written` distinct from `no-status-yet` in the first place.
    - Contract: prime + no record → 'prime-not-written'; pa + no record → 'pa-not-written'; both
      carry no record and no age.
    - Usage Notes: the render maps both to null; the distinction is for the data, not the pixels.
    - Quality Contribution: stops a future "they render the same, so collapse them" refactor.
    - Worked Example: readSeatRole({orchestrationRole:'pa'}) + undefined → 'pa-not-written'.
    */
    expect(resolveSeatStatus(readSeatRole({ orchestrationRole: 'pa' }), undefined, NOW)).toEqual({
      reason: 'pa-not-written',
    });
    expect(resolveSeatStatus(readSeatRole({ orchestrationRole: 'prime' }), undefined, NOW)).toEqual(
      {
        reason: 'prime-not-written',
      }
    );
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

  describe('never-fired — a config-armed watchdog that has never actually nudged', () => {
    const NOW = Date.parse('2026-08-09T12:00:00.000Z');
    const INTERVAL = 1_200_000; // 20m, the fleet default

    /** The real shape from `pij list --json`: enabled, unpaused, unexempt, `lastFireAt: null`. */
    const neverFired = { enabled: true, intervalMs: INTERVAL, pausedBy: null, lastFireAt: null };
    const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

    it('reads never-fired and refuses the nudge promise when overdue', () => {
      /*
      Test Doc:
      - Why: Jordan caught the rail rendering "watchdog on" for pij-respectable-clam — role pm,
        roleNeedsSupervision true, never nudged once, 131 minutes overdue. Every rung of the
        ladder was a CONFIG field, so a seat could be enabled/unpaused/unexempt and rendered
        armed while demonstrably unsupervised.
      - Contract: never fired AND past due → reason 'never-fired', willNudge false, overdueMs set.
      - Usage Notes: shape is copied from the live record, not invented.
      - Quality Contribution: closes the file's own stated contract one level deeper than the
        original instrument reached.
      - Worked Example: lastFireAt null + statusAt 151m ago + interval 20m → 131m overdue.
      */
      const state = readWatchdogState({ watchdog: neverFired, statusAt: at(151 * 60_000) }, NOW);

      expect(state.reason).toBe('never-fired');
      expect(state.willNudge).toBe(false);
      expect(Math.round((state.overdueMs ?? 0) / 60_000)).toBe(131);
      expect(watchdogSummary(state)).toBe('watchdog on · never nudged · 131m overdue');
    });

    it('leaves a fresh seat ARMED — the bound that keeps this from becoming noise', () => {
      /*
      Test Doc:
      - Why: THE FALSE-RED GUARD, and the reason both conditions are required. A newly spawned
        seat has also never fired. If never-fired alone triggered, the badge would fire on every
        new seat and people would learn to ignore it — spending exactly the credibility this
        check exists to restore. A test that only proves the new state APPEARS has not shown it
        is BOUNDED.
      - Contract: never fired but NOT yet due → still 'armed', still willNudge true.
      - Usage Notes: 5m quiet against a 20m interval — comfortably inside the window.
      - Quality Contribution: makes the check's silence on healthy seats an asserted property.
      - Worked Example: lastFireAt null + statusAt 5m ago + interval 20m → armed.
      */
      const state = readWatchdogState({ watchdog: neverFired, statusAt: at(5 * 60_000) }, NOW);

      expect(state.reason).toBe('armed');
      expect(state.willNudge).toBe(true);
      expect(state.overdueMs).toBeUndefined();
    });

    it('treats lastFireAt PRESENT-AND-NULL as never fired, not as a missing key', () => {
      /*
      Test Doc:
      - Why: the brief described lastFireAt as key-absent; `pij list --json` ships it as
        present-and-null on 730 of 770 records with a watchdog object. An `in` or hasOwnProperty
        test would therefore never fire in production while passing a hand-built fixture that
        omitted the key — a dead check that looks tested.
      - Contract: null, absent, and unparseable all mean never fired; a real timestamp does not.
      - Usage Notes: —
      - Quality Contribution: pins the distinction that decides whether this code runs at all.
      - Worked Example: lastFireAt '' → never fired; lastFireAt a real ISO string → armed.
      */
      const overdue = { statusAt: at(151 * 60_000) };
      for (const lastFireAt of [null, undefined, '', 'not-a-date']) {
        expect(
          readWatchdogState({ watchdog: { ...neverFired, lastFireAt }, ...overdue }, NOW).reason
        ).toBe('never-fired');
      }

      // A seat that HAS fired is class B — out of scope, and must not be caught by this rung.
      expect(
        readWatchdogState(
          { watchdog: { ...neverFired, lastFireAt: at(200 * 60_000) }, ...overdue },
          NOW
        ).reason
      ).toBe('armed');
    });

    it('never outranks a reason that already explains the silence', () => {
      /*
      Test Doc:
      - Why: an exempt or paused seat has ALSO never fired and is ALSO overdue — mine was, after
        a bounded exempt. Reporting 'never-fired' there would replace the true, actionable cause
        with a vaguer one.
      - Contract: the config rungs keep precedence; never-fired sits last, just above armed.
      - Usage Notes: —
      - Quality Contribution: keeps the new rung from degrading existing diagnoses.
      - Worked Example: exempt + lastFireAt null + 151m overdue → 'exempt'.
      */
      const overdue = { statusAt: at(151 * 60_000) };
      expect(
        readWatchdogState({ watchdog: { ...neverFired, exempt: true }, ...overdue }, NOW).reason
      ).toBe('exempt');
      expect(
        readWatchdogState({ watchdog: { ...neverFired, pausedBy: 'self' }, ...overdue }, NOW).reason
      ).toBe('paused');
      expect(
        readWatchdogState({ watchdog: { ...neverFired, enabled: false }, ...overdue }, NOW).reason
      ).toBe('off');
    });

    it('stays armed when the record cannot support the arithmetic', () => {
      /*
      Test Doc:
      - Why: a seat that has never written a card has no statusAt, and the daemon anchors on
        max(statusAt, startedAt) — a field this record does not carry. With no anchor there is no
        honest overdue, and guessing one would fire on seats that were merely new.
      - Contract: missing/unparseable statusAt, or a missing interval, falls back to 'armed'.
      - Usage Notes: documents the known approximation rather than hiding it.
      - Quality Contribution: makes the fallback direction (toward silence) an asserted choice.
      - Worked Example: no statusAt → armed, not never-fired.
      */
      expect(readWatchdogState({ watchdog: neverFired }, NOW).reason).toBe('armed');
      expect(readWatchdogState({ watchdog: neverFired, statusAt: 'nonsense' }, NOW).reason).toBe(
        'armed'
      );
      expect(
        readWatchdogState(
          { watchdog: { enabled: true, lastFireAt: null }, statusAt: at(151 * 60_000) },
          NOW
        ).reason
      ).toBe('armed');
    });
  });

  describe('parked — the seat itself mutes the nudge, and the rail promised one anyway', () => {
    const armed = { enabled: true, intervalMs: 1_200_000, pausedBy: null, lastFireAt: null };

    it.each(['waiting', 'hold', 'blocked', 'question'] as const)(
      'reads %s as parked and refuses the nudge promise',
      (semanticState) => {
        /*
      Test Doc:
      - Why: Jordan caught the rail rendering "watchdog on · nudges after 20m quiet" beside
        pij-mental-dajeil, correctly silent for nine days. Its watchdog IS enabled and IS firing —
        and `mutesWatchdogNudge` drops every fire in memory because the seat declared `waiting`.
        Three live seats read armed this way (dajeil, exact-giraffe, respectable-clam).
      - Contract: the four declared parked states map to reason 'parked', willNudge false, and the
        summary names the state doing the muting.
      - Usage Notes: the set is pij's, copied from watchdog.ts:332-344, not chosen here.
      - Quality Contribution: the ladder's rungs were config and behaviour only; this adds the one
        axis the SEAT controls, which is the axis a parked seat is silent on.
      - Worked Example: semanticState 'waiting' → 'parked (waiting) · nudges muted'.
      */
        const state = readWatchdogState({ watchdog: armed, semanticState });

        expect(state.reason).toBe('parked');
        expect(state.willNudge).toBe(false);
        expect(watchdogSummary(state)).toBe(`parked (${semanticState}) · nudges muted`);
      }
    );

    it('leaves the four UNPARKED states armed — the bound that keeps this honest', () => {
      /*
      Test Doc:
      - Why: THE FALSE-RED GUARD. `semanticState` is populated on every working seat, so a rung that
        fired on any non-empty value would silence the badge fleet-wide and make the whole instrument
        vacuous. Proving the new state appears is not proving it is BOUNDED.
      - Contract: ready/failed/cancelled/done do not mute — the other arm of pij's own switch.
      - Usage Notes: —
      - Quality Contribution: pins the mute set to pij's, in both directions.
      - Worked Example: semanticState 'ready' → armed, willNudge true.
      */
      for (const semanticState of ['ready', 'failed', 'cancelled', 'done']) {
        const state = readWatchdogState({ watchdog: armed, semanticState });
        expect(state.reason).toBe('armed');
        expect(state.willNudge).toBe(true);
      }
    });

    it('never claims parked from a value or a silence it cannot read', () => {
      /*
      Test Doc:
      - Why: the absence defect, at the value. 793 of 832 live records carry `semanticState: null`,
        and a future pij could add a fifth parked state this rail has not been taught. Treating
        either as parked would convert "I cannot tell" into "supervision is muted" — the exact
        inversion `role-unrecognised` exists to prevent one field over.
      - Contract: null, absent, and unrecognised all fall through to the rungs below.
      - Usage Notes: mirrors readSeatRole's three-absence discipline.
      - Quality Contribution: keeps the new rung from asserting on records that said nothing.
      - Worked Example: semanticState 'napping' → armed, not parked.
      */
      for (const semanticState of [null, undefined, '', 'napping']) {
        expect(readWatchdogState({ watchdog: armed, semanticState }).reason).toBe('armed');
      }
      expect(readWatchdogState({ watchdog: armed }).reason).toBe('armed');
    });

    it('OUTRANKS never-fired, which its own declaration explains', () => {
      /*
      Test Doc:
      - Why: pij-continuing-ermine, live: parked in `waiting`, lastFireAt null, 90m interval, long
        past due. The never-fired rung would render it AMBER — "never nudged · Nm overdue" — an
        alarm about a seat behaving exactly as designed. Adding parked BELOW never-fired would have
        left that false red in place and fixed only the false green.
      - Contract: a parked seat that is also never-fired-and-overdue reads 'parked'.
      - Usage Notes: the config rungs still outrank parked — an operator's pause is the stronger,
        more actionable statement, and both are true.
      - Quality Contribution: places the CAUSE above the symptom it accounts for.
      - Worked Example: waiting + lastFireAt null + 151m past a 20m interval → 'parked'.
      */
      const overdue = { statusAt: new Date(Date.now() - 151 * 60_000).toISOString() };
      expect(
        readWatchdogState({ watchdog: armed, semanticState: 'waiting', ...overdue }).reason
      ).toBe('parked');
      expect(
        readWatchdogState({
          watchdog: { ...armed, pausedBy: 'self' },
          semanticState: 'waiting',
          ...overdue,
        }).reason
      ).toBe('paused');
    });
  });

  describe('unwatched-role — a role the daemon never schedules at all', () => {
    const armed = { enabled: true, intervalMs: 1_200_000, pausedBy: null, lastFireAt: null };

    it.each([
      ['worker', 'worker seat · never watched · its PM is'],
      [null, 'unroled seat · never watched'],
    ] as const)('reads %s as never watched', (orchestrationRole, summary) => {
      /*
      Test Doc:
      - Why: `roleNeedsSupervision` gates eligibility BEFORE any config field is read, and returns
        false for `worker` and for undesignated seats. Their sidecars still say `enabled: true`, so
        the rail rendered "watchdog on · nudges after 20m quiet" over config that is inert. Live on
        2026-08-16: 4 of 14 active seats, and undesignated is 788 of 832 records fleet-wide.
      - Contract: worker and present-and-null role → 'unwatched-role', willNudge false.
      - Usage Notes: the field is `projectOrchestrationRole(d)` in `pij list --json` — literally the
        same projection the daemon's own gate consumes, which is what makes this readable at all.
      - Quality Contribution: closes the largest of the ladder's remaining false-green paths.
      - Worked Example: orchestrationRole null → 'unroled seat · never watched'.
      */
      const state = readWatchdogState({ watchdog: armed, orchestrationRole });

      expect(state.reason).toBe('unwatched-role');
      expect(state.willNudge).toBe(false);
      expect(watchdogSummary(state)).toBe(summary);
    });

    it('leaves the three SUPERVISED roles armed', () => {
      /*
      Test Doc:
      - Why: the bound. prime/pm/pa are all watched — a prime because nothing else supervises it, a
        PA because its only other trigger fires when the condition it detects is absent.
      - Contract: known supervised roles fall through to the rungs below.
      - Usage Notes: —
      - Quality Contribution: keeps the rung from swallowing the seats that most need the badge.
      - Worked Example: orchestrationRole 'prime' → armed.
      */
      for (const orchestrationRole of ['prime', 'pm', 'pa']) {
        expect(readWatchdogState({ watchdog: armed, orchestrationRole }).reason).toBe('armed');
      }
    });

    it('stays silent on a missing key and on a role it has not been taught', () => {
      /*
      Test Doc:
      - Why: readSeatRole's two silences must not become a claim. A record that never carried the
        field says nothing about the seat, and a role pij has designated but this rail cannot name
        may well be one the daemon supervises — asserting "never watched" there would hide a real
        gap behind a confident sentence.
      - Contract: role-field-absent and role-unrecognised both fall through.
      - Usage Notes: only present-and-null is an ANSWER; that distinction is readSeatRole's.
      - Quality Contribution: makes the fallback direction (toward the existing reading) asserted.
      - Worked Example: orchestrationRole 'archivist' → armed, not unwatched-role.
      */
      expect(readWatchdogState({ watchdog: armed }).reason).toBe('armed');
      expect(readWatchdogState({ watchdog: armed, orchestrationRole: 'archivist' }).reason).toBe(
        'armed'
      );
    });

    it('sits below relay, whose sentence is the more specific one', () => {
      /*
      Test Doc:
      - Why: pij-telegram is live and is BOTH relay and undesignated. Both rungs refuse the promise,
        so the ordering only chooses words — and "relay seat" says the silence is designed, where
        "unroled" says only that nobody watches it.
      - Contract: relay > unwatched-role > every config rung.
      - Usage Notes: —
      - Quality Contribution: pins an ordering that is otherwise invisible, on the live case.
      - Worked Example: relay + null role → 'relay'.
      */
      expect(
        readWatchdogState({ watchdog: { ...armed, relay: true }, orchestrationRole: null }).reason
      ).toBe('relay');
      expect(
        readWatchdogState({
          watchdog: { ...armed, globallyDisabled: true },
          orchestrationRole: null,
        }).reason
      ).toBe('unwatched-role');
    });
  });
});
