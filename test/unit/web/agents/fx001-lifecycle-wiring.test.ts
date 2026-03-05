/**
 * @vitest-environment node
 */
/**
 * Test Doc:
 * - Why: Direct FX001 AC verification — POST registers, status updates, DELETE unregisters
 * - Contract: AgentWorkUnitBridge receives register/update/unregister calls via notifier + routes
 * - Usage Notes: Uses FakeWorkUnitStateService to assert bridge effects without filesystem
 * - Quality Contribution: Covers the exact lifecycle gap FX001 fixes
 * - Worked Example: Create agent → bridge registers → notifier status → bridge updates → unregister
 */

import { FakeWorkUnitStateService } from '@chainglass/shared';
import type { ISSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/sse-broadcaster.interface';
import { describe, expect, it } from 'vitest';
import { AgentNotifierService } from '../../../../apps/web/src/features/019-agent-manager-refactor/agent-notifier.service';
import { AgentWorkUnitBridge } from '../../../../apps/web/src/features/059-fix-agents/agent-work-unit-bridge';

/** No-op broadcaster for test isolation. */
const noopBroadcaster: ISSEBroadcaster = {
  broadcast: () => {},
};

describe('FX001: Agent → WorkUnitState lifecycle wiring', () => {
  function setup() {
    const fakeState = new FakeWorkUnitStateService();
    const bridge = new AgentWorkUnitBridge(fakeState);
    const resolveBridge = () => bridge;
    const notifier = new AgentNotifierService(noopBroadcaster, resolveBridge);
    return { fakeState, bridge, notifier };
  }

  it('FX001-AC1: registerAgent writes entry to WorkUnitStateService', () => {
    const { fakeState, bridge } = setup();

    bridge.registerAgent('agent-1', 'Test Agent', 'copilot');

    const entry = fakeState.getUnit('agent-1');
    expect(entry).toBeDefined();
    expect(entry?.name).toBe('Test Agent');
    expect(entry?.creator.type).toBe('agent');
    expect(entry?.creator.label).toBe('copilot');
    expect(entry?.status).toBe('idle');
  });

  it('FX001-AC2: broadcastStatus("working") updates status to working', () => {
    const { fakeState, bridge, notifier } = setup();

    bridge.registerAgent('agent-1', 'Test Agent', 'copilot');
    notifier.broadcastStatus('agent-1', 'working');

    expect(fakeState.getUnit('agent-1')?.status).toBe('working');
  });

  it('FX001-AC3: broadcastStatus("stopped") updates status to idle', () => {
    const { fakeState, bridge, notifier } = setup();

    bridge.registerAgent('agent-1', 'Test Agent', 'copilot');
    notifier.broadcastStatus('agent-1', 'working');
    notifier.broadcastStatus('agent-1', 'stopped');

    expect(fakeState.getUnit('agent-1')?.status).toBe('idle');
  });

  it('FX001-AC2: broadcastStatus("error") updates status to error', () => {
    const { fakeState, bridge, notifier } = setup();

    bridge.registerAgent('agent-1', 'Test Agent', 'copilot');
    notifier.broadcastStatus('agent-1', 'error');

    expect(fakeState.getUnit('agent-1')?.status).toBe('error');
  });

  it('FX001-AC4: unregisterAgent removes entry from WorkUnitStateService', () => {
    const { fakeState, bridge } = setup();

    bridge.registerAgent('agent-1', 'Test Agent', 'copilot');
    expect(fakeState.getUnit('agent-1')).toBeDefined();

    bridge.unregisterAgent('agent-1');
    expect(fakeState.getUnit('agent-1')).toBeUndefined();
  });

  it('FX001 full lifecycle: create → working → stopped → delete', () => {
    const { fakeState, bridge, notifier } = setup();

    bridge.registerAgent('agent-1', 'Full Lifecycle', 'claude-code');
    expect(fakeState.getUnit('agent-1')?.status).toBe('idle');

    notifier.broadcastStatus('agent-1', 'working');
    expect(fakeState.getUnit('agent-1')?.status).toBe('working');

    notifier.broadcastStatus('agent-1', 'stopped');
    expect(fakeState.getUnit('agent-1')?.status).toBe('idle');

    bridge.unregisterAgent('agent-1');
    expect(fakeState.getUnit('agent-1')).toBeUndefined();
  });

  it('notifier handles missing bridge gracefully', () => {
    const notifierNoBridge = new AgentNotifierService(noopBroadcaster, () => undefined);
    expect(() => notifierNoBridge.broadcastStatus('agent-1', 'working')).not.toThrow();
  });

  it('notifier handles unregistered agent gracefully', () => {
    const { notifier } = setup();
    expect(() => notifier.broadcastStatus('nonexistent', 'working')).not.toThrow();
  });
});
