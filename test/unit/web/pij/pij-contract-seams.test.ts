import {
  type PijRailContractSeams,
  fakeContractSeams,
  fakeLegacyRoleRecord,
  fakeQuestionRecord,
  fakeRoleRecordFromTreeDepth,
  fakeStatusRecord,
  productionContractSeams,
  resolveQuestionStrip,
} from '@/features/089-first-class-pij/server/pij-status.contract';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-07-29T00:30:00.001Z');

function consumeContracts(seams: PijRailContractSeams) {
  const status = seams.status.newestByPeer([
    fakeStatusRecord({ seq: 1, prev: 'old' }),
    fakeStatusRecord({ seq: 2, prev: 'new' }),
  ]);
  return {
    status: status.get(fakeStatusRecord().peer)?.prev,
    pm: seams.role.read(fakeRoleRecordFromTreeDepth({ depth: 1 })),
    legacy: seams.role.read(fakeLegacyRoleRecord()),
    question: seams.question.read(fakeQuestionRecord('declared-note'), NOW),
  };
}

describe('JC fake seams', () => {
  it('emits contract-exact role absence and fake-only tree-depth roles', () => {
    expect(
      fakeContractSeams.role.read(fakeRoleRecordFromTreeDepth({ depth: 0, prime: true }))
    ).toEqual({ kind: 'known', role: 'prime' });
    expect(fakeContractSeams.role.read(fakeRoleRecordFromTreeDepth({ depth: 1 }))).toEqual({
      kind: 'known',
      role: 'pm',
    });
    expect(fakeContractSeams.role.read(fakeRoleRecordFromTreeDepth({ depth: 2 }))).toEqual({
      kind: 'known',
      role: 'worker',
    });
    expect(fakeContractSeams.role.read({ orchestrationRole: null })).toEqual({
      kind: 'absent',
      reason: 'role-unknown',
    });
    expect(fakeContractSeams.role.read(fakeLegacyRoleRecord())).toEqual({
      kind: 'absent',
      reason: 'role-field-absent',
    });
  });

  it.each([
    ['declared-note', 'declared-note'],
    ['declared-no-note', 'declared-no-note'],
    ['blocked-note-inline', 'blocked-note-inline'],
    ['note-superseded', 'note-superseded'],
    ['d0', 'daemon-detected-not-observable'],
    ['d1', 'daemon-detected-tag-only'],
  ] as const)('emits the %s JC-3 case', (fixture, reason) => {
    expect(fakeContractSeams.question.read(fakeQuestionRecord(fixture), NOW).reason).toBe(reason);
  });

  it('emits the declared-only empty-strip state when no decision is pinnable', () => {
    const decisions = [fakeContractSeams.question.read(fakeQuestionRecord('d0'), NOW)];
    expect(resolveQuestionStrip(decisions)).toEqual({
      reason: 'strip-empty-declared-only',
      entries: [],
    });
  });

  it('keeps fake JC-1 prose inside the producer contract', () => {
    expect(fakeStatusRecord({ prev: 'x'.repeat(280) }).prev).toHaveLength(280);
    expect(() => fakeStatusRecord({ prev: 'x'.repeat(281) })).toThrow(
      'fake status prev must be contract-valid'
    );
  });

  it('allows all three fake seams to swap for real implementations without changing the consumer', () => {
    const expected = consumeContracts(fakeContractSeams);
    const realStub: PijRailContractSeams = {
      status: {
        newestByPeer: (records) => fakeContractSeams.status.newestByPeer(records),
        resolve: (role, status, now) => fakeContractSeams.status.resolve(role, status, now),
        readSpineEvent: (event, peer) => fakeContractSeams.status.readSpineEvent(event, peer),
      },
      role: {
        read: (record) => fakeContractSeams.role.read(record),
      },
      question: {
        read: (record, now) => fakeContractSeams.question.read(record, now),
      },
    };

    expect(consumeContracts(realStub)).toEqual(expected);
  });

  it('keeps the production adapter independent when a fake implementation is broken', () => {
    const brokenFake: PijRailContractSeams = {
      status: {
        newestByPeer: () => {
          throw new Error('broken fake status');
        },
        resolve: () => {
          throw new Error('broken fake status');
        },
        readSpineEvent: () => {
          throw new Error('broken fake status');
        },
      },
      role: {
        read: () => {
          throw new Error('broken fake role');
        },
      },
      question: {
        read: () => {
          throw new Error('broken fake question');
        },
      },
    };

    expect(brokenFake).not.toBe(productionContractSeams);
    expect(consumeContracts(productionContractSeams)).toEqual(consumeContracts(fakeContractSeams));
  });
});
