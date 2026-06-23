// @vitest-environment node
/**
 * Plan 088 Phase 5 — T006: SSE envelopes from the real adapter (producer half).
 *
 * The daemon-backed adapter emits `remote-view` domain events on the central
 * notifier at the attach/detach seams T003 marked: `attached` on a successful
 * attach (carrying the SessionSummary so the client push can name the window —
 * R4), `detached` on teardown. The notifier is an OPTIONAL dep (mirrors `logger?`)
 * — the frozen Phase-2 contract suite + the T003 orchestration tests construct the
 * adapter without one and must keep passing, so a missing notifier is a silent
 * no-op, never a throw.
 */
import type { DaemonInfo } from '@/features/088-remote-view/server/daemon-manager';
import {
  type DaemonSessionsClient,
  RealRemoteViewService,
  type SessionSummary,
} from '@/features/088-remote-view/server/remote-view-service';
import { FAKE_WINDOW } from '@/features/088-remote-view/testing/fixtures';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { describe, expect, it } from 'vitest';

const FAKE_INFO: DaemonInfo = { daemonPort: 7099, daemonVersion: '0.1.0', protocolVersion: 1 };

/** Minimal daemon-double — one deterministic session per window. */
function makeTransport(): DaemonSessionsClient {
  let n = 0;
  const byWindow = new Map<number, SessionSummary>();
  return {
    async create(_port, windowId) {
      const existing = byWindow.get(windowId);
      if (existing) return { ...existing };
      n += 1;
      const s: SessionSummary = {
        sessionId: `ses_sse${n}`,
        windowId,
        app: 'Godot',
        title: 'spike-target',
        state: 'streaming',
      };
      byWindow.set(windowId, s);
      return { ...s };
    },
    async remove(_port, sessionId) {
      for (const [w, s] of byWindow) if (s.sessionId === sessionId) byWindow.delete(w);
    },
  };
}

describe('RealRemoteViewService — SSE envelopes (T006)', () => {
  it('attach() emits a remote-view "attached" event carrying the session summary', async () => {
    /*
    Test Doc:
    - Why: an agent (or UI) attach must push onto the `remote-view` SSE channel so an open client can switch to the live session (AC-8 push half); R4 wants the window named, so the summary rides along.
    - Contract: attach(windowId) → notifier.emit(WorkspaceDomain.RemoteView, 'attached', {sessionId,windowId,app,title,state}) exactly once.
    - Usage Notes: domain value IS the channel id ('remote-view') — no mapping table; data is the frozen SessionSummary field set.
    - Quality Contribution: pins the producer side of the agent-attach push.
    - Worked Example: attach(34202) → emit('remote-view','attached',{sessionId:'ses_sse1',windowId:34202,app:'Godot',title:'spike-target',state:'streaming'}).
    */
    const notifier = new FakeCentralEventNotifier();
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: makeTransport(),
      notifier,
    });
    const s = await svc.attach(FAKE_WINDOW.id);
    expect(notifier.emittedEvents).toEqual([
      {
        domain: WorkspaceDomain.RemoteView,
        eventType: 'attached',
        data: {
          sessionId: s.sessionId,
          windowId: s.windowId,
          app: s.app,
          title: s.title,
          state: s.state,
        },
      },
    ]);
  });

  it('detach() emits a remote-view "detached" event with the session id', async () => {
    /*
    Test Doc:
    - Why: a teardown must tell open clients the session is gone so they can drop the viewport (AC-8 lifecycle).
    - Contract: detach(id) on a live session → notifier.emit(WorkspaceDomain.RemoteView, 'detached', {sessionId}) once.
    - Usage Notes: minimal payload per ADR-0007 — just the identifier; the client re-derives state.
    - Quality Contribution: pins the detached envelope.
    - Worked Example: attach→detach → second event is ('remote-view','detached',{sessionId}).
    */
    const notifier = new FakeCentralEventNotifier();
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: makeTransport(),
      notifier,
    });
    const s = await svc.attach(FAKE_WINDOW.id);
    notifier.emittedEvents.length = 0; // ignore the attach event
    await svc.detach(s.sessionId);
    expect(notifier.emittedEvents).toEqual([
      {
        domain: WorkspaceDomain.RemoteView,
        eventType: 'detached',
        data: { sessionId: s.sessionId },
      },
    ]);
  });

  it('detach(unknown) emits nothing (no daemon round-trip, no event)', async () => {
    /*
    Test Doc:
    - Why: detaching a stale/unknown id must not fabricate a 'detached' event for a session that never existed.
    - Contract: detach('ses_nope') → zero emitted events.
    - Usage Notes: mirrors the T003 no-op detach (no ensureDaemon, no transport call) — and now no emit either.
    - Quality Contribution: prevents phantom lifecycle events on stale rv params.
    - Worked Example: detach('ses_nope') → emittedEvents === [].
    */
    const notifier = new FakeCentralEventNotifier();
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: makeTransport(),
      notifier,
    });
    await svc.detach('ses_nope');
    expect(notifier.emittedEvents).toEqual([]);
  });

  it('attach()/detach() never throw when no notifier is wired (optional dependency)', async () => {
    /*
    Test Doc:
    - Why: the frozen contract suite + T003 orchestration tests build the adapter with no notifier; T006 must not break them.
    - Contract: new RealRemoteViewService({ensureDaemon,sessions}) (no notifier) → attach + detach resolve.
    - Usage Notes: notifier is optional like logger; emit is guarded with `?.`.
    - Quality Contribution: guarantees backward compatibility of the adapter constructor.
    - Worked Example: attach(34202) then detach(id) both resolve with no notifier present.
    */
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: makeTransport(),
    });
    const s = await svc.attach(FAKE_WINDOW.id);
    await expect(svc.detach(s.sessionId)).resolves.toBeUndefined();
  });
});
