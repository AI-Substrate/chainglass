import { usePijStatus } from '@/features/089-first-class-pij/hooks/use-pij-status';
import {
  type PijRailContractSeams,
  STATUS_STALE_MS,
  fakeStatusRecord,
  productionContractSeams,
  readSeatRole,
} from '@/features/089-first-class-pij/server/pij-status.contract';
import { MultiplexedSSEProvider } from '@/lib/sse/multiplexed-sse-provider';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createFakeMultiplexedSSEFactory } from '../../../fakes/fake-multiplexed-sse';

const NOW = Date.parse('2026-07-29T00:30:00.000Z');

describe('usePijStatus', () => {
  it('starts from the fleet snapshot and computes age from producer ts', () => {
    const sse = createFakeMultiplexedSSEFactory();
    const snapshot = fakeStatusRecord({
      ts: new Date(NOW - 2_000).toISOString(),
      seq: 10,
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
        {children}
      </MultiplexedSSEProvider>
    );

    const { result } = renderHook(() => usePijStatus({ snapshot: [snapshot], now: () => NOW }), {
      wrapper,
    });

    expect(result.current.statuses.get(snapshot.peer)).toEqual(snapshot);
    expect(
      result.current.resolve(snapshot.peer, readSeatRole({ orchestrationRole: 'pm' }))
    ).toMatchObject({ reason: 'current', ageMs: 2_000 });
    expect(STATUS_STALE_MS).toBe(30 * 60 * 1_000);
  });

  it('applies status deltas newest-by-seq and marks the threshold edge correctly', () => {
    const sse = createFakeMultiplexedSSEFactory();
    const snapshot = fakeStatusRecord({ seq: 10, prev: 'snapshot' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
        {children}
      </MultiplexedSSEProvider>
    );
    const { result } = renderHook(() => usePijStatus({ snapshot: [snapshot], now: () => NOW }), {
      wrapper,
    });

    act(() => {
      sse.simulateChannelMessage('pij', 'status-delta', {
        type: 'status-delta',
        seq: 12,
        at: new Date(NOW).toISOString(),
        statuses: [
          fakeStatusRecord({
            seq: 12,
            prev: 'new',
            ts: new Date(NOW - STATUS_STALE_MS - 1).toISOString(),
          }),
          fakeStatusRecord({ seq: 11, prev: 'older delta' }),
        ],
      });
    });

    expect(result.current.statuses.get(snapshot.peer)?.prev).toBe('new');
    expect(
      result.current.resolve(snapshot.peer, readSeatRole({ orchestrationRole: 'pm' })).reason
    ).toBe('status-stale');
  });

  it('runs the real hook against a swapped status seam', () => {
    const sse = createFakeMultiplexedSSEFactory();
    const snapshot = fakeStatusRecord();
    const swapped: PijRailContractSeams = {
      ...productionContractSeams,
      status: {
        ...productionContractSeams.status,
        newestByPeer: () => new Map([[snapshot.peer, { ...snapshot, prev: 'swapped reader' }]]),
        resolve: (_role, status) => ({ reason: 'current', status, ageMs: 77 }),
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
        {children}
      </MultiplexedSSEProvider>
    );

    const { result } = renderHook(
      () => usePijStatus({ snapshot: [], now: () => NOW, contracts: swapped }),
      { wrapper }
    );

    expect(result.current.statuses.get(snapshot.peer)?.prev).toBe('swapped reader');
    expect(
      result.current.resolve(snapshot.peer, readSeatRole({ orchestrationRole: 'pm' }))
    ).toMatchObject({ ageMs: 77 });
  });

  it('routes live delta coalescing through a swapped status seam', () => {
    const sse = createFakeMultiplexedSSEFactory();
    const snapshot = fakeStatusRecord({ seq: 10, prev: 'snapshot' });
    const swapped: PijRailContractSeams = {
      ...productionContractSeams,
      status: {
        ...productionContractSeams.status,
        newestByPeer: (records) => {
          const selected = new Map<string, (typeof records)[number]>();
          for (const record of records) {
            const current = selected.get(record.peer);
            if (!current || record.seq < current.seq) selected.set(record.peer, record);
          }
          return selected;
        },
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
        {children}
      </MultiplexedSSEProvider>
    );
    const { result } = renderHook(
      () =>
        usePijStatus({
          snapshot: [snapshot],
          now: () => NOW,
          contracts: swapped,
        }),
      { wrapper }
    );

    act(() => {
      sse.simulateChannelMessage('pij', 'status-delta', {
        type: 'status-delta',
        seq: 11,
        at: new Date(NOW).toISOString(),
        statuses: [fakeStatusRecord({ seq: 1, prev: 'swapped delta' })],
      });
    });

    expect(result.current.statuses.get(snapshot.peer)?.prev).toBe('swapped delta');
  });
});
