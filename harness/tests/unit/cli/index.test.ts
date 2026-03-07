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
    const program = createCli();
    expect(program.name()).toBe('harness');
  });

  it('registers all expected commands', () => {
    const program = createCli();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('build');
    expect(commandNames).toContain('dev');
    expect(commandNames).toContain('stop');
    expect(commandNames).toContain('health');
    expect(commandNames).toContain('test');
    expect(commandNames).toContain('screenshot');
    expect(commandNames).toContain('results');
  });

  it('has a version string', () => {
    const program = createCli();
    expect(program.version()).toBeTruthy();
  });
});
