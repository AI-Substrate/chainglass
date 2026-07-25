/**
 * MultiplexedSSEProvider — Leader Election Contract Tests
 *
 * Test Doc:
 * - Why: One SSE per BROWSER, not per tab. Chrome allows 6 sockets per origin
 *   browser-wide, so one permanently-held SSE per tab starves the pool at 6 tabs
 *   (measured: 5 tabs → /api/health 200 in 6ms; 6 tabs → blocked at 20001ms).
 *   A single elected leader holds the socket; followers open ZERO.
 * - Contract: leader opens exactly one EventSource; followers open none and still
 *   receive events; leadership transfers on unmount; control messages never reach
 *   channel subscribers; absent APIs fall back to per-tab behaviour.
 * - Usage Notes: Each `render()` models one browser tab. Tabs share a fake
 *   LockManager and a fake BroadcastChannel bus but get their OWN EventSource
 *   factory, so "this tab opened zero sockets" is directly assertable.
 * - Quality Contribution: Guards the socket-count invariant that the whole change
 *   exists to establish.
 * - Worked Example: see 'follower opens ZERO EventSources and still receives events'.
 *
 * Plan 072: SSE Multiplexing — Phase 2
 */

import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import {
  MultiplexedSSEProvider,
  useMultiplexedSSE,
} from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import type {
  SSEBroadcastChannel,
  SSELockManager,
} from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import type { EventSourceFactory } from '../../../../apps/web/src/lib/sse/types';
import { createFakeMultiplexedSSEFactory } from '../../../../test/fakes';

/**
 * Fake Web Locks manager modelling the real grant/queue semantics:
 * one holder at a time, FIFO queue, granted when the holder's promise resolves,
 * and removal from the queue on abort.
 *
 * `asyncGrant` opts into delivering the granted callback a microtask late. The real
 * API is asynchronous and the Web Locks spec documents the abort/grant race as
 * inherent, so a double that always grants inline cannot express a grant landing
 * after its requester was torn down — it would report on the double, not the code.
 * Default stays synchronous so the other tests are unaffected.
 */
function createFakeLockManager(
  opts: { asyncGrant?: boolean } = {}
): SSELockManager & { isHeld(name: string): boolean } {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();
  const deliver = opts.asyncGrant
    ? (fn: () => void) => queueMicrotask(fn)
    : (fn: () => void) => fn();

  return {
    isHeld: (name: string) => held.has(name),

    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const grant = () => {
          // The decision is atomic even when delivery is not — the browser's lock
          // table is updated the moment the lock is won, so mutual exclusion holds.
          held.add(name);
          // Deliberately NOT re-checking the signal: once won, an abort no longer
          // cancels anything. That losing race is the whole point of this mode.
          deliver(() => {
            // Native locks release on EITHER settlement and propagate the failure to
            // the request promise. Finalizing only on fulfilment strands both the lock
            // and the queue, and leaves the request pending forever.
            const finalize = (settleOuter: () => void) => {
              held.delete(name);
              settleOuter();
              const next = queues.get(name)?.shift();
              if (next) next();
            };
            // The try is not redundant with the rejection handler: a SYNCHRONOUS throw
            // out of callback() never reaches .then at all. Inline it would escape into
            // the Promise executor (rejecting, but skipping held.delete); deferred it is
            // an uncaught microtask exception and nothing ever settles.
            let result: unknown;
            try {
              result = callback();
            } catch (err) {
              finalize(() => reject(err));
              return;
            }
            Promise.resolve(result).then(
              () => finalize(() => resolve(undefined)),
              (err) => finalize(() => reject(err))
            );
          });
        };

        if (options.signal?.aborted) {
          reject(new Error('AbortError'));
          return;
        }

        if (!held.has(name)) {
          grant();
          return;
        }

        const queue = queues.get(name) ?? [];
        queue.push(grant);
        queues.set(name, queue);

        options.signal?.addEventListener('abort', () => {
          const q = queues.get(name);
          const idx = q?.indexOf(grant) ?? -1;
          if (idx >= 0) {
            q?.splice(idx, 1);
            reject(new Error('AbortError'));
          }
        });
      });
    },
  };
}

/**
 * Fake BroadcastChannel bus. Mirrors the real API's key property: a channel does
 * NOT receive its own postMessage, only sibling channels on the same name do.
 */
function createFakeBroadcastBus() {
  const byName = new Map<string, Set<FakeChannel>>();

  class FakeChannel implements SSEBroadcastChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    private closed = false;

    constructor(readonly name: string) {
      const set = byName.get(name) ?? new Set<FakeChannel>();
      set.add(this);
      byName.set(name, set);
    }

    postMessage(message: unknown) {
      if (this.closed) return;
      // Structured-clone approximation — proves we only send serialisable data.
      const cloned = JSON.parse(JSON.stringify(message));
      for (const ch of byName.get(this.name) ?? []) {
        if (ch === this || ch.closed) continue;
        ch.onmessage?.({ data: cloned });
      }
    }

    close() {
      this.closed = true;
      byName.get(this.name)?.delete(this);
    }
  }

  return {
    factory: (name: string): SSEBroadcastChannel => new FakeChannel(name),
    channelCount: (name: string) => byName.get(name)?.size ?? 0,
  };
}

const CHANNELS = ['event-popper', 'file-changes'];
const LOCK_NAME = `chainglass-sse-leader:${CHANNELS.join(',')}`;

/** Subscribes to a channel and records every event it receives. */
function Recorder({ channel, sink }: { channel: string; sink: string[] }) {
  const { subscribe } = useMultiplexedSSE();
  useEffect(() => subscribe(channel, (e) => sink.push(e.type ?? '')), [subscribe, channel, sink]);
  return null;
}

/** Renders one "tab" with its own EventSource factory, sharing lock + bus. */
function renderTab(
  opts: {
    locks?: SSELockManager;
    bus?: ReturnType<typeof createFakeBroadcastBus>;
    children?: ReactNode;
    channels?: string[];
    /** Wrap in StrictMode to drive setup #1 → cleanup #1 → setup #2 on one mount. */
    strict?: boolean;
    /** Replace the recording fake, e.g. with a factory that throws. */
    eventSourceFactory?: EventSourceFactory;
  } = {}
) {
  const fake = createFakeMultiplexedSSEFactory();
  const tree = (
    <MultiplexedSSEProvider
      channels={opts.channels ?? CHANNELS}
      eventSourceFactory={opts.eventSourceFactory ?? fake.factory}
      lockManager={opts.locks}
      broadcastFactory={opts.bus?.factory}
    >
      {opts.children}
    </MultiplexedSSEProvider>
  );
  const view = render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { fake, ...view };
}

/** Flush the microtasks the lock grant/release chain runs on. */
async function flush(ticks = 2) {
  await act(async () => {
    for (let i = 0; i < ticks; i++) await Promise.resolve();
  });
}

describe('MultiplexedSSEProvider — leader election', () => {
  it('leader opens exactly one EventSource', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();

    const tab = renderTab({ locks, bus });
    await flush();

    expect(tab.fake.instanceCount).toBe(1);
    expect(tab.fake.instance?.url).toBe('/api/events/mux?channels=event-popper,file-changes');
    expect(locks.isHeld(LOCK_NAME)).toBe(true);
  });

  it('follower opens ZERO EventSources and still receives events', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();
    const followerSink: string[] = [];

    // Tab A mounts first → wins the lock → leader.
    const leader = renderTab({ locks, bus });
    await flush();

    // Tab B mounts second → lock is taken → follower.
    const follower = renderTab({
      locks,
      bus,
      children: <Recorder channel="event-popper" sink={followerSink} />,
    });
    await flush();

    // THE INVARIANT: the whole browser holds one socket, and it is not this tab's.
    expect(follower.fake.instanceCount).toBe(0);
    expect(leader.fake.instanceCount).toBe(1);

    // ...and the follower still gets the data, fanned out over the channel.
    act(() => leader.fake.simulateOpen());
    act(() => leader.fake.simulateChannelMessage('event-popper', 'question-asked'));

    expect(followerSink).toEqual(['question-asked']);
    expect(follower.fake.instanceCount).toBe(0);
  });

  it('promotes a follower to leader when the leader unmounts', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();
    const promotedSink: string[] = [];

    const leader = renderTab({ locks, bus });
    await flush();

    const follower = renderTab({
      locks,
      bus,
      children: <Recorder channel="event-popper" sink={promotedSink} />,
    });
    await flush();
    expect(follower.fake.instanceCount).toBe(0);

    // Leader tab closes — its lock is released, the follower is granted it.
    await act(async () => {
      leader.unmount();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(follower.fake.instanceCount).toBe(1);
    expect(locks.isHeld(LOCK_NAME)).toBe(true);

    // The promoted tab now serves its own subscribers from its own socket.
    act(() => follower.fake.simulateOpen());
    act(() => follower.fake.simulateChannelMessage('event-popper', 'after-promotion'));
    expect(promotedSink).toEqual(['after-promotion']);
  });

  it('never dispatches control messages to channel subscribers', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();
    const leaderSink: string[] = [];
    const followerSink: string[] = [];

    const leader = renderTab({
      locks,
      bus,
      children: <Recorder channel="event-popper" sink={leaderSink} />,
    });
    await flush();

    // Mounting a follower makes it post `hello`, and the leader answer with
    // `status` — both control messages crossing the bus in both directions.
    const follower = renderTab({
      locks,
      bus,
      children: <Recorder channel="event-popper" sink={followerSink} />,
    });
    await flush();

    act(() => leader.fake.simulateOpen());
    await flush();

    // Neither side's subscribers saw any of that control traffic.
    expect(leaderSink).toEqual([]);
    expect(followerSink).toEqual([]);

    // Even a wire payload that carries __control must not be dispatched.
    act(() =>
      leader.fake.instance?.simulateMessage(
        JSON.stringify({ channel: 'event-popper', type: 'spoofed', __control: 'status' })
      )
    );
    expect(leaderSink).toEqual([]);
    expect(followerSink).toEqual([]);

    // A normal payload on the same channel still gets through.
    act(() => leader.fake.simulateChannelMessage('event-popper', 'real-event'));
    expect(leaderSink).toEqual(['real-event']);
    expect(followerSink).toEqual(['real-event']);
  });

  it('propagates leader connection status to followers', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();
    let followerConnected = false;

    function StatusProbe() {
      const { isConnected } = useMultiplexedSSE();
      followerConnected = isConnected;
      return null;
    }

    const leader = renderTab({ locks, bus });
    await flush();

    act(() => leader.fake.simulateOpen());

    // Follower mounts after the leader is already open: its `hello` must be
    // answered with the current status, not left stale.
    renderTab({ locks, bus, children: <StatusProbe /> });
    await flush();

    expect(followerConnected).toBe(true);
  });

  it('falls back to a per-tab EventSource when the APIs are absent', async () => {
    const bus = createFakeBroadcastBus();

    // No lock manager, and jsdom has no navigator.locks → coordination impossible.
    // Both APIs are required; BroadcastChannel alone must not enable the path.
    const tab = renderTab({ locks: undefined, bus });
    await flush();

    expect(tab.fake.instanceCount).toBe(1);
    expect(bus.channelCount(`chainglass-sse:${CHANNELS.join(',')}`)).toBe(0);
  });

  it('does not strand the lock when a grant lands after its own effect run is disposed', async () => {
    const locks = createFakeLockManager({ asyncGrant: true });
    const bus = createFakeBroadcastBus();

    // StrictMode runs setup #1 → cleanup #1 → setup #2 on a single mount. With the
    // grant delivered a microtask late, run #1 wins the lock and is torn down before
    // its callback arrives — the stale grant the abort cannot cancel. `mountedRef` is
    // no defence: setup #2 has already set it back to true.
    const tab = renderTab({ locks, bus, strict: true });
    await flush(8);

    // The LIVE run leads, holding the one socket for the browser.
    expect(locks.isHeld(LOCK_NAME)).toBe(true);
    expect(tab.fake.instanceCount).toBe(1);

    // The real proof: because no disposed run kept the lock, closing the tab actually
    // gives it back. A stranded grant would hold it for the life of the document with
    // its `release` unreachable, and there is no heartbeat or TTL to reclaim it.
    await act(async () => {
      tab.unmount();
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });
    expect(locks.isHeld(LOCK_NAME)).toBe(false);

    // ...so a fresh tab can still become leader: the pipe is not browser-wide dead.
    const next = renderTab({ locks, bus });
    await flush(4);
    expect(next.fake.instanceCount).toBe(1);
    expect(locks.isHeld(LOCK_NAME)).toBe(true);
  });

  it('releases the lock and grants the next waiter when a holder fails', async () => {
    // Direct test of the double itself. Native locks release on EITHER settlement,
    // so a fake that finalizes only on fulfilment reports on itself rather than on
    // the provider — it makes the failure path structurally untestable.
    const locks = createFakeLockManager();
    const order: string[] = [];

    // A throws SYNCHRONOUSLY — the path that never reaches a .then handler at all.
    const a = locks.request('L', {}, () => {
      order.push('a');
      throw new Error('sync boom');
    });
    await expect(a).rejects.toThrow('sync boom');
    expect(locks.isHeld('L')).toBe(false);

    // B rejects asynchronously with C already queued behind it.
    const b = locks.request('L', {}, () => {
      order.push('b');
      return Promise.reject(new Error('async boom'));
    });
    let releaseC: (() => void) | undefined;
    const c = locks.request('L', {}, () => {
      order.push('c');
      return new Promise<void>((resolve) => {
        releaseC = resolve;
      });
    });

    await expect(b).rejects.toThrow('async boom');
    // C was granted off the back of a REJECTION, not a resolution.
    expect(order).toEqual(['a', 'b', 'c']);
    expect(locks.isHeld('L')).toBe(true);

    releaseC?.();
    await c;
    expect(locks.isHeld('L')).toBe(false);
  });

  it('degrades to a working follower when the leader body throws', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();
    const sink: string[] = [];
    const seen: Array<{ connected: boolean; error: string | null }> = [];
    const latest = () => seen[seen.length - 1];

    function Probe() {
      const { isConnected, error } = useMultiplexedSSE();
      seen.push({ connected: isConnected, error: error?.message ?? null });
      return null;
    }

    // Tab A wins the lock, then fails to build its socket. The real browser rejects
    // the request and releases the lock, so another tab legitimately leads — but
    // `isLeaderRef` is set BEFORE the throwing call, so without standing down this
    // tab keeps believing it leads while holding nothing.
    const failed = renderTab({
      locks,
      bus,
      eventSourceFactory: () => {
        throw new Error('EventSource boom');
      },
      children: (
        <>
          <Probe />
          <Recorder channel="event-popper" sink={sink} />
        </>
      ),
    });
    await flush();

    // It stood down from a lock it cannot use...
    expect(locks.isHeld(LOCK_NAME)).toBe(false);
    // ...and said so, rather than failing silently.
    expect(latest().error).toBe('EventSource boom');

    // A healthy tab now leads for real.
    const leader = renderTab({ locks, bus });
    await flush();
    expect(leader.fake.instanceCount).toBe(1);
    expect(locks.isHeld(LOCK_NAME)).toBe(true);

    // THE BAR: not merely "stopped leading" — a phantom leader still has
    // isLeaderRef true, so `!isLeaderRef.current` at provider:311 and :323 is false
    // and it drops every status update and every data message for the life of the
    // tab, silently. A tab that is neither leader nor working follower is the same
    // dead tab with a different cause. So assert it actually FOLLOWS:
    act(() => leader.fake.simulateOpen());
    expect(latest().connected).toBe(true); // status adopted from the real leader
    act(() => leader.fake.simulateChannelMessage('event-popper', 'after-stand-down'));
    expect(sink).toEqual(['after-stand-down']); // data dispatched to its subscribers

    failed.unmount();
  });

  it('keeps a channel Set alive until its last subscriber unsubscribes', async () => {
    const locks = createFakeLockManager();
    const bus = createFakeBroadcastBus();
    const kept: string[] = [];
    const dropped: string[] = [];
    let unsubDropped: (() => void) | null = null;

    function TwoSubscribers() {
      const { subscribe } = useMultiplexedSSE();
      useEffect(() => {
        const unsubKeep = subscribe('event-popper', (e) => kept.push(e.type ?? ''));
        unsubDropped = subscribe('event-popper', (e) => dropped.push(e.type ?? ''));
        return () => {
          unsubKeep();
          unsubDropped?.();
        };
      }, [subscribe]);
      return null;
    }

    const tab = renderTab({ locks, bus, children: <TwoSubscribers /> });
    await flush();
    act(() => tab.fake.simulateOpen());

    act(() => tab.fake.simulateChannelMessage('event-popper', 'first'));
    expect(kept).toEqual(['first']);
    expect(dropped).toEqual(['first']);

    // Removing ONE subscriber must not tear down the channel's Set.
    act(() => unsubDropped?.());
    act(() => tab.fake.simulateChannelMessage('event-popper', 'second'));

    expect(kept).toEqual(['first', 'second']);
    expect(dropped).toEqual(['first']);
  });
});
