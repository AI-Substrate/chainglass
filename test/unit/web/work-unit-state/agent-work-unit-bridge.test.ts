/**
 * Plan 059 Phase 2: AgentWorkUnitBridge tests.
 *
 * Tests the bridge between agent lifecycle and WorkUnitStateService,
 * including WorkflowEvents observer subscriptions.
 *
 * Test Doc:
 * - Why: Verify bridge correctly maps agent lifecycle to work unit status, including WF observer subscriptions
 * - Contract: AgentWorkUnitBridge — registerAgent, updateAgentStatus, unregisterAgent
 * - Usage Notes: Uses FakeWorkUnitStateService + FakeWorkflowEventsService; observer tests trigger via askQuestion/answerQuestion
 * - Quality Contribution: 12 tests covering register, update, unregister, observer subscription/unsubscription, cross-agent isolation
 * - Worked Example: registerAgent with sourceRef → WF askQuestion fires → status becomes waiting_input → answerQuestion → working
 */

import { FakeWorkflowEventsService } from '@chainglass/shared/fakes';
import { FakeWorkUnitStateService } from '@chainglass/shared/fakes';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgentWorkUnitBridge } from '../../../../apps/web/src/features/059-fix-agents/agent-work-unit-bridge.js';

describe('AgentWorkUnitBridge', () => {
  let workUnitState: FakeWorkUnitStateService;
  let workflowEvents: FakeWorkflowEventsService;
  let bridge: AgentWorkUnitBridge;

  beforeEach(() => {
    workUnitState = new FakeWorkUnitStateService();
    workflowEvents = new FakeWorkflowEventsService();
    bridge = new AgentWorkUnitBridge(workUnitState, workflowEvents);
  });

  describe('registerAgent', () => {
    it('should register agent in WorkUnitStateService', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'claude-code');
      const unit = workUnitState.getUnit('agent-1');
      expect(unit).toBeDefined();
      expect(unit?.name).toBe('Test Agent');
      expect(unit?.creator.type).toBe('agent');
      expect(unit?.creator.label).toBe('claude-code');
    });

    it('should store sourceRef when provided', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-1',
      });
      const unit = workUnitState.getUnit('agent-1');
      expect(unit?.sourceRef).toEqual({ graphSlug: 'graph-1', nodeId: 'node-1' });
    });

    it('should subscribe to WF observers when sourceRef provided', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-1',
      });
      expect(bridge.getSubscriptionCount()).toBe(1);
      // 2 observers: onQuestionAsked + onQuestionAnswered
      expect(workflowEvents.getObserverCountFor('graph-1', 'question-asked')).toBe(1);
      expect(workflowEvents.getObserverCountFor('graph-1', 'question-answered')).toBe(1);
    });

    it('should not subscribe when no sourceRef', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'copilot');
      expect(bridge.getSubscriptionCount()).toBe(0);
    });
  });

  describe('updateAgentStatus', () => {
    it('should update status via WorkUnitStateService', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'claude-code');
      bridge.updateAgentStatus('agent-1', 'working', 'Building');
      const unit = workUnitState.getUnit('agent-1');
      expect(unit?.status).toBe('working');
      expect(unit?.intent).toBe('Building');
    });
  });

  describe('unregisterAgent', () => {
    it('should remove from WorkUnitStateService', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'claude-code');
      bridge.unregisterAgent('agent-1');
      expect(workUnitState.getUnit('agent-1')).toBeUndefined();
    });

    it('should unsubscribe WF observers', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-1',
      });
      expect(workflowEvents.getObserverCountFor('graph-1', 'question-asked')).toBe(1);
      bridge.unregisterAgent('agent-1');
      expect(bridge.getSubscriptionCount()).toBe(0);
      expect(workflowEvents.getObserverCountFor('graph-1', 'question-asked')).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'claude-code');
      bridge.unregisterAgent('agent-1');
      bridge.unregisterAgent('agent-1');
      // Should not throw
    });
  });

  describe('observer-driven status updates', () => {
    it('should set waiting_input when question asked for agent node', async () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-1',
      });
      bridge.updateAgentStatus('agent-1', 'working');

      // Simulate question being asked via WorkflowEvents
      await workflowEvents.askQuestion('graph-1', 'node-1', {
        type: 'confirm',
        text: 'Deploy to prod?',
      });

      const unit = workUnitState.getUnit('agent-1');
      expect(unit?.status).toBe('waiting_input');
      expect(unit?.intent).toBe('Deploy to prod?');
    });

    it('should set working when question answered for agent node', async () => {
      bridge.registerAgent('agent-1', 'Test Agent', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-1',
      });

      // Ask then answer
      const { questionId } = await workflowEvents.askQuestion('graph-1', 'node-1', {
        type: 'confirm',
        text: 'Deploy?',
      });
      // After ask, status is waiting_input
      expect(workUnitState.getUnit('agent-1')?.status).toBe('waiting_input');

      await workflowEvents.answerQuestion('graph-1', 'node-1', questionId, { confirmed: true });
      expect(workUnitState.getUnit('agent-1')?.status).toBe('working');
    });

    it('should not affect unrelated agents in same graph', async () => {
      bridge.registerAgent('agent-1', 'Agent 1', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-1',
      });
      bridge.registerAgent('agent-2', 'Agent 2', 'copilot', {
        graphSlug: 'graph-1',
        nodeId: 'node-2',
      });
      bridge.updateAgentStatus('agent-1', 'working');
      bridge.updateAgentStatus('agent-2', 'working');

      // Question asked for node-1 only
      await workflowEvents.askQuestion('graph-1', 'node-1', {
        type: 'confirm',
        text: 'Deploy?',
      });

      expect(workUnitState.getUnit('agent-1')?.status).toBe('waiting_input');
      expect(workUnitState.getUnit('agent-2')?.status).toBe('working');
    });
  });

  describe('without workflowEvents', () => {
    it('should work without WF events service', () => {
      const bridgeNoWF = new AgentWorkUnitBridge(workUnitState);
      bridgeNoWF.registerAgent('agent-1', 'Test', 'copilot', {
        graphSlug: 'g',
        nodeId: 'n',
      });
      // No subscriptions even with sourceRef
      expect(bridgeNoWF.getSubscriptionCount()).toBe(0);
      // Still registers in work unit state
      expect(workUnitState.getUnit('agent-1')).toBeDefined();
    });
  });
});
