// @vitest-environment node
/**
 * Plan 088 Phase 2 — T009: IRemoteViewService contract + DI registration.
 *
 * Runs the contract suite against FakeRemoteViewService and verifies the
 * REMOTE_VIEW_SERVICE token is wired in both DI containers (the test container
 * resolves the working fake; the production factory resolves the Phase-5
 * placeholder). createProductionContainer is NOT instantiated here — it eagerly
 * constructs the CopilotClient SDK + many services (too heavy/fragile for a unit
 * test) — so the production-side service is exercised via its factory directly.
 */
import {
  FakeRemoteViewService,
  type IRemoteViewService,
  createUnimplementedRemoteViewService,
} from '@/features/088-remote-view/server/remote-view-service';
import { DI_TOKENS, createTestContainer } from '@/lib/di-container';
import { describe, expect, it } from 'vitest';
import { remoteViewServiceContractTests } from './remote-view-service.contract';

remoteViewServiceContractTests(() => new FakeRemoteViewService(), 'FakeRemoteViewService');

describe('REMOTE_VIEW_SERVICE DI registration', () => {
  it('test container resolves a working fake service', () => {
    /*
    Test Doc:
    - Why: routes/UI resolve the service via DI; the test container must give a working fake (AC-12, daemon-absent).
    - Contract: createTestContainer().resolve(REMOTE_VIEW_SERVICE) returns a usable IRemoteViewService.
    - Usage Notes: useFactory registration (decorators banned, ADR-0004).
    - Quality Contribution: proves the test-container wiring.
    - Worked Example: resolve → list() === [].
    */
    const c = createTestContainer();
    const svc = c.resolve<IRemoteViewService>(DI_TOKENS.REMOTE_VIEW_SERVICE);
    expect(svc).toBeDefined();
    expect(svc.list()).toEqual([]);
  });

  it('production placeholder is resolvable but throws on use (real adapter Phase 5)', () => {
    /*
    Test Doc:
    - Why: the prod token must be registered today (resolvable) without faking a daemon that isn't there.
    - Contract: createUnimplementedRemoteViewService() returns an object whose methods throw a Phase-5 message.
    - Usage Notes: this is exactly what the production container's useFactory returns.
    - Quality Contribution: keeps prod honest — no silent fake in production.
    - Worked Example: prod svc.list() → throws "real adapter lands in Plan 088 Phase 5".
    */
    const svc = createUnimplementedRemoteViewService();
    expect(svc).toBeDefined();
    expect(() => svc.list()).toThrow(/Phase 5/);
  });
});
