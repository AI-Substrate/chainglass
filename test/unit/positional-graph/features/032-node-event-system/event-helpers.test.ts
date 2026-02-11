/*
Test Doc:
- Why: Verify predicate helpers correctly classify node statuses for the two-phase handshake
- Contract: isNodeActive() returns true for in-flight statuses; canNodeDoWork() returns true only for agent-accepted
- Usage Notes: Predicates replace raw status === 'running' checks throughout the service layer
- Quality Contribution: Catches regressions if new statuses are added without updating predicates
- Worked Example: isNodeActive('starting') → true; canNodeDoWork('starting') → false; canNodeDoWork('agent-accepted') → true
*/

import { describe, expect, it } from 'vitest';

import {
  canNodeDoWork,
  isNodeActive,
} from '../../../../../packages/positional-graph/src/features/032-node-event-system/event-helpers.js';

describe('isNodeActive', () => {
  it('returns true for starting', () => {
    /*
    Test Doc:
    - Why: starting means orchestrator reserved the node — it is in-flight
    - Contract: isNodeActive('starting') === true
    - Usage Notes: Used by getLineStatus() to count in-progress nodes
    - Quality Contribution: Catches if starting is incorrectly classified as inactive
    - Worked Example: isNodeActive('starting') → true
    */
    expect(isNodeActive('starting')).toBe(true);
  });

  it('returns true for agent-accepted', () => {
    /*
    Test Doc:
    - Why: agent-accepted means agent is actively working — it is in-flight
    - Contract: isNodeActive('agent-accepted') === true
    - Usage Notes: Most running-node checks should use this predicate
    - Quality Contribution: Catches if agent-accepted is incorrectly classified as inactive
    - Worked Example: isNodeActive('agent-accepted') → true
    */
    expect(isNodeActive('agent-accepted')).toBe(true);
  });

  it('returns false for waiting-question', () => {
    /*
    Test Doc:
    - Why: waiting-question means execution is paused — node is not actively in-flight
    - Contract: isNodeActive('waiting-question') === false
    - Usage Notes: Waiting nodes are not counted as running in graph status
    - Quality Contribution: Catches if waiting-question is incorrectly classified as active
    - Worked Example: isNodeActive('waiting-question') → false
    */
    expect(isNodeActive('waiting-question')).toBe(false);
  });

  it('returns false for blocked-error', () => {
    /*
    Test Doc:
    - Why: blocked-error means execution halted on error — not in-flight
    - Contract: isNodeActive('blocked-error') === false
    - Usage Notes: Error nodes need intervention, not counted as running
    - Quality Contribution: Catches if blocked-error is incorrectly classified as active
    - Worked Example: isNodeActive('blocked-error') → false
    */
    expect(isNodeActive('blocked-error')).toBe(false);
  });

  it('returns false for complete', () => {
    /*
    Test Doc:
    - Why: complete means node finished — not in-flight
    - Contract: isNodeActive('complete') === false
    - Usage Notes: Complete nodes are terminal
    - Quality Contribution: Catches if complete is incorrectly classified as active
    - Worked Example: isNodeActive('complete') → false
    */
    expect(isNodeActive('complete')).toBe(false);
  });
});

describe('canNodeDoWork', () => {
  it('returns true for agent-accepted', () => {
    /*
    Test Doc:
    - Why: Only agent-accepted nodes can save output, ask questions, or complete
    - Contract: canNodeDoWork('agent-accepted') === true
    - Usage Notes: Guards on saveOutputData, endNode, askQuestion use this predicate
    - Quality Contribution: Catches if the work guard incorrectly blocks agent-accepted nodes
    - Worked Example: canNodeDoWork('agent-accepted') → true
    */
    expect(canNodeDoWork('agent-accepted')).toBe(true);
  });

  it('returns false for starting', () => {
    /*
    Test Doc:
    - Why: starting means orchestrator reserved but agent hasn't accepted — must accept first
    - Contract: canNodeDoWork('starting') === false
    - Usage Notes: Critical: prevents premature work before agent acceptance
    - Quality Contribution: Catches if starting incorrectly allows work
    - Worked Example: canNodeDoWork('starting') → false
    */
    expect(canNodeDoWork('starting')).toBe(false);
  });

  it('returns false for waiting-question', () => {
    /*
    Test Doc:
    - Why: waiting-question means agent is stopped waiting for answer (DYK #4)
    - Contract: canNodeDoWork('waiting-question') === false
    - Usage Notes: Agent must re-accept after question is answered
    - Quality Contribution: Catches if waiting-question incorrectly allows work
    - Worked Example: canNodeDoWork('waiting-question') → false
    */
    expect(canNodeDoWork('waiting-question')).toBe(false);
  });

  it('returns false for blocked-error', () => {
    /*
    Test Doc:
    - Why: blocked-error means execution halted — no work possible
    - Contract: canNodeDoWork('blocked-error') === false
    - Usage Notes: Error nodes need intervention before resuming
    - Quality Contribution: Catches if blocked-error incorrectly allows work
    - Worked Example: canNodeDoWork('blocked-error') → false
    */
    expect(canNodeDoWork('blocked-error')).toBe(false);
  });

  it('returns false for complete', () => {
    /*
    Test Doc:
    - Why: complete means node finished — no more work
    - Contract: canNodeDoWork('complete') === false
    - Usage Notes: Complete is terminal
    - Quality Contribution: Catches if complete incorrectly allows work
    - Worked Example: canNodeDoWork('complete') → false
    */
    expect(canNodeDoWork('complete')).toBe(false);
  });
});
