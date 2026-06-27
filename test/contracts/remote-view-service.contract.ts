/**
 * Contract test factory for IRemoteViewService implementations.
 *
 * Plan 088 Phase 2 — T009. Runs against FakeRemoteViewService now; the
 * daemon-backed real adapter (Phase 5) must pass this SAME suite verbatim — so
 * the SessionSummary field set and method semantics are frozen here.
 */
import type { IRemoteViewService } from '@/features/088-remote-view/server/remote-view-service';
import { FAKE_WINDOW } from '@/features/088-remote-view/testing/fixtures';
import { beforeEach, describe, expect, it } from 'vitest';

export function remoteViewServiceContractTests(
  makeService: () => IRemoteViewService,
  name: string
): void {
  describe(`${name} implements IRemoteViewService contract`, () => {
    let svc: IRemoteViewService;
    beforeEach(() => {
      svc = makeService();
    });

    it('list() is empty before any attach', () => {
      /*
      Test Doc:
      - Why: a fresh service holds no sessions; the picker shows none.
      - Contract: list() → [] on a new service.
      - Usage Notes: list() returns only active (non-closed) sessions.
      - Quality Contribution: pins the empty baseline.
      - Worked Example: new service → list() === [].
      */
      expect(svc.list()).toEqual([]);
    });

    it('attach() returns a SessionSummary with windowId/app/title/state', async () => {
      /*
      Test Doc:
      - Why: attaching a window must yield the full summary the picker + agents render (Workshop 002).
      - Contract: attach(windowId) → {sessionId, windowId, app, title, state:'streaming'}.
      - Usage Notes: app/title come from the shared FAKE_WINDOW descriptor.
      - Quality Contribution: pins the attach return shape.
      - Worked Example: attach(34202) → app 'Godot', title 'spike-target', streaming.
      */
      const s = await svc.attach(FAKE_WINDOW.id);
      expect(s.windowId).toBe(FAKE_WINDOW.id);
      expect(s.app).toBe(FAKE_WINDOW.app);
      expect(s.title).toBe(FAKE_WINDOW.title);
      expect(s.state).toBe('streaming');
      expect(typeof s.sessionId).toBe('string');
      expect(s.sessionId.length).toBeGreaterThan(0);
    });

    it('getSession() round-trips the attached summary; list() includes it', async () => {
      /*
      Test Doc:
      - Why: a session created by attach must be retrievable by id and visible in the list.
      - Contract: getSession(id) deep-equals the attach result; list() contains it.
      - Usage Notes: returns copies — callers can't mutate internal state.
      - Quality Contribution: pins lookup + listing consistency.
      - Worked Example: attach → getSession(id) === the summary.
      */
      const s = await svc.attach(FAKE_WINDOW.id);
      expect(svc.getSession(s.sessionId)).toEqual(s);
      expect(svc.list().map((x) => x.sessionId)).toContain(s.sessionId);
    });

    it('attach() is idempotent per window (one session ↔ one window)', async () => {
      /*
      Test Doc:
      - Why: single-viewer v1 — a window has at most one session; re-attaching reuses it.
      - Contract: attach(w) twice → same sessionId; list() length 1.
      - Usage Notes: an agent and the user both "attaching" the same window converge.
      - Quality Contribution: encodes the one-session-per-window invariant.
      - Worked Example: attach(34202), attach(34202) → identical sessionId.
      */
      const a = await svc.attach(FAKE_WINDOW.id);
      const b = await svc.attach(FAKE_WINDOW.id);
      expect(b.sessionId).toBe(a.sessionId);
      expect(svc.list()).toHaveLength(1);
    });

    it('detach() closes the session: getSession→null, list excludes it', async () => {
      /*
      Test Doc:
      - Why: an explicit detach must remove the session from view (Workshop 002 R9 closed).
      - Contract: after detach(id), getSession(id) → null and list() excludes it.
      - Usage Notes: closed sessions are filtered from list().
      - Quality Contribution: pins teardown semantics.
      - Worked Example: attach → detach → getSession null, list [].
      */
      const s = await svc.attach(FAKE_WINDOW.id);
      await svc.detach(s.sessionId);
      expect(svc.getSession(s.sessionId)).toBeNull();
      expect(svc.list()).toEqual([]);
    });

    it('getSession(unknown) → null', () => {
      /*
      Test Doc:
      - Why: looking up a non-existent session must not throw.
      - Contract: getSession(missing) → null.
      - Usage Notes: graceful handling for stale rv params.
      - Quality Contribution: pins the safe-lookup behaviour.
      - Worked Example: getSession('ses_nope') → null.
      */
      expect(svc.getSession('ses_nope')).toBeNull();
    });

    it('SessionSummary carries windowId + title (R4 SSE push, R6 auto-recreate)', async () => {
      /*
      Test Doc:
      - Why: R4 (SSE attach push names the window) and R6 (auto-recreate by windowId) both consume these fields — they must be in the frozen shape.
      - Contract: the summary has both windowId and title.
      - Usage Notes: this field set is reused verbatim by the Phase 5 real adapter.
      - Quality Contribution: forecloses a missing-field drift before Phase 5.
      - Worked Example: attach → summary.windowId === 34202, summary.title defined.
      */
      const s = await svc.attach(FAKE_WINDOW.id);
      expect(s).toHaveProperty('windowId', FAKE_WINDOW.id);
      expect(typeof s.title).toBe('string');
    });
  });
}
