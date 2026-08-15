import { type PijId, type PijStatusRecord, asPijId } from '../types';

export type { PijStatusRecord } from '../types';

export const STATUS_STALE_MS = 30 * 60 * 1_000;
export const QUESTION_AGED_MS = 30 * 60 * 1_000;

/**
 * JC-2's projected role vocabulary. `pa` (Prime Assistant) added by s078, ratified 2026-07-31 —
 * a sensor-and-relay seat attached to a prime, structurally denied the authority-bearing verbs.
 *
 * Registration note (carried from s075, same standing block): the vocabulary note belongs in the
 * meadowlark consumed-field registry, which is parked for credits. Recorded here and at the
 * projection site (`server/join.ts`) meanwhile.
 */
export type OrchestrationRole = 'prime' | 'pm' | 'worker' | 'pa';

/**
 * Three absences, not one — and the third exists because widening the enum above exposed that this
 * consumer had been collapsing two different observations:
 *
 *   - `role-field-absent` — the key is missing. A SILENCE: pre-JC-2 pij, or a read that does not
 *     carry the field. Says nothing about the seat.
 *   - `role-unknown` — the field is present and `null`. An ANSWER: the producer knows the field and
 *     this seat is undesignated.
 *   - `role-unrecognised` — the field carries a value this consumer's vocabulary does not contain.
 *     A silence about VOCABULARY, not about the seat: pij has designated it something, and the rail
 *     has not been taught the word yet. Rendering this as `role-unknown` would convert "I do not
 *     know this word" into the positive claim "this seat is undesignated" — the absence defect,
 *     one level down at the value.
 */
export type RoleAbsenceReason = 'role-unknown' | 'role-field-absent' | 'role-unrecognised';

/**
 * The role field as it travels, projected verbatim. A member of {@link OrchestrationRole} is a role
 * this consumer knows; any OTHER string is one pij has designated and the rail has not been taught
 * (a vocabulary gap, never "undesignated"); `null` is undesignated; a missing key is a silence.
 * Widen {@link OrchestrationRole}, never this — the open arm is what makes the next `pa`-shaped
 * addition a label change rather than a break.
 */
export type ProjectedRole = string | null;

export type SeatRole =
  | { kind: 'known'; role: OrchestrationRole }
  | { kind: 'absent'; reason: RoleAbsenceReason };

export type StatusReason =
  | 'current'
  | 'not-a-pm'
  | 'role-unknown'
  | 'no-status-yet'
  | 'status-stale'
  /**
   * A prime with no status record. Distinct from `no-status-yet` because the obligations differ
   * (Jordan's ruling, 2026-07-30, relayed by albatross): a PM owes a card, so its absence is
   * rendered as a nag; a prime's card is OPTIONAL — written ones render, absent ones render
   * NOTHING, and no watchdog language ever attaches.
   */
  | 'prime-not-written'
  /**
   * A PA with no status record. Same optional-but-rendered policy as a prime, and a SEPARATE member
   * for the same reason `prime-not-written` is separate from `no-status-yet`: two silences with
   * different causes must stay distinguishable.
   *
   * Corrected 2026-08-01, against the first live PA (`pij-missing-anaconda`). The ratified render
   * said a PA carries no card, and the code implemented that as `not-a-pm` — renders nothing, EVER.
   * The seat then wrote a real card ("Completed PA sweep 2 & registered watchdog on
   * pij-wee-albatross") and the rail dropped it on the floor. "Owes no card" was read as "has no
   * card", which is the same error albatross made about prime cards on 2026-07-30 and that this
   * consumer corrected them on: not-required and not-rendered are different rulings.
   */
  | 'pa-not-written';

export interface SeatStatus {
  reason: StatusReason;
  status?: PijStatusRecord;
  ageMs?: number;
}

export type StateNoteState = 'question' | 'blocked';

export interface StateNote {
  text: string;
  state: StateNoteState;
  at: string;
}

export type InterstitialLabel = 'folder-trust' | 'login' | 'update-prompt' | 'interstitial';

export interface Interstitial {
  label: InterstitialLabel;
  at: string;
  paneId: string;
}

export type QuestionReason =
  | 'declared-note'
  | 'declared-no-note'
  | 'blocked-note-inline'
  | 'note-superseded'
  | 'daemon-detected-not-observable'
  | 'daemon-detected-tag-only'
  | 'strip-empty-declared-only';

export type QuestionDecision =
  | {
      reason: 'declared-note';
      placement: 'strip';
      text: string;
      at: string;
      aged: boolean;
    }
  | {
      reason: 'declared-no-note';
      placement: 'strip';
      text: 'asked a question — open the pane';
    }
  | {
      reason: 'blocked-note-inline';
      placement: 'inline';
      text: string;
      at: string;
    }
  | {
      reason: 'daemon-detected-tag-only';
      placement: 'strip';
      text: string;
      at: string;
      label: InterstitialLabel;
    }
  | {
      reason: 'note-superseded' | 'daemon-detected-not-observable' | 'strip-empty-declared-only';
      placement: 'none';
    };

export interface StatusContractSeam {
  newestByPeer(records: readonly PijStatusRecord[]): Map<string, PijStatusRecord>;
  resolve(role: SeatRole, status: PijStatusRecord | undefined, now: number): SeatStatus;
  readSpineEvent(event: Record<string, unknown>, peer: PijId): PijStatusRecord | undefined;
}

export interface RoleContractSeam {
  read(record: Record<string, unknown>): SeatRole;
}

export interface QuestionContractSeam {
  read(record: Record<string, unknown>, now: number): QuestionDecision;
}

export interface PijRailContractSeams {
  status: StatusContractSeam;
  role: RoleContractSeam;
  question: QuestionContractSeam;
}

export function readSeatRole(record: Record<string, unknown>): SeatRole {
  if (!Object.hasOwn(record, 'orchestrationRole')) {
    return { kind: 'absent', reason: 'role-field-absent' };
  }
  const role = record.orchestrationRole;
  if (role === 'prime' || role === 'pm' || role === 'worker' || role === 'pa') {
    return { kind: 'known', role };
  }
  if (role === null) return { kind: 'absent', reason: 'role-unknown' };
  return { kind: 'absent', reason: 'role-unrecognised' };
}

/**
 * Who OWES a card — the obligation axis, PM-only. A prime and a PA are handled by
 * {@link hasOptionalCard} instead: they owe nothing and are still rendered when they write.
 *
 * Keeping the two questions apart is the whole lesson of 2026-08-01. "Owes no card" was
 * implemented as "renders no card", and the first live PA — which had written one — lost it.
 */
export function carriesStatus(role: SeatRole): boolean {
  return role.kind === 'known' && role.role === 'pm';
}

/**
 * Roles whose card is OPTIONAL BUT RENDERED: written ones show, absent ones show nothing, and no
 * staleness or watchdog language ever attaches, because those carry an obligation neither role has.
 *
 * `prime` by Jordan's ruling (2026-07-30); `pa` by measurement against the first live PA
 * (2026-08-01) — see the `pa-not-written` doc for what the old `not-a-pm` treatment threw away.
 */
export function hasOptionalCard(role: SeatRole): role is { kind: 'known'; role: 'prime' | 'pa' } {
  return role.kind === 'known' && (role.role === 'prime' || role.role === 'pa');
}

export function newestStatusByPeer(
  records: readonly PijStatusRecord[]
): Map<string, PijStatusRecord> {
  const newest = new Map<string, PijStatusRecord>();
  for (const record of records) {
    const current = newest.get(record.peer);
    if (!current || record.seq > current.seq) newest.set(record.peer, record);
  }
  return newest;
}

export function resolveSeatStatus(
  role: SeatRole,
  status: PijStatusRecord | undefined,
  now: number
): SeatStatus {
  if (role.kind === 'absent') return { reason: 'role-unknown' };
  if (hasOptionalCard(role)) {
    // Optional-but-rendered (Jordan, 2026-07-30): a prime that writes a card gets it shown; one
    // that doesn't is never nagged. Staleness is likewise never flagged — the stale label carries
    // watchdog language, and no watchdog obligation exists for an optional card. The age line
    // still renders, so an old card is visibly old without being called a defect.
    //
    // DELIBERATE DIVERGENCE, ratified by albatross (pij spine, 2026-07-30): `pij anomalies` DOES
    // raise status-stale rows for a prime holding a rotten card — different consumer (the prime's
    // own self-service sweep; it has no supervisor). An old prime card with no stale label here
    // AND a status-stale row there is by design, not drift. Do not "fix" either side to match.
    if (!status) return { reason: role.role === 'prime' ? 'prime-not-written' : 'pa-not-written' };
    return { reason: 'current', status, ageMs: statusAgeMs(status, now) };
  }
  if (!carriesStatus(role)) return { reason: 'not-a-pm' };
  if (!status) return { reason: 'no-status-yet' };

  const ageMs = statusAgeMs(status, now);
  return {
    reason: ageMs > STATUS_STALE_MS ? 'status-stale' : 'current',
    status,
    ageMs,
  };
}

function statusAgeMs(status: PijStatusRecord, now: number): number {
  const producerAt = Date.parse(status.ts);
  return Number.isNaN(producerAt) ? 0 : Math.max(0, now - producerAt);
}

export function readStatusSpineEvent(
  event: Record<string, unknown>,
  peer: PijId
): PijStatusRecord | undefined {
  if (
    event.kind !== 'status' ||
    typeof event.prev !== 'string' ||
    typeof event.next !== 'string' ||
    typeof event.ts !== 'string' ||
    typeof event.seq !== 'number'
  ) {
    return undefined;
  }
  return {
    peer,
    prev: event.prev,
    next: event.next,
    ts: event.ts,
    seq: event.seq,
    ...(typeof event.project === 'string' ? { project: event.project } : {}),
  };
}

function readStateNote(record: Record<string, unknown>): StateNote | undefined {
  const raw = record.stateNote;
  if (!raw || typeof raw !== 'object') return undefined;
  const note = raw as Record<string, unknown>;
  if (
    typeof note.text !== 'string' ||
    (note.state !== 'question' && note.state !== 'blocked') ||
    typeof note.at !== 'string'
  ) {
    return undefined;
  }
  return { text: note.text, state: note.state, at: note.at };
}

function readInterstitial(record: Record<string, unknown>): Interstitial | undefined {
  const raw = record.interstitial;
  if (!raw || typeof raw !== 'object') return undefined;
  const interstitial = raw as Record<string, unknown>;
  if (
    (interstitial.label !== 'folder-trust' &&
      interstitial.label !== 'login' &&
      interstitial.label !== 'update-prompt' &&
      interstitial.label !== 'interstitial') ||
    typeof interstitial.at !== 'string' ||
    typeof interstitial.paneId !== 'string'
  ) {
    return undefined;
  }
  return {
    label: interstitial.label,
    at: interstitial.at,
    paneId: interstitial.paneId,
  };
}

/**
 * Why a seat will or will not be nudged. `unreported` is its own member on purpose: a record that
 * never carried `watchdog` is not a seat with the watchdog off, and the UI must not say either.
 */
export type WatchdogReason =
  | 'armed'
  | 'never-fired'
  | 'parked'
  | 'unwatched-role'
  | 'paused'
  | 'exempt'
  | 'fleet-disabled'
  | 'relay'
  | 'off'
  | 'unreported';

export interface WatchdogState {
  reason: WatchdogReason;
  /** TRUE only when a nudge will actually fire on continued silence. Nothing else may imply it. */
  willNudge: boolean;
  intervalMs?: number;
  /** Which tier paused it — pij's own word (`self`, `compact`). */
  pausedBy?: string;
  exemptRemainingMs?: number | null;
  /** How far past its due moment a `never-fired` seat is. Only set for that reason. */
  overdueMs?: number;
  /** The declared state doing the muting. Only set for `parked`. */
  semanticState?: ParkedSemanticState;
  /** The role that is never watched. Only set for `unwatched-role`; `null` is undesignated. */
  role?: 'worker' | null;
}

/**
 * The four DECLARED states that mute a nudge at fire time — pij's `mutesWatchdogNudge`
 * (`.pi/extensions/pij/core/watchdog.ts:332-344`), read verbatim rather than inferred. The other
 * four (`ready`, `failed`, `cancelled`, `done`) do not mute.
 */
const PARKED_SEMANTIC_STATES = ['blocked', 'question', 'hold', 'waiting'] as const;
export type ParkedSemanticState = (typeof PARKED_SEMANTIC_STATES)[number];

/**
 * Is this seat's silence DECLARED — and therefore muted at the last gate before delivery?
 *
 * `undefined` where the record cannot answer: an unrecognised value is a gap in THIS consumer's
 * vocabulary, never a claim that the seat is unparked. Same discipline as `role-unrecognised`.
 */
function readParkedSemanticState(record: Record<string, unknown>): ParkedSemanticState | undefined {
  const state = record.semanticState;
  return (PARKED_SEMANTIC_STATES as readonly unknown[]).includes(state)
    ? (state as ParkedSemanticState)
    : undefined;
}

/**
 * Does the daemon watch this role AT ALL — `roleNeedsSupervision`
 * (`.pi/extensions/pij/core/daemon/watchdog-manager.ts:165-200`), which gates eligibility BEFORE any
 * config field is consulted. `prime`/`pm`/`pa` are watched; `worker` is not (its PM is, and is
 * watched itself); `null` — undesignated — is not, because stamping a role is what opts a seat in.
 *
 * `undefined` where the record cannot answer. The two silences of {@link readSeatRole} both land
 * here: a missing key says nothing about the seat, and a role this rail has not been taught may well
 * be one the daemon watches. Neither may become the claim "never watched".
 */
function readUnwatchedRole(record: Record<string, unknown>): 'worker' | null | undefined {
  const role = readSeatRole(record);
  if (role.kind === 'known') return role.role === 'worker' ? 'worker' : undefined;
  return role.reason === 'role-unknown' ? null : undefined;
}

/**
 * The watchdog's own scheduling rule, as the daemon computes it
 * (`.pi/extensions/pij/core/watchdog.ts:141-150`):
 *
 *     scheduleAnchor = newest of [statusAt, startedAt]
 *     isFireDue      = now - max(lastFireAt, scheduleAnchor) >= intervalMs
 *
 * KNOWN APPROXIMATION, stated rather than hidden: the flattened rail record carries `statusAt`
 * but NOT `startedAt` (verified against `pij list --json`, the reader's actual source — the
 * record's only `*At` keys are `lastEventAt` and `statusAt`). So this anchors on `statusAt`
 * alone.
 *
 * The one case that diverges is a seat whose `startedAt` is NEWER than its `statusAt` — a
 * revived or re-adopted seat carrying a card from a previous life. There the daemon anchors
 * later than we do, so we could call a seat overdue slightly before the daemon does. That is a
 * false red, which is why {@link readWatchdogState} additionally requires `statusAt` to be
 * present and parseable: a seat that has never written a card cannot reach this branch at all.
 */
function neverFiredOverdueMs(
  watchdog: Record<string, unknown>,
  record: Record<string, unknown>,
  intervalMs: number | undefined,
  now: number
): number | undefined {
  if (intervalMs === undefined || intervalMs <= 0) return undefined;

  // PRESENT-AND-NULL, not absent. `pij list --json` ships `lastFireAt: null` for a seat that has
  // never been nudged (verified live: 730 of 770 records with a watchdog object). An `in` check
  // or a hasOwnProperty test would therefore never fire, and would pass a hand-built fixture that
  // omitted the key — the check would be dead and look tested.
  const fired =
    typeof watchdog.lastFireAt === 'string' ? Date.parse(watchdog.lastFireAt) : Number.NaN;
  if (Number.isFinite(fired)) return undefined;

  const anchor = typeof record.statusAt === 'string' ? Date.parse(record.statusAt) : Number.NaN;
  if (!Number.isFinite(anchor)) return undefined;

  const overdueMs = now - anchor - intervalMs;
  return overdueMs > 0 ? overdueMs : undefined;
}

/**
 * Read the watchdog axis off a flattened placement record.
 *
 * This exists because the rail asserted "watchdog will nudge" beside every stale card without
 * ever reading this field (caught live 2026-07-30 on a seat whose watchdog was `paused (self)`).
 * A behavioural promise is a claim; it needs an instrument, and this is it.
 *
 * Precedence follows the platform's own strongest-wins ladder (C9), with the states that are not
 * tiers at all checked first: a `relay` seat is never watched by design, a role the daemon does not
 * supervise is never scheduled, and the fleet kill switch outranks any per-seat setting.
 *
 * The ladder mirrors the daemon's own order — ELIGIBILITY (relay, role) before CONFIG
 * (globallyDisabled, enabled, exempt, paused) before BEHAVIOUR (parked, never-fired) — because that
 * is the order in which a nudge is actually refused, and a lower gate cannot rescue a higher one.
 *
 * WHAT IT STILL CANNOT SEE, stated rather than hidden. `eligible()` also refuses a seat on
 * `deliveryMode === 'pull'` with a non-pi harness, on `lifecycle === 'pending'`, and on the absence
 * of a `paneId`. None of those three fields travel in `pij list --json` (`paneId` is the known gap,
 * pij#301), so those seats still read armed. This closes two of five refusal paths, not all five.
 */
export function readWatchdogState(
  record: Record<string, unknown>,
  now: number = Date.now()
): WatchdogState {
  const raw = record.watchdog;
  if (typeof raw !== 'object' || raw === null) return { reason: 'unreported', willNudge: false };
  const watchdog = raw as Record<string, unknown>;
  const intervalMs = typeof watchdog.intervalMs === 'number' ? watchdog.intervalMs : undefined;

  if (watchdog.relay === true) return { reason: 'relay', willNudge: false };

  // ELIGIBILITY, which outranks every config field below because the daemon checks it first: a role
  // it does not supervise is never scheduled, so `enabled: true` on such a seat is inert config that
  // the rail was reading as a promise. Caught 2026-08-16 — 4 of 14 live seats (`grieving-gibbon`,
  // `hurt-ptarmigan`, `musical-hoverfly`, `simple-jaguar`, all undesignated) rendered "watchdog on ·
  // nudges after 20m quiet" while `roleNeedsSupervision(null) === false` meant no nudge could ever
  // arrive. Undesignated is the fleet's overwhelming majority (788 of 832 records).
  //
  // Below `relay` on purpose. Both refuse the promise, so ordering only picks the WORDS, and a relay
  // seat's silence is designed rather than merely unsupervised — the more specific sentence wins.
  const unwatchedRole = readUnwatchedRole(record);
  if (unwatchedRole !== undefined) {
    return { reason: 'unwatched-role', willNudge: false, intervalMs, role: unwatchedRole };
  }

  if (watchdog.globallyDisabled === true) return { reason: 'fleet-disabled', willNudge: false };
  if (watchdog.enabled === false) return { reason: 'off', willNudge: false };
  if (watchdog.exempt === true) {
    return {
      reason: 'exempt',
      willNudge: false,
      intervalMs,
      exemptRemainingMs:
        typeof watchdog.exemptRemainingMs === 'number' ? watchdog.exemptRemainingMs : null,
    };
  }
  if (typeof watchdog.pausedBy === 'string' && watchdog.pausedBy.length > 0) {
    return { reason: 'paused', willNudge: false, intervalMs, pausedBy: watchdog.pausedBy };
  }

  // Last rung before `armed`, and the only one that reads BEHAVIOUR rather than configuration.
  //
  // Every rung above is a config field, which is precisely how a seat could be enabled, unpaused,
  // unexempt — and rendered "watchdog on" — while never having been nudged once. Caught by Jordan
  // on the rail 2026-08-09: `pij-respectable-clam`, role pm, `roleNeedsSupervision("pm") === true`,
  // never nudged, 131 minutes overdue, badge reading on. The file's own contract already forbade
  // that ("TRUE only when a nudge will actually fire on continued silence"); the ladder simply had
  // no instrument for it. This completes the instrument rather than adding a feature.
  //
  // BOTH conditions are required and the second is the load-bearing one. A freshly spawned seat
  // has also never fired, and must keep reading `armed` — a badge that fires on every new seat is
  // noise, and noise spends exactly the credibility this exists to restore.
  //
  // AND A LIMIT ON ITS PREMISE, found while adding the `parked` rung above (pij#258): a muted fire
  // advances the scheduler's clock IN MEMORY and writes nothing, so `lastFireAt: null` does not mean
  // "never fired at" — it means "never fired at, OR fired at repeatedly while parked". The rung
  // above removes the CURRENTLY parked seats from this one's reach; a seat that was parked and has
  // since unparked is still indistinguishable from an unsupervised one, from disk, at any level of
  // care. That is a pij-side gap (the muted fire is the event that proves supervision is alive and
  // the only one leaving no trace), not something this reader can close.
  //
  // SCOPE — class A only, deliberately. This catches "never fired AND overdue", which is provable
  // from two fields. It does NOT catch class B, "fired once, then stopped" (e.g. after a bounded
  // `exempt` lapsed). B needs a judgement about how many missed intervals constitute stopped, and
  // exempt state is persisted nowhere, so never-exempted and exemption-lapsed are indistinguishable
  // from this record. B is real and is not attempted here; do not read this check as complete.
  // PARKED — the last gate the daemon applies, and the only one the seat sets on ITSELF. A fire is
  // due, the fire happens, and `mutesWatchdogNudge` drops it in memory without writing anything
  // (`daemon/watchdog-manager.ts:501-506`). So a parked seat's silence is correct and permanent
  // until it unparks, and "nudges after 20m quiet" is a promise that cannot be kept.
  //
  // Caught 2026-08-16 by Jordan, on a seat that had been correctly silent for days: `pij-mental-
  // dajeil` (`waiting`, last fire 9 days old) rendered armed, as did `pij-exact-giraffe` (`waiting`)
  // and `pij-respectable-clam` (`hold`).
  //
  // ABOVE never-fired, which is the point of placing it here at all. A parked seat that has also
  // never fired reads as "never nudged · Nm overdue" in AMBER — an alarm about a seat behaving
  // exactly as designed. `pij-continuing-ermine` is live proof: parked in `waiting`, lastFireAt
  // null, and flagged by a rung whose premise its own declaration explains. Parked is the CAUSE;
  // never-fired is the symptom, and a cause that is present outranks a symptom it accounts for.
  const parked = readParkedSemanticState(record);
  if (parked !== undefined) {
    return { reason: 'parked', willNudge: false, intervalMs, semanticState: parked };
  }

  const overdueMs = neverFiredOverdueMs(watchdog, record, intervalMs, now);
  if (overdueMs !== undefined) {
    return { reason: 'never-fired', willNudge: false, intervalMs, overdueMs };
  }

  return { reason: 'armed', willNudge: true, intervalMs };
}

/** One short phrase for the rail's meta line and hover card. Never claims a nudge unless one fires. */
export function watchdogSummary(state: WatchdogState): string {
  switch (state.reason) {
    case 'armed':
      return state.intervalMs
        ? `watchdog on · nudges after ${Math.round(state.intervalMs / 60_000)}m quiet`
        : 'watchdog on';
    // Says both halves, because both are true and the first one alone is the bug: `enabled` really
    // IS on, so "watchdog off" would be its own lie. What it must never do is promise a nudge.
    case 'never-fired':
      return state.overdueMs
        ? `watchdog on · never nudged · ${Math.round(state.overdueMs / 60_000)}m overdue`
        : 'watchdog on · never nudged';
    // pij's own word for it, taken from the daemon's log line ("parked (waiting) — nudge muted,
    // supervision unchanged"). Says MUTED rather than off: the watchdog is running and firing, and
    // the seat itself is dropping the nudges — which is also what makes this one self-clearing.
    case 'parked':
      return `parked (${state.semanticState}) · nudges muted`;
    // Mirrors the relay sentence because it is the same kind of fact: not a setting that could be
    // changed, but a seat this daemon does not supervise at all.
    case 'unwatched-role':
      return state.role === 'worker'
        ? 'worker seat · never watched · its PM is'
        : 'unroled seat · never watched';
    case 'paused':
      return `watchdog paused${state.pausedBy ? ` (${state.pausedBy})` : ''} · no nudge`;
    case 'exempt':
      return state.exemptRemainingMs
        ? `watchdog exempt ${Math.round(state.exemptRemainingMs / 60_000)}m · no nudge`
        : 'watchdog exempt · no nudge';
    case 'fleet-disabled':
      return 'watchdog off fleet-wide · no nudge';
    case 'off':
      return 'watchdog off · no nudge';
    case 'relay':
      return 'relay seat · never watched';
    case 'unreported':
      return 'watchdog not reported';
  }
}

export function readQuestionDecision(
  record: Record<string, unknown>,
  now: number
): QuestionDecision {
  const semanticState = record.semanticState;
  const note = readStateNote(record);
  const interstitial = readInterstitial(record);

  if (note && semanticState !== note.state) {
    return { reason: 'note-superseded', placement: 'none' };
  }
  if (note?.state === 'blocked') {
    return {
      reason: 'blocked-note-inline',
      placement: 'inline',
      text: note.text,
      at: note.at,
    };
  }
  if (semanticState === 'question' && note?.state === 'question') {
    const at = Date.parse(note.at);
    return {
      reason: 'declared-note',
      placement: 'strip',
      text: note.text,
      at: note.at,
      aged: !Number.isNaN(at) && Math.max(0, now - at) > QUESTION_AGED_MS,
    };
  }
  if (semanticState === 'question') {
    return {
      reason: 'declared-no-note',
      placement: 'strip',
      text: 'asked a question — open the pane',
    };
  }
  if (interstitial) {
    return {
      reason: 'daemon-detected-tag-only',
      placement: 'strip',
      text: `stuck on a startup prompt (${interstitial.label}) — open the pane`,
      at: interstitial.at,
      label: interstitial.label,
    };
  }
  return { reason: 'daemon-detected-not-observable', placement: 'none' };
}

export function resolveQuestionStrip(decisions: readonly QuestionDecision[]) {
  const entries = decisions.filter((decision) => decision.placement === 'strip');
  return entries.length > 0
    ? { reason: 'entries' as const, entries }
    : { reason: 'strip-empty-declared-only' as const, entries };
}

export const productionContractSeams: PijRailContractSeams = {
  status: {
    newestByPeer: newestStatusByPeer,
    resolve: resolveSeatStatus,
    readSpineEvent: readStatusSpineEvent,
  },
  role: { read: readSeatRole },
  question: { read: readQuestionDecision },
};

export function fakeStatusRecord(overrides: Partial<PijStatusRecord> = {}): PijStatusRecord {
  const record = {
    peer: asPijId('pij-fake-pm'),
    prev: 'Completed the previous rail task.',
    next: 'Start the next rail task.',
    ts: '2026-07-29T00:00:00.000Z',
    seq: 1,
    project: 'chainglass',
    ...overrides,
  };
  for (const [field, value] of [
    ['prev', record.prev],
    ['next', record.next],
  ] as const) {
    if (value.trim().length === 0 || value.length > 280 || /\s{2}|\r|\n|\t/.test(value)) {
      throw new Error(`fake status ${field} must be contract-valid`);
    }
  }
  return record;
}

export function fakeRoleRecordFromTreeDepth(input: {
  depth: number;
  prime?: boolean;
}): Record<string, unknown> {
  const orchestrationRole: OrchestrationRole =
    input.prime === true ? 'prime' : input.depth === 1 ? 'pm' : 'worker';
  return { orchestrationRole };
}

export function fakeLegacyRoleRecord(): Record<string, unknown> {
  return {};
}

export function fakeQuestionRecord(
  kind:
    | 'declared-note'
    | 'declared-no-note'
    | 'blocked-note-inline'
    | 'note-superseded'
    | 'd0'
    | 'd1'
): Record<string, unknown> {
  const note = {
    text: 'Which branch should this change land on?',
    at: '2026-07-29T00:00:00.000Z',
  };
  switch (kind) {
    case 'declared-note':
      return { semanticState: 'question', stateNote: { ...note, state: 'question' } };
    case 'declared-no-note':
      return { semanticState: 'question' };
    case 'blocked-note-inline':
      return { semanticState: 'blocked', stateNote: { ...note, state: 'blocked' } };
    case 'note-superseded':
      return { semanticState: null, stateNote: { ...note, state: 'question' } };
    case 'd0':
      return {};
    case 'd1':
      return {
        interstitial: {
          label: 'folder-trust',
          at: '2026-07-29T00:00:00.000Z',
          paneId: '%37',
        },
      };
  }
}

export const fakeContractSeams: PijRailContractSeams = {
  status: {
    newestByPeer: newestStatusByPeer,
    resolve: resolveSeatStatus,
    readSpineEvent: readStatusSpineEvent,
  },
  role: { read: readSeatRole },
  question: { read: readQuestionDecision },
};
