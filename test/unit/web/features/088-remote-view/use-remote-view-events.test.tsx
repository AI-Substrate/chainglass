/**
 * Plan 088 Phase 5 — T006: client push half (AC-8) — the open-client param switch.
 *
 * `useRemoteViewEvents` subscribes the `remote-view` SSE channel and, on an
 * `attached` envelope (e.g. an agent attached via CLI/MCP), invokes `onAttached`
 * with the session id — browser-client wires that to `setParams({view:'remote',
 * rv})`, pushing the user's content area onto the live session. Driven through the
 * real `useChannelEvents` + `MultiplexedSSEProvider` over a fake EventSource, so the
 * whole subscribe→accumulate→react path is exercised (not a mocked hook).
 */
import { useRemoteViewEvents } from '@/features/088-remote-view/hooks/use-remote-view-events';
import { MultiplexedSSEProvider } from '@/lib/sse/multiplexed-sse-provider';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeMultiplexedSSEFactory } from '../../../../fakes';

describe('useRemoteViewEvents (T006 — AC-8 push half)', () => {
  let fake: ReturnType<typeof createFakeMultiplexedSSEFactory>;

  beforeEach(() => {
    fake = createFakeMultiplexedSSEFactory();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <MultiplexedSSEProvider channels={['remote-view']} eventSourceFactory={fake.factory}>
        {children}
      </MultiplexedSSEProvider>
    );
  }

  it('calls onAttached with the session id when an "attached" event arrives', () => {
    /*
    Test Doc:
    - Why: an agent attach (no UI gesture) must push an open client onto the new session (AC-8 push half) — the listener turns the SSE envelope into a param switch.
    - Contract: incoming ('remote-view','attached',{sessionId}) → onAttached('<sessionId>') called once.
    - Usage Notes: browser-client passes onAttached = (rv) => setParams({view:'remote', rv}); here we assert the id reaches the callback.
    - Quality Contribution: pins the consumer side of the agent-attach push, end-to-end through useChannelEvents.
    - Worked Example: simulateChannelMessage('remote-view','attached',{sessionId:'ses_agent'}) → onAttached('ses_agent').
    */
    const onAttached = vi.fn();
    renderHook(() => useRemoteViewEvents({ onAttached }), { wrapper });

    act(() => fake.simulateOpen());
    act(() =>
      fake.simulateChannelMessage('remote-view', 'attached', {
        sessionId: 'ses_agent',
        windowId: 34202,
        app: 'Godot',
        title: 'spike-target',
        state: 'streaming',
      })
    );

    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(onAttached).toHaveBeenCalledWith('ses_agent');
  });

  it('ignores non-attached envelopes (detached / daemon-state do not push)', () => {
    /*
    Test Doc:
    - Why: only an attach should switch the content area; detached/daemon-state are lifecycle signals, not navigation.
    - Contract: ('remote-view','detached',{sessionId}) and ('remote-view','daemon-state',{state}) → onAttached NOT called.
    - Usage Notes: the listener filters on type==='attached'.
    - Quality Contribution: prevents spurious content-area pushes on teardown/health events.
    - Worked Example: detached + daemon-state arrive → onAttached call count 0.
    */
    const onAttached = vi.fn();
    renderHook(() => useRemoteViewEvents({ onAttached }), { wrapper });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('remote-view', 'detached', { sessionId: 'ses_old' }));
    act(() => fake.simulateChannelMessage('remote-view', 'daemon-state', { state: 'ready' }));

    expect(onAttached).not.toHaveBeenCalled();
  });

  it('does not push when disabled', () => {
    /*
    Test Doc:
    - Why: a consumer must be able to opt out (e.g. while the user is mid-action) without unsubscribing churn.
    - Contract: enabled:false + an 'attached' event → onAttached NOT called.
    - Usage Notes: drains queued messages while disabled so they don't fire on re-enable.
    - Quality Contribution: gives browser-client a clean suppression switch.
    - Worked Example: disabled hook + attached event → onAttached call count 0.
    */
    const onAttached = vi.fn();
    renderHook(() => useRemoteViewEvents({ onAttached, enabled: false }), { wrapper });

    act(() => fake.simulateOpen());
    act(() => fake.simulateChannelMessage('remote-view', 'attached', { sessionId: 'ses_x' }));

    expect(onAttached).not.toHaveBeenCalled();
  });
});
