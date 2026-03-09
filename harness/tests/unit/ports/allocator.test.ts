import { describe, expect, it } from 'vitest';
import { computeSlot, computePorts } from '../../../src/ports/allocator.js';

describe('Port allocator', () => {
  it('produces deterministic slots for the same worktree name', () => {
    /*
    Test Doc:
    - Why: Ensure the same worktree always gets the same ports across runs.
    - Contract: computeSlot(name) returns identical values for identical inputs.
    - Usage Notes: Pure function, no side effects.
    - Quality Contribution: Prevents port drift between harness restarts.
    - Worked Example: computeSlot('066-wf-real-agents') === computeSlot('066-wf-real-agents')
    */
    const a = computeSlot('066-wf-real-agents');
    const b = computeSlot('066-wf-real-agents');
    expect(a).toBe(b);
  });

  it('produces different slots for different worktree names', () => {
    /*
    Test Doc:
    - Why: Different worktrees must get different port ranges to avoid collisions.
    - Contract: computeSlot(nameA) !== computeSlot(nameB) for distinct names.
    - Usage Notes: Collision is theoretically possible but extremely unlikely for real worktree names.
    - Quality Contribution: Core invariant for parallel harness instances.
    - Worked Example: computeSlot('066-wf-real-agents') !== computeSlot('064-terminal')
    */
    const a = computeSlot('066-wf-real-agents');
    const b = computeSlot('064-terminal');
    expect(a).not.toBe(b);
  });

  it('keeps slots in [0, 100) range', () => {
    /*
    Test Doc:
    - Why: Slots must stay within the allocated port range to avoid conflicts.
    - Contract: computeSlot returns a number in [0, 100).
    - Usage Notes: Tests with multiple realistic worktree names.
    - Quality Contribution: Prevents port overflow into reserved system ranges.
    - Worked Example: computeSlot('any-name') >= 0 && < 100
    */
    const names = ['066-wf-real-agents', '064-terminal', '063-sidebar', 'main', 'feature-auth'];
    for (const name of names) {
      const slot = computeSlot(name);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(100);
    }
  });

  it('computes valid port triples from a worktree name', () => {
    /*
    Test Doc:
    - Why: Verify the full port computation produces ports in the expected ranges.
    - Contract: computePorts returns app in [3100,3199], terminal in [4600,4699], cdp in [9222,9321].
    - Usage Notes: Pass worktree name explicitly to avoid git dependency in tests.
    - Quality Contribution: End-to-end validation of the allocation algorithm.
    - Worked Example: computePorts('066-wf-real-agents') => {app: 31xx, terminal: 46xx, cdp: 92xx}
    */
    const ports = computePorts('066-wf-real-agents');
    expect(ports.app).toBeGreaterThanOrEqual(3100);
    expect(ports.app).toBeLessThan(3200);
    expect(ports.terminal).toBeGreaterThanOrEqual(4600);
    expect(ports.terminal).toBeLessThan(4700);
    expect(ports.cdp).toBeGreaterThanOrEqual(9222);
    expect(ports.cdp).toBeLessThan(9322);
    expect(ports.worktree).toBe('066-wf-real-agents');
  });

  it('respects env var overrides', () => {
    /*
    Test Doc:
    - Why: Users/CI must be able to override computed ports for special cases.
    - Contract: HARNESS_APP_PORT env var takes precedence over computed value.
    - Usage Notes: Uses process.env directly; clean up after test.
    - Quality Contribution: Ensures escape hatch works for port conflicts.
    - Worked Example: HARNESS_APP_PORT=9999 computePorts().app === 9999
    */
    process.env.HARNESS_APP_PORT = '9999';
    const ports = computePorts('test');
    expect(ports.app).toBe(9999);
    delete process.env.HARNESS_APP_PORT;
  });
});
