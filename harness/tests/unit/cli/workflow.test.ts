/**
 * @test-doc
 * @id T076-P3-workflow-commands
 * @title Workflow command unit tests
 * @phase Phase 3: Harness Workflow Commands
 * @verifies FT-001 (exit reason), FT-002 (container options), FT-003 (logs stderr), FT-004 (durable tests)
 */

import { describe, expect, it } from 'vitest';
import { createCli } from '../../../src/cli/index.js';

describe('workflow command group', () => {
  it('registers workflow as a top-level command', () => {
    /*
    Test Doc:
    - Why: Agents discover commands via `harness --help`; workflow must be listed.
    - Contract: createCli().commands includes a command named 'workflow'.
    - Usage Notes: Direct import of createCli, no process spawn.
    - Quality Contribution: Catches registration regressions.
    - Worked Example: createCli().commands.map(c => c.name()) includes 'workflow'.
    */
    const program = createCli();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('workflow');
  });

  it('exposes run, status, logs, and reset subcommands', () => {
    /*
    Test Doc:
    - Why: The four subcommands form the workflow lifecycle surface.
    - Contract: The workflow command has subcommands: run, status, logs, reset.
    - Usage Notes: Uses Commander's .commands array for introspection.
    - Quality Contribution: Prevents accidental removal of subcommands.
    - Worked Example: workflowCmd.commands.map(c => c.name()) → ['reset', 'run', 'status', 'logs'].
    */
    const program = createCli();
    const workflowCmd = program.commands.find((c) => c.name() === 'workflow');
    expect(workflowCmd).toBeDefined();

    const subNames = workflowCmd!.commands.map((c) => c.name());
    expect(subNames).toContain('run');
    expect(subNames).toContain('status');
    expect(subNames).toContain('logs');
    expect(subNames).toContain('reset');
  });

  it('run subcommand accepts --timeout, --target, --verbose, and --no-auto-complete options', () => {
    /*
    Test Doc:
    - Why: Agents pass these flags programmatically; they must be declared.
    - Contract: The run subcommand accepts timeout, target, verbose, auto-complete options.
    - Usage Notes: Commander stores options; we check their existence.
    - Quality Contribution: Prevents option removal that breaks agent scripts.
    - Worked Example: runCmd.options.some(o => o.long === '--timeout') → true.
    */
    const program = createCli();
    const workflowCmd = program.commands.find((c) => c.name() === 'workflow');
    const runCmd = workflowCmd!.commands.find((c) => c.name() === 'run');
    expect(runCmd).toBeDefined();

    const optionLongs = runCmd!.options.map((o) => o.long);
    expect(optionLongs).toContain('--timeout');
    expect(optionLongs).toContain('--target');
    expect(optionLongs).toContain('--verbose');
    expect(optionLongs).toContain('--no-auto-complete');
  });

  it('logs subcommand accepts --node and --errors options', () => {
    /*
    Test Doc:
    - Why: Event filtering is critical for agents debugging workflow failures.
    - Contract: The logs subcommand accepts --node and --errors options.
    - Usage Notes: Commander options introspection.
    - Quality Contribution: Prevents filter option removal.
    - Worked Example: logsCmd.options.some(o => o.long === '--errors') → true.
    */
    const program = createCli();
    const workflowCmd = program.commands.find((c) => c.name() === 'workflow');
    const logsCmd = workflowCmd!.commands.find((c) => c.name() === 'logs');
    expect(logsCmd).toBeDefined();

    const optionLongs = logsCmd!.options.map((o) => o.long);
    expect(optionLongs).toContain('--node');
    expect(optionLongs).toContain('--errors');
  });
});
