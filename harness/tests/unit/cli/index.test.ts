/**
 * @test-doc
 * @id T001-cli-commands
 * @title CLI command registration and parsing tests
 * @phase Phase 3: Harness CLI SDK
 * @verifies AC-11 (consistent command surface)
 */

import { describe, expect, it } from 'vitest';

// These imports will fail until T003 implements them — RED
import { createCli } from '../../../src/cli/index.js';

describe('CLI command registration', () => {
  it('creates a CLI program with the correct name', () => {
    /*
    Test Doc:
    - Why: The published CLI must expose the expected `harness` command surface.
    - Contract: createCli() returns a Commander program named `harness`.
    - Usage Notes: Import createCli() directly; do not shell out for registration checks.
    - Quality Contribution: Catches accidental command-surface regressions early.
    - Worked Example: createCli().name() → 'harness'.
    */
    const program = createCli();
    expect(program.name()).toBe('harness');
  });

  it('registers all expected commands', () => {
    /*
    Test Doc:
    - Why: Agents rely on a fixed set of commands; missing ones break workflows.
    - Contract: createCli().commands includes build, dev, stop, health, test, screenshot, results, ports.
    - Usage Notes: Adding a new command requires updating this test.
    - Quality Contribution: Prevents command registration regressions.
    - Worked Example: createCli().commands.map(c => c.name()) includes 'health'.
    */
    const program = createCli();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('build');
    expect(commandNames).toContain('dev');
    expect(commandNames).toContain('stop');
    expect(commandNames).toContain('health');
    expect(commandNames).toContain('test');
    expect(commandNames).toContain('screenshot');
    expect(commandNames).toContain('results');
    expect(commandNames).toContain('ports');
    expect(commandNames).toContain('seed');
    expect(commandNames).toContain('doctor');
    expect(commandNames).toContain('workflow');
  });

  it('has a version string', () => {
    /*
    Test Doc:
    - Why: `harness --version` must work for agent introspection.
    - Contract: createCli().version() returns a truthy string.
    - Usage Notes: Version comes from package.json, mirrored in Commander.
    - Quality Contribution: Catches missing version configuration.
    - Worked Example: createCli().version() → '0.1.0'.
    */
    const program = createCli();
    expect(program.version()).toBeTruthy();
  });
});
