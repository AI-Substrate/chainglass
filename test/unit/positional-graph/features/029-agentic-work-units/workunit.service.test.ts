/**
 * WorkUnitService Tests
 *
 * TDD RED Phase: Tests for WorkUnitService operations and rich domain classes.
 * Per DYK #5: list() uses skip-and-warn for partial failures.
 * Per DYK #6: Rich domain objects with type-specific methods (AgenticWorkUnit.getPrompt(), etc.)
 *
 * @packageDocumentation
 */

import { FakeFileSystem, FakePathResolver, FakeYamlParser } from '@chainglass/shared/fakes';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkUnitAdapter } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.js';
import type {
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  UserInputUnitInstance,
} from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.js';
// Import the service and classes (will fail initially - TDD RED)
import { WorkUnitService } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.service.js';

// Error codes for assertions
import { WORKUNIT_ERROR_CODES } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.js';

describe('WorkUnitService', () => {
  let service: WorkUnitService;
  let adapter: WorkUnitAdapter;
  let fakeFs: FakeFileSystem;
  let fakePathResolver: FakePathResolver;
  let fakeYamlParser: FakeYamlParser;
  let ctx: WorkspaceContext;

  // Sample valid unit YAML content
  const validAgentUnit = {
    slug: 'test-agent',
    type: 'agent',
    version: '1.0.0',
    inputs: [{ name: 'input1', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
    agent: { prompt_template: 'prompts/main.md' },
  };

  const validCodeUnit = {
    slug: 'test-code',
    type: 'code',
    version: '1.0.0',
    inputs: [],
    outputs: [{ name: 'result', type: 'data', data_type: 'boolean', required: true }],
    code: { script: 'scripts/main.sh', timeout: 60 },
  };

  const validUserInputUnit = {
    slug: 'test-user-input',
    type: 'user-input',
    version: '1.0.0',
    inputs: [],
    outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
    user_input: {
      question_type: 'text',
      prompt: 'Enter your answer:',
    },
  };

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    fakePathResolver = new FakePathResolver();
    fakeYamlParser = new FakeYamlParser();

    adapter = new WorkUnitAdapter(fakeFs, fakePathResolver);
    service = new WorkUnitService(adapter, fakeFs, fakeYamlParser);

    ctx = {
      workspaceSlug: 'test-workspace',
      workspaceName: 'Test Workspace',
      workspacePath: '/home/user/project',
      worktreePath: '/home/user/project',
      worktreeSlug: 'main',
      worktreeName: 'main',
      isMainWorktree: true,
    };
  });

  // =====================================================
  // T003: list() Tests
  // =====================================================
  describe('list()', () => {
    /**
     * Test Doc:
     * - Why: Service needs to enumerate all units with their types
     * - Contract: list() returns array of unit summaries with slug and type
     * - Usage Notes: Returns quick metadata without loading full unit
     * - Quality Contribution: Verifies unit discovery
     * - Worked Example: 3 units → [{ slug, type, version }, ...]
     */
    it('should return list of unit summaries with types', async () => {
      // Setup: Create unit directories with unit.yaml files
      const agentYaml = JSON.stringify(validAgentUnit);
      const codeYaml = JSON.stringify(validCodeUnit);

      fakeYamlParser.setPresetParseResult(agentYaml, validAgentUnit);
      fakeYamlParser.setPresetParseResult(codeYaml, validCodeUnit);

      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', agentYaml);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', codeYaml);

      const result = await service.list(ctx);

      expect(result.errors).toHaveLength(0);
      expect(result.units).toHaveLength(2);
      expect(result.units).toContainEqual({
        slug: 'test-agent',
        type: 'agent',
        version: '1.0.0',
      });
      expect(result.units).toContainEqual({
        slug: 'test-code',
        type: 'code',
        version: '1.0.0',
      });
    });

    /**
     * Test Doc:
     * - Why: Empty workspace should not throw
     * - Contract: list() returns empty array when no units exist
     * - Usage Notes: Valid result, just empty
     * - Quality Contribution: Handles edge case
     * - Worked Example: no units → { units: [], errors: [] }
     */
    it('should return empty array when no units exist', async () => {
      fakeFs.setDir('/home/user/project/.chainglass/units');

      const result = await service.list(ctx);

      expect(result.errors).toHaveLength(0);
      expect(result.units).toEqual([]);
    });

    /**
     * Test Doc:
     * - Why: Missing units directory should not throw
     * - Contract: list() returns empty array when units directory doesn't exist
     * - Usage Notes: Graceful for uninitialized workspaces
     * - Quality Contribution: Handles fresh workspaces
     * - Worked Example: no .chainglass/units/ → { units: [], errors: [] }
     */
    it('should return empty array when units directory does not exist', async () => {
      // No setup - directory doesn't exist

      const result = await service.list(ctx);

      expect(result.errors).toHaveLength(0);
      expect(result.units).toEqual([]);
    });

    /**
     * Test Doc:
     * - Why: Per DYK #5: one bad unit shouldn't fail entire list
     * - Contract: list() skips invalid units and reports errors
     * - Usage Notes: Returns valid units + errors array for malformed ones
     * - Quality Contribution: Partial failure resilience
     * - Worked Example: 2 valid + 1 malformed → { units: [2], errors: [E182] }
     */
    it('should skip invalid units and report errors (partial failure)', async () => {
      // Setup: 2 valid units + 1 malformed
      const agentYaml = JSON.stringify(validAgentUnit);
      const codeYaml = JSON.stringify(validCodeUnit);
      const malformedYaml = JSON.stringify({ slug: 'bad-unit' }); // Missing required fields

      fakeYamlParser.setPresetParseResult(agentYaml, validAgentUnit);
      fakeYamlParser.setPresetParseResult(codeYaml, validCodeUnit);
      fakeYamlParser.setPresetParseResult(malformedYaml, { slug: 'bad-unit' }); // Invalid schema

      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', agentYaml);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', codeYaml);
      fakeFs.setFile('/home/user/project/.chainglass/units/bad-unit/unit.yaml', malformedYaml);

      const result = await service.list(ctx);

      // Should have 2 valid units
      expect(result.units).toHaveLength(2);
      // Should have 1 error for the malformed unit
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E182);
    });

    /**
     * Test Doc:
     * - Why: YAML parse errors should not crash list
     * - Contract: list() reports E181 for YAML parse failures
     * - Usage Notes: Bad YAML syntax → E181 in errors array
     * - Quality Contribution: Robust error handling
     * - Worked Example: invalid YAML → E181 in errors
     */
    it('should report E181 for YAML parse errors', async () => {
      // Setup: Valid unit + one with invalid YAML
      const agentYaml = JSON.stringify(validAgentUnit);
      fakeYamlParser.setPresetParseResult(agentYaml, validAgentUnit);

      const badYaml = 'invalid: yaml: content: [';
      fakeYamlParser.setPresetParseError(badYaml, {
        name: 'YamlParseError',
        message: 'YAML syntax error',
      });

      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', agentYaml);
      fakeFs.setFile('/home/user/project/.chainglass/units/bad-yaml/unit.yaml', badYaml);

      const result = await service.list(ctx);

      expect(result.units).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E181);
    });
  });

  // =====================================================
  // T004: load() Tests
  // =====================================================
  describe('load()', () => {
    /**
     * Test Doc:
     * - Why: Agents need rich domain objects, not plain data
     * - Contract: load() returns AgenticWorkUnitInstance for type='agent'
     * - Usage Notes: Instance has getPrompt() and setPrompt() methods
     * - Quality Contribution: Verifies type discrimination
     * - Worked Example: type='agent' → AgenticWorkUnitInstance with getPrompt()
     */
    it('should return AgenticWorkUnitInstance for agent type', async () => {
      const yamlContent = JSON.stringify(validAgentUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validAgentUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-agent');

      expect(result.errors).toHaveLength(0);
      expect(result.unit).toBeDefined();
      expect(result.unit?.type).toBe('agent');
      expect(result.unit?.slug).toBe('test-agent');
      // Per DYK #6: Instance should have getPrompt method
      expect(typeof (result.unit as AgenticWorkUnitInstance).getPrompt).toBe('function');
    });

    /**
     * Test Doc:
     * - Why: Code units need getScript/setScript methods
     * - Contract: load() returns CodeUnitInstance for type='code'
     * - Usage Notes: Instance has getScript() and setScript() methods
     * - Quality Contribution: Verifies type discrimination
     * - Worked Example: type='code' → CodeUnitInstance with getScript()
     */
    it('should return CodeUnitInstance for code type', async () => {
      const yamlContent = JSON.stringify(validCodeUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validCodeUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-code');

      expect(result.errors).toHaveLength(0);
      expect(result.unit).toBeDefined();
      expect(result.unit?.type).toBe('code');
      // Per DYK #6: Instance should have getScript method
      expect(typeof (result.unit as CodeUnitInstance).getScript).toBe('function');
    });

    /**
     * Test Doc:
     * - Why: User input units have no template methods
     * - Contract: load() returns UserInputUnitInstance for type='user-input'
     * - Usage Notes: Instance does NOT have getPrompt/getScript
     * - Quality Contribution: Verifies no-template behavior
     * - Worked Example: type='user-input' → UserInputUnitInstance (no template methods)
     */
    it('should return UserInputUnitInstance for user-input type', async () => {
      const yamlContent = JSON.stringify(validUserInputUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validUserInputUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-user-input/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-user-input');

      expect(result.errors).toHaveLength(0);
      expect(result.unit).toBeDefined();
      expect(result.unit?.type).toBe('user-input');
      // Per DYK #6: UserInputUnit should NOT have template methods
      const unit = result.unit as UserInputUnitInstance;
      expect('getPrompt' in unit).toBe(false);
      expect('getScript' in unit).toBe(false);
    });

    /**
     * Test Doc:
     * - Why: Missing unit should return clear error
     * - Contract: load() returns E180 for nonexistent unit
     * - Usage Notes: Error includes slug for debugging
     * - Quality Contribution: Clear error messaging
     * - Worked Example: slug='nonexistent' → E180 UnitNotFound
     */
    it('should return E180 for nonexistent unit', async () => {
      const result = await service.load(ctx, 'nonexistent');

      expect(result.unit).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E180);
      expect(result.errors[0].message).toContain('nonexistent');
    });

    /**
     * Test Doc:
     * - Why: YAML parse errors should be reported clearly
     * - Contract: load() returns E181 for YAML syntax errors
     * - Usage Notes: Error includes parse details
     * - Quality Contribution: Debugging YAML issues
     * - Worked Example: invalid YAML → E181 YamlParseError
     */
    it('should return E181 for YAML parse error', async () => {
      const badYaml = 'invalid: yaml: [';
      fakeYamlParser.setPresetParseError(badYaml, {
        name: 'YamlParseError',
        message: 'Unexpected token at line 1',
      });
      fakeFs.setFile('/home/user/project/.chainglass/units/bad-unit/unit.yaml', badYaml);

      const result = await service.load(ctx, 'bad-unit');

      expect(result.unit).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E181);
    });

    /**
     * Test Doc:
     * - Why: Schema validation errors should be actionable
     * - Contract: load() returns E182 for schema validation failures
     * - Usage Notes: Error includes Zod-formatted issues
     * - Quality Contribution: Helps fix unit.yaml
     * - Worked Example: missing 'type' field → E182 SchemaValidationError
     */
    it('should return E182 for schema validation error', async () => {
      const invalidUnit = { slug: 'incomplete-unit', version: '1.0.0' }; // Missing type, outputs
      const yamlContent = JSON.stringify(invalidUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, invalidUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/incomplete-unit/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'incomplete-unit');

      expect(result.unit).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E182);
    });

    /**
     * Test Doc:
     * - Why: Invalid slug should throw early
     * - Contract: load() throws error for invalid slug format
     * - Usage Notes: Validates slug before filesystem access
     * - Quality Contribution: Security check
     * - Worked Example: slug='../escape' → throws
     */
    it('should throw for invalid slug format', async () => {
      await expect(service.load(ctx, '../escape')).rejects.toThrow(/Invalid unit slug/);
    });
  });

  // =====================================================
  // T005: validate() Tests
  // =====================================================
  describe('validate()', () => {
    /**
     * Test Doc:
     * - Why: Quick validation without full load
     * - Contract: validate() returns valid=true for valid unit
     * - Usage Notes: Lighter weight than load()
     * - Quality Contribution: Quick validation
     * - Worked Example: valid unit.yaml → { valid: true, errors: [] }
     */
    it('should return valid=true for valid unit', async () => {
      const yamlContent = JSON.stringify(validAgentUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validAgentUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);

      const result = await service.validate(ctx, 'test-agent');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    /**
     * Test Doc:
     * - Why: Validation should catch schema errors
     * - Contract: validate() returns valid=false with E182 for invalid schema
     * - Usage Notes: Same validation as load()
     * - Quality Contribution: Pre-flight check
     * - Worked Example: invalid unit.yaml → { valid: false, errors: [E182] }
     */
    it('should return valid=false for invalid unit', async () => {
      const invalidUnit = { slug: 'bad', version: '1.0.0' };
      const yamlContent = JSON.stringify(invalidUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, invalidUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/bad/unit.yaml', yamlContent);

      const result = await service.validate(ctx, 'bad');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E182);
    });

    /**
     * Test Doc:
     * - Why: Missing unit should be invalid
     * - Contract: validate() returns valid=false with E180 for missing unit
     * - Usage Notes: Same error as load()
     * - Quality Contribution: Consistent error handling
     * - Worked Example: nonexistent unit → { valid: false, errors: [E180] }
     */
    it('should return valid=false for nonexistent unit', async () => {
      const result = await service.validate(ctx, 'nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E180);
    });
  });

  // =====================================================
  // T006: Unit Class Template Methods Tests
  // =====================================================
  describe('AgenticWorkUnit.getPrompt()', () => {
    /**
     * Test Doc:
     * - Why: Agents need to retrieve their prompt templates
     * - Contract: getPrompt() returns prompt file content
     * - Usage Notes: Uses prompt_template path from config
     * - Quality Contribution: Core agent functionality
     * - Worked Example: prompt_template='prompts/main.md' → returns file content
     */
    it('should return prompt template content', async () => {
      const yamlContent = JSON.stringify(validAgentUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validAgentUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);
      fakeFs.setFile(
        '/home/user/project/.chainglass/units/test-agent/prompts/main.md',
        'You are a helpful assistant.'
      );

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      const prompt = await unit.getPrompt(ctx);

      expect(prompt).toBe('You are a helpful assistant.');
    });

    /**
     * Test Doc:
     * - Why: Missing template should throw E185
     * - Contract: getPrompt() throws E185 if template file missing
     * - Usage Notes: Error includes template path
     * - Quality Contribution: Clear missing file error
     * - Worked Example: template file doesn't exist → throws E185
     */
    it('should throw E185 for missing template file', async () => {
      const yamlContent = JSON.stringify(validAgentUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validAgentUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);
      // No prompt file created

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await expect(unit.getPrompt(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E185);
    });

    /**
     * Test Doc:
     * - Why: Path escape must be blocked for security
     * - Contract: getPrompt() throws E184 for path traversal attempts
     * - Usage Notes: Per DYK #3: use startsWith(unitDir + sep)
     * - Quality Contribution: Security protection
     * - Worked Example: prompt_template='../../../.env' → throws E184
     */
    it('should throw E184 for path escape attempt in prompt_template', async () => {
      const maliciousUnit = {
        ...validAgentUnit,
        agent: { prompt_template: '../../../.env' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);
      // The .env file exists but should be blocked
      fakeFs.setFile('/home/user/project/.env', 'SECRET=password123');

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await expect(unit.getPrompt(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E184);
    });
  });

  describe('AgenticWorkUnit.setPrompt()', () => {
    /**
     * Test Doc:
     * - Why: Agents may need to update their prompts
     * - Contract: setPrompt() writes content to prompt file
     * - Usage Notes: Creates file if it doesn't exist
     * - Quality Contribution: Write capability
     * - Worked Example: setPrompt(ctx, 'New prompt') → writes to prompts/main.md
     */
    it('should write prompt template content', async () => {
      const yamlContent = JSON.stringify(validAgentUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validAgentUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);
      // Create parent directory
      fakeFs.setDir('/home/user/project/.chainglass/units/test-agent/prompts');

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await unit.setPrompt(ctx, 'Updated prompt content.');

      const written = fakeFs.getFile(
        '/home/user/project/.chainglass/units/test-agent/prompts/main.md'
      );
      expect(written).toBe('Updated prompt content.');
    });
  });

  describe('CodeUnit.getScript()', () => {
    /**
     * Test Doc:
     * - Why: Code units need to retrieve their scripts
     * - Contract: getScript() returns script file content
     * - Usage Notes: Uses script path from config
     * - Quality Contribution: Core code unit functionality
     * - Worked Example: script='scripts/main.sh' → returns file content
     */
    it('should return script content', async () => {
      const yamlContent = JSON.stringify(validCodeUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validCodeUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);
      fakeFs.setFile(
        '/home/user/project/.chainglass/units/test-code/scripts/main.sh',
        '#!/bin/bash\necho "Hello"'
      );

      const result = await service.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      const script = await unit.getScript(ctx);

      expect(script).toBe('#!/bin/bash\necho "Hello"');
    });

    /**
     * Test Doc:
     * - Why: Missing script should throw E185
     * - Contract: getScript() throws E185 if script file missing
     * - Usage Notes: Error includes script path
     * - Quality Contribution: Clear missing file error
     * - Worked Example: script file doesn't exist → throws E185
     */
    it('should throw E185 for missing script file', async () => {
      const yamlContent = JSON.stringify(validCodeUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validCodeUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);
      // No script file created

      const result = await service.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      await expect(unit.getScript(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E185);
    });

    /**
     * Test Doc:
     * - Why: Path escape must be blocked for security
     * - Contract: getScript() throws E184 for path traversal attempts
     * - Usage Notes: Same security as prompts
     * - Quality Contribution: Security protection
     * - Worked Example: script='../../../etc/passwd' → throws E184
     */
    it('should throw E184 for path escape attempt in script', async () => {
      const maliciousUnit = {
        ...validCodeUnit,
        code: { script: '../../../etc/passwd' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      await expect(unit.getScript(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E184);
    });
  });

  describe('CodeUnit.setScript()', () => {
    /**
     * Test Doc:
     * - Why: Code units may need to update their scripts
     * - Contract: setScript() writes content to script file
     * - Usage Notes: Creates file if it doesn't exist
     * - Quality Contribution: Write capability
     * - Worked Example: setScript(ctx, 'new script') → writes to scripts/main.sh
     */
    it('should write script content', async () => {
      const yamlContent = JSON.stringify(validCodeUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validCodeUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);
      fakeFs.setDir('/home/user/project/.chainglass/units/test-code/scripts');

      const result = await service.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      await unit.setScript(ctx, '#!/bin/bash\necho "Updated"');

      const written = fakeFs.getFile(
        '/home/user/project/.chainglass/units/test-code/scripts/main.sh'
      );
      expect(written).toBe('#!/bin/bash\necho "Updated"');
    });
  });

  describe('UserInputUnit (no template methods)', () => {
    /**
     * Test Doc:
     * - Why: Per DYK #6: UserInputUnit has no templates
     * - Contract: UserInputUnit instances don't have getPrompt/getScript
     * - Usage Notes: Compile-time safety prevents calling these
     * - Quality Contribution: Type safety
     * - Worked Example: UserInputUnitInstance has no getPrompt method
     */
    it('should not have getPrompt or getScript methods', async () => {
      const yamlContent = JSON.stringify(validUserInputUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, validUserInputUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-user-input/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-user-input');
      const unit = result.unit as UserInputUnitInstance;

      // TypeScript should prevent this at compile time, but verify at runtime
      expect('getPrompt' in unit).toBe(false);
      expect('getScript' in unit).toBe(false);
      expect('setPrompt' in unit).toBe(false);
      expect('setScript' in unit).toBe(false);
    });
  });

  // =====================================================
  // T008: Security Tests for Path Escape Prevention
  // =====================================================
  describe('Path Escape Security (T008)', () => {
    /**
     * Test Doc:
     * - Why: Absolute paths could access any file on filesystem
     * - Contract: getPrompt() throws E184 for absolute paths
     * - Usage Notes: Security protection
     * - Quality Contribution: Security
     * - Worked Example: prompt_template='/etc/passwd' → throws E184
     */
    it('should throw E184 for absolute path in prompt_template', async () => {
      const maliciousUnit = {
        ...validAgentUnit,
        agent: { prompt_template: '/etc/passwd' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await expect(unit.getPrompt(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E184);
    });

    /**
     * Test Doc:
     * - Why: Absolute paths in scripts could access any file
     * - Contract: getScript() throws E184 for absolute paths
     * - Usage Notes: Security protection
     * - Quality Contribution: Security
     * - Worked Example: script='/etc/passwd' → throws E184
     */
    it('should throw E184 for absolute path in script', async () => {
      const maliciousUnit = {
        ...validCodeUnit,
        code: { script: '/etc/passwd' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      await expect(unit.getScript(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E184);
    });

    /**
     * Test Doc:
     * - Why: Per DYK #3: prefix attacks like 'my-agent-evil/../secrets' could escape
     * - Contract: getPrompt() throws E184 for slug-prefix escape attempts
     * - Usage Notes: Using startsWith(unitDir + sep) prevents this
     * - Quality Contribution: Security
     * - Worked Example: unitDir='my-agent' should not match 'my-agent-evil/../'
     *
     * Note: This test verifies the fix for DYK #3: the vulnerable approach
     * `fullPath.startsWith(unitDir)` would incorrectly allow paths that
     * have the unitDir as a prefix (e.g., 'my-agent-evil'). The correct
     * approach is `fullPath.startsWith(unitDir + sep)` which requires
     * the path separator after the unit directory.
     */
    it('should throw E184 for slug-prefix attack (DYK #3)', async () => {
      // Setup: unit 'my-agent' exists
      const unit1 = { ...validAgentUnit, slug: 'my-agent' };
      const yaml1 = JSON.stringify(unit1);
      fakeYamlParser.setPresetParseResult(yaml1, unit1);
      fakeFs.setFile('/home/user/project/.chainglass/units/my-agent/unit.yaml', yaml1);

      // Attack: prompt_template tries to use sibling folder 'my-agent-evil'
      // to escape via '../my-agent-evil/../secrets'
      const maliciousUnit = {
        ...validAgentUnit,
        slug: 'my-agent',
        agent: { prompt_template: '../my-agent-evil/../../.env' },
      };
      const maliciousYaml = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(maliciousYaml, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/my-agent/unit.yaml', maliciousYaml);

      const result = await service.load(ctx, 'my-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await expect(unit.getPrompt(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E184);
    });

    /**
     * Test Doc:
     * - Why: Multiple ../ sequences could still escape even if relative
     * - Contract: getPrompt() throws E184 for nested ../ escape attempts
     * - Usage Notes: Security protection
     * - Quality Contribution: Security
     * - Worked Example: prompt_template='../../other-unit/prompts/secret.md' → throws E184
     */
    it('should throw E184 for nested ../ escape attempts', async () => {
      const maliciousUnit = {
        ...validAgentUnit,
        agent: { prompt_template: '../../other-unit/prompts/secret.md' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);
      // Put the "secret" file there
      fakeFs.setFile('/home/user/project/.chainglass/units/other-unit/prompts/secret.md', 'SECRET');

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await expect(unit.getPrompt(ctx)).rejects.toThrow(WORKUNIT_ERROR_CODES.E184);
    });

    /**
     * Test Doc:
     * - Why: Valid nested paths within unit folder should work
     * - Contract: getPrompt() succeeds for deeply nested valid paths
     * - Usage Notes: Security check should not block valid usage
     * - Quality Contribution: No false positives
     * - Worked Example: prompt_template='prompts/nested/deep/main.md' → succeeds
     */
    it('should allow valid nested paths within unit folder', async () => {
      const nestedUnit = {
        ...validAgentUnit,
        agent: { prompt_template: 'prompts/nested/deep/main.md' },
      };
      const yamlContent = JSON.stringify(nestedUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, nestedUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);
      fakeFs.setFile(
        '/home/user/project/.chainglass/units/test-agent/prompts/nested/deep/main.md',
        'Valid nested prompt'
      );

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      const prompt = await unit.getPrompt(ctx);
      expect(prompt).toBe('Valid nested prompt');
    });

    /**
     * Test Doc:
     * - Why: setPrompt with path escape should also be blocked
     * - Contract: setPrompt() throws E184 for path traversal attempts
     * - Usage Notes: Write operations need same security
     * - Quality Contribution: Security
     * - Worked Example: setPrompt with ../../../etc/passwd → throws E184
     */
    it('should throw E184 for path escape in setPrompt()', async () => {
      const maliciousUnit = {
        ...validAgentUnit,
        agent: { prompt_template: '../../../etc/passwd' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-agent/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await expect(unit.setPrompt(ctx, 'malicious content')).rejects.toThrow(
        WORKUNIT_ERROR_CODES.E184
      );
    });

    /**
     * Test Doc:
     * - Why: setScript with path escape should also be blocked
     * - Contract: setScript() throws E184 for path traversal attempts
     * - Usage Notes: Write operations need same security
     * - Quality Contribution: Security
     * - Worked Example: setScript with ../../../etc/passwd → throws E184
     */
    it('should throw E184 for path escape in setScript()', async () => {
      const maliciousUnit = {
        ...validCodeUnit,
        code: { script: '../../../etc/passwd' },
      };
      const yamlContent = JSON.stringify(maliciousUnit);
      fakeYamlParser.setPresetParseResult(yamlContent, maliciousUnit);
      fakeFs.setFile('/home/user/project/.chainglass/units/test-code/unit.yaml', yamlContent);

      const result = await service.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      await expect(unit.setScript(ctx, 'malicious content')).rejects.toThrow(
        WORKUNIT_ERROR_CODES.E184
      );
    });
  });
});
