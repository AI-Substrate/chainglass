/**
 * Plan 059 Phase 2: AgentWorkUnitBridge
 *
 * Bridges agent lifecycle events into the centralized WorkUnitStateService.
 * Subscribes to WorkflowEvents observers (Plan 061) for graph-based agents
 * to auto-update status on question ask/answer.
 *
 * Usage:
 * ```ts
 * const bridge = new AgentWorkUnitBridge(workUnitState, workflowEvents);
 *
 * // When agent is created
 * bridge.registerAgent('agent-abc', 'Code Review', 'claude-code', {
 *   graphSlug: 'my-graph', nodeId: 'node-1'
 * });
 *
 * // When agent status changes
 * bridge.updateAgentStatus('agent-abc', 'working', 'Reviewing PR #42');
 *
 * // When agent terminates
 * bridge.unregisterAgent('agent-abc');
 * ```
 *
 * Observer lifecycle (DYK-R-01):
 * - register() subscribes to onQuestionAsked/onQuestionAnswered per sourceRef.graphSlug
 * - unregister() calls all unsubscribe functions for that agent
 * - Subscription keyed by work unit ID → unsubscribe functions
 */

import type { IWorkUnitStateService } from '@chainglass/shared/interfaces/work-unit-state.interface';
import type { IWorkflowEvents } from '@chainglass/shared/interfaces/workflow-events.interface';
import type { WorkUnitSourceRef, WorkUnitStatus } from '@chainglass/shared/work-unit-state';

export class AgentWorkUnitBridge {
  /** Maps work unit ID → array of unsubscribe functions for WF observers */
  private readonly subscriptions = new Map<string, (() => void)[]>();

  constructor(
    private readonly workUnitState: IWorkUnitStateService,
    private readonly workflowEvents?: IWorkflowEvents
  ) {}

  /**
   * Register an agent as a work unit.
   * If sourceRef is provided and workflowEvents is available, subscribes
   * to observer hooks for that graph to auto-update status on questions.
   */
  registerAgent(
    agentId: string,
    name: string,
    agentType: string,
    sourceRef?: WorkUnitSourceRef
  ): void {
    this.workUnitState.register({
      id: agentId,
      name,
      creator: { type: 'agent', label: agentType },
      sourceRef,
    });

    // Subscribe to WorkflowEvents observers if we have a graph source
    if (sourceRef && this.workflowEvents) {
      const unsubs: (() => void)[] = [];

      const unsubAsked = this.workflowEvents.onQuestionAsked(sourceRef.graphSlug, (event) => {
        // Find the work unit by source ref (DYK-R-02)
        const unit = this.workUnitState.getUnitBySourceRef(sourceRef.graphSlug, event.nodeId);
        if (unit) {
          this.workUnitState.updateStatus(unit.id, {
            status: 'waiting_input',
            intent: event.question.text,
          });
        }
      });
      unsubs.push(unsubAsked);

      const unsubAnswered = this.workflowEvents.onQuestionAnswered(sourceRef.graphSlug, (event) => {
        const unit = this.workUnitState.getUnitBySourceRef(sourceRef.graphSlug, event.nodeId);
        if (unit) {
          this.workUnitState.updateStatus(unit.id, { status: 'working' });
        }
      });
      unsubs.push(unsubAnswered);

      this.subscriptions.set(agentId, unsubs);
    }
  }

  /** Update an agent's status and optional intent. */
  updateAgentStatus(agentId: string, status: WorkUnitStatus, intent?: string): void {
    this.workUnitState.updateStatus(agentId, { status, intent });
  }

  /**
   * Unregister an agent and clean up observer subscriptions.
   * Safe to call multiple times.
   */
  unregisterAgent(agentId: string): void {
    // Unsubscribe from WorkflowEvents observers
    const unsubs = this.subscriptions.get(agentId);
    if (unsubs) {
      for (const unsub of unsubs) {
        unsub();
      }
      this.subscriptions.delete(agentId);
    }
    this.workUnitState.unregister(agentId);
  }

  /** Get current subscription count (test inspection). */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
