import { getDisplayStatus } from '@/features/050-workflow-page/lib/display-status';
import { describe, expect, it } from 'vitest';

describe('getDisplayStatus', () => {
  it('returns awaiting-input for user-input + pending + ready', () => {
    /*
    Test Doc:
    - Why: Core AC-01 — user-input nodes that are ready must show awaiting-input display status.
    - Contract: getDisplayStatus('user-input', 'pending', true) → 'awaiting-input'.
    - Usage Notes: This is a UI-only computed status; never appears in state.json.
    - Quality Contribution: Prevents regression if display status logic changes.
    - Worked Example: A user-input node on line 0 with all gates passing shows violet badge.
    */
    expect(getDisplayStatus('user-input', 'pending', true)).toBe('awaiting-input');
  });

  it('returns pending for user-input + pending + NOT ready', () => {
    /*
    Test Doc:
    - Why: AC-02 — user-input nodes that aren't ready should show standard pending treatment.
    - Contract: getDisplayStatus('user-input', 'pending', false) → 'pending'.
    - Usage Notes: Gates blocking (e.g., preceding line incomplete) suppress the input badge.
    - Quality Contribution: Ensures badge only appears when the node is actionable.
    - Worked Example: A user-input node on line 1 while line 0 is incomplete stays gray.
    */
    expect(getDisplayStatus('user-input', 'pending', false)).toBe('pending');
  });

  it('returns original status for agent + pending + ready', () => {
    /*
    Test Doc:
    - Why: Only user-input nodes get awaiting-input; other types pass through unchanged.
    - Contract: getDisplayStatus('agent', 'pending', true) → 'pending'.
    - Usage Notes: Agent nodes have their own status flow (ready → starting → agent-accepted).
    - Quality Contribution: Guards against type-agnostic awaiting-input leaking to agents.
    - Worked Example: An agent node that is ready shows blue "Ready" badge, not violet.
    */
    expect(getDisplayStatus('agent', 'pending', true)).toBe('pending');
  });

  it('returns original status for code + pending + ready', () => {
    /*
    Test Doc:
    - Why: Code units must also be excluded from awaiting-input display status.
    - Contract: getDisplayStatus('code', 'pending', true) → 'pending'.
    - Usage Notes: Same pass-through logic as agent — only user-input triggers the override.
    - Quality Contribution: Completes the exhaustive unitType coverage.
    - Worked Example: A code node that is ready shows standard "Pending" badge.
    */
    expect(getDisplayStatus('code', 'pending', true)).toBe('pending');
  });

  it('returns complete for user-input + complete + ready', () => {
    /*
    Test Doc:
    - Why: Completed user-input nodes must not show awaiting-input — only pending triggers it.
    - Contract: getDisplayStatus('user-input', 'complete', true) → 'complete'.
    - Usage Notes: After submission, node transitions to complete via lifecycle.
    - Quality Contribution: Prevents stale awaiting-input badge after submission.
    - Worked Example: After user submits input, badge changes from violet ? to green ✓.
    */
    expect(getDisplayStatus('user-input', 'complete', true)).toBe('complete');
  });

  it('returns original status when not pending', () => {
    /*
    Test Doc:
    - Why: Non-pending statuses must pass through regardless of unitType.
    - Contract: getDisplayStatus('user-input', 'agent-accepted', true) → 'agent-accepted'.
    - Usage Notes: Edge case — user-input nodes shouldn't normally be agent-accepted, but the function is defensive.
    - Quality Contribution: Validates that only the pending+ready+user-input triple triggers the override.
    - Worked Example: A hypothetical running user-input node shows "Running", not "Awaiting Input".
    */
    expect(getDisplayStatus('user-input', 'agent-accepted', true)).toBe('agent-accepted');
  });
});
