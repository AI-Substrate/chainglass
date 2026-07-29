import { type PijId, type PijStatusRecord, asPijId } from '../types';

export type { PijStatusRecord } from '../types';

export const STATUS_STALE_MS = 30 * 60 * 1_000;
export const QUESTION_AGED_MS = 30 * 60 * 1_000;

export type OrchestrationRole = 'prime' | 'pm' | 'worker';
export type RoleAbsenceReason = 'role-unknown' | 'role-field-absent';

export type SeatRole =
  | { kind: 'known'; role: OrchestrationRole }
  | { kind: 'absent'; reason: RoleAbsenceReason };

export type StatusReason =
  | 'current'
  | 'not-a-pm'
  | 'role-unknown'
  | 'no-status-yet'
  | 'status-stale';

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
  if (role === 'prime' || role === 'pm' || role === 'worker') {
    return { kind: 'known', role };
  }
  return { kind: 'absent', reason: 'role-unknown' };
}

export function carriesStatus(role: SeatRole): boolean {
  return role.kind === 'known' && role.role === 'pm';
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
  if (!carriesStatus(role)) return { reason: 'not-a-pm' };
  if (!status) return { reason: 'no-status-yet' };

  const producerAt = Date.parse(status.ts);
  const ageMs = Number.isNaN(producerAt) ? 0 : Math.max(0, now - producerAt);
  return {
    reason: ageMs > STATUS_STALE_MS ? 'status-stale' : 'current',
    status,
    ageMs,
  };
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
