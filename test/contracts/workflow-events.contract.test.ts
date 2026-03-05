/**
 * Contract test runner for IWorkflowEvents.
 *
 * Conformance tests run against both real and fake.
 * Behavioral tests run against fake only (DYK-P2-01: FakePGService
 * doesn't simulate state flow for real WFE testing).
 */

import { FakePositionalGraphService } from '@chainglass/positional-graph';
import { WorkflowEventObserverRegistry, WorkflowEventsService } from '@chainglass/positional-graph';
import { FakeWorkflowEventsService } from '@chainglass/shared/fakes';
import {
  workflowEventsBehavioralTests,
  workflowEventsConformanceTests,
} from './workflow-events.contract.js';

// ── Conformance Tests (both implementations) ──

workflowEventsConformanceTests('FakeWorkflowEventsService', () => new FakeWorkflowEventsService());

workflowEventsConformanceTests('WorkflowEventsService (Real)', () => {
  const fakePGS = new FakePositionalGraphService();
  const observers = new WorkflowEventObserverRegistry();
  observers.clear();
  return new WorkflowEventsService(
    fakePGS,
    () => ({
      workspaceSlug: 'test',
      workspaceName: 'test',
      workspacePath: '/tmp/test',
      worktreePath: '/tmp/test',
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: false,
    }),
    observers
  );
});

// ── Behavioral Tests (fake only — see DYK-P2-01) ──

workflowEventsBehavioralTests('FakeWorkflowEventsService', () => new FakeWorkflowEventsService());
