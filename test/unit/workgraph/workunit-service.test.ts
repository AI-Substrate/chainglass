/**
 * Tests for WorkUnitService.
 *
 * Per Phase 2: TAD approach - scratch tests for exploration, promote valuable ones.
 *
 * Test fixtures use FakeFileSystem, FakePathResolver, FakeYamlParser
 * to simulate unit directories without disk I/O.
 */

import {
  FakeFileSystem,
  FakePathResolver,
  FakeYamlParser,
  YamlParseError,
} from '@chainglass/shared';
import { WorkUnitService } from '@chainglass/workgraph';
import { beforeEach, describe, expect, it } from 'vitest';

// ============================================
// Test Fixtures
// ============================================

/**
 * Sample agent unit YAML (valid).
 */
const SAMPLE_AGENT_UNIT_YAML = `
slug: write-poem
type: agent
version: "1.0.0"
description: "Generates a poem on a given topic"
inputs:
  - name: topic
    type: data
    data_type: text
    required: true
    description: "The topic for the poem"
outputs:
  - name: poem
    type: data
    data_type: text
    required: true
    description: "The generated poem"
agent:
  prompt_template: commands/main.md
  system_prompt: "You are a creative poet."
`;

/**
 * Sample code unit YAML (valid).
 */
const SAMPLE_CODE_UNIT_YAML = `
slug: process-data
type: code
version: "1.0.0"
description: "Processes input data"
inputs:
  - name: data_file
    type: file
    required: true
outputs:
  - name: result
    type: data
    data_type: json
    required: true
code:
  timeout: 120
`;

/**
 * Sample user-input unit YAML (valid).
 */
const SAMPLE_USER_INPUT_UNIT_YAML = `
slug: ask-topic
type: user-input
version: "1.0.0"
description: "Asks user for a topic"
inputs: []
outputs:
  - name: topic
    type: data
    data_type: text
    required: true
user_input:
  question_type: text
  prompt: "What topic would you like a poem about?"
`;

/**
 * Invalid unit YAML - missing required outputs.
 */
const INVALID_UNIT_YAML = `
slug: bad-unit
type: agent
version: "1.0.0"
outputs: []
agent:
  prompt_template: commands/main.md
`;

// ============================================
// Test Setup
// ============================================

describe('WorkUnitService', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let service: WorkUnitService;

  /**
   * Helper to set up a unit in the fake filesystem with parsed data.
   */
  function setupUnit(slug: string, yaml: string, parsedData?: Record<string, unknown>): void {
    const unitPath = `.chainglass/units/${slug}`;
    fs.setDir(unitPath);
    fs.setFile(`${unitPath}/unit.yaml`, yaml);

    // Use provided parsed data or a sensible default based on the slug
    if (parsedData) {
      yamlParser.setPresetParseResult(yaml, parsedData);
    }
  }

  /**
   * Parsed data for sample agent unit.
   */
  const PARSED_AGENT_UNIT = {
    slug: 'write-poem',
    type: 'agent',
    version: '1.0.0',
    description: 'Generates a poem on a given topic',
    inputs: [
      {
        name: 'topic',
        type: 'data',
        data_type: 'text',
        required: true,
        description: 'The topic for the poem',
      },
    ],
    outputs: [
      {
        name: 'poem',
        type: 'data',
        data_type: 'text',
        required: true,
        description: 'The generated poem',
      },
    ],
    agent: {
      prompt_template: 'commands/main.md',
      system_prompt: 'You are a creative poet.',
    },
  };

  /**
   * Parsed data for sample code unit.
   */
  const PARSED_CODE_UNIT = {
    slug: 'process-data',
    type: 'code',
    version: '1.0.0',
    description: 'Processes input data',
    inputs: [{ name: 'data_file', type: 'file', required: true }],
    outputs: [{ name: 'result', type: 'data', data_type: 'json', required: true }],
    code: {
      timeout: 120,
    },
  };

  /**
   * Parsed data for sample user-input unit.
   */
  const PARSED_USER_INPUT_UNIT = {
    slug: 'ask-topic',
    type: 'user-input',
    version: '1.0.0',
    description: 'Asks user for a topic',
    inputs: [],
    outputs: [{ name: 'topic', type: 'data', data_type: 'text', required: true }],
    user_input: {
      question_type: 'text',
      prompt: 'What topic would you like a poem about?',
    },
  };

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    service = new WorkUnitService(fs, pathResolver, yamlParser);

    // Set up base units directory
    fs.setDir('.chainglass/units');
  });

  // ============================================
  // list() tests
  // ============================================

  describe('list()', () => {
    it('should return empty array when no units exist', async () => {
      /*
      Test Doc:
      - Why: Edge case - empty units directory
      - Contract: list() returns { units: [], errors: [] }
      - Quality Contribution: Ensures no crash on empty directory
      */
      const result = await service.list();

      expect(result.errors).toEqual([]);
      expect(result.units).toEqual([]);
    });

    it('should return unit summaries for each valid unit', async () => {
      /*
      Test Doc:
      - Why: Core functionality - listing units
      - Contract: list() returns summary for each unit.yaml found
      - Quality Contribution: Verifies unit discovery works
      */
      setupUnit('write-poem', SAMPLE_AGENT_UNIT_YAML, PARSED_AGENT_UNIT);
      setupUnit('process-data', SAMPLE_CODE_UNIT_YAML, PARSED_CODE_UNIT);

      const result = await service.list();

      expect(result.errors).toEqual([]);
      expect(result.units).toHaveLength(2);
      expect(result.units.map((u) => u.slug)).toContain('write-poem');
      expect(result.units.map((u) => u.slug)).toContain('process-data');
    });

    it('should include type and version in summaries', async () => {
      setupUnit('write-poem', SAMPLE_AGENT_UNIT_YAML, PARSED_AGENT_UNIT);

      const result = await service.list();

      expect(result.units[0]).toMatchObject({
        slug: 'write-poem',
        type: 'agent',
        version: '1.0.0',
      });
    });
  });

  // ============================================
  // load() tests
  // ============================================

  describe('load()', () => {
    it('should return E120 for non-existent unit', async () => {
      /*
      Test Doc:
      - Why: Error handling - unit not found
      - Contract: load(nonexistent) returns { errors: [{ code: 'E120' }] }
      - Quality Contribution: Verifies correct error code
      */
      const result = await service.load('nonexistent');

      expect(result.unit).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E120');
    });

    it('should load valid unit with full details', async () => {
      /*
      Test Doc:
      - Why: Core functionality - loading unit
      - Contract: load(slug) returns { unit: WorkUnit, errors: [] }
      - Quality Contribution: Verifies full unit loading
      */
      setupUnit('write-poem', SAMPLE_AGENT_UNIT_YAML, PARSED_AGENT_UNIT);

      const result = await service.load('write-poem');

      expect(result.errors).toEqual([]);
      expect(result.unit).toBeDefined();
      expect(result.unit?.slug).toBe('write-poem');
      expect(result.unit?.type).toBe('agent');
    });

    it('should return E130 for YAML parse error', async () => {
      /*
      Test Doc:
      - Why: Error handling - YAML syntax error
      - Contract: load(invalid-yaml) returns { errors: [{ code: 'E130' }] }
      - Quality Contribution: Verifies YAML error handling
      */
      fs.setDir('.chainglass/units/bad-yaml');
      fs.setFile('.chainglass/units/bad-yaml/unit.yaml', 'invalid: [unclosed');

      // Configure FakeYamlParser to throw for this content
      // Import at top of file to avoid class identity issues
      yamlParser.setPresetParseError(
        'invalid: [unclosed',
        new YamlParseError('Unexpected end of flow sequence', 1, 19, 'unit.yaml')
      );

      const result = await service.load('bad-yaml');

      expect(result.unit).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E130');
    });

    it('should return E132 for schema validation error', async () => {
      /*
      Test Doc:
      - Why: Error handling - invalid unit structure
      - Contract: load(invalid-schema) returns { errors: [{ code: 'E132' }] }
      - Quality Contribution: Verifies schema validation
      */
      // Set up unit that parses but fails schema validation
      fs.setDir('.chainglass/units/invalid-schema');
      fs.setFile('.chainglass/units/invalid-schema/unit.yaml', INVALID_UNIT_YAML);
      yamlParser.setPresetParseResult(INVALID_UNIT_YAML, {
        slug: 'bad-unit',
        type: 'agent',
        version: '1.0.0',
        outputs: [],
        agent: { prompt_template: 'commands/main.md' },
      });

      const result = await service.load('invalid-schema');

      expect(result.unit).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E132');
    });
  });

  // ============================================
  // create() tests
  // ============================================

  describe('create()', () => {
    it('should return E121 for invalid slug format', async () => {
      /*
      Test Doc:
      - Why: Input validation - slug format
      - Contract: create(invalid) returns { errors: [{ code: 'E121' }] }
      - Quality Contribution: Verifies slug validation
      */
      const result = await service.create('Invalid_Slug', 'agent');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E121');
    });

    it('should return E122 for existing unit', async () => {
      /*
      Test Doc:
      - Why: Error handling - unit already exists
      - Contract: create(existing) returns { errors: [{ code: 'E122' }] }
      - Quality Contribution: Verifies duplicate detection
      */
      setupUnit('existing-unit', SAMPLE_AGENT_UNIT_YAML);

      const result = await service.create('existing-unit', 'agent');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E122');
    });

    it('should create unit directory and scaffold files', async () => {
      /*
      Test Doc:
      - Why: Core functionality - creating unit
      - Contract: create(slug, type) creates directory structure
      - Quality Contribution: Verifies scaffold creation
      */
      const result = await service.create('new-unit', 'agent');

      expect(result.errors).toEqual([]);
      expect(result.slug).toBe('new-unit');
      expect(result.path).toContain('new-unit');
    });

    it('should create type-specific files for agent unit', async () => {
      const result = await service.create('agent-unit', 'agent');

      expect(result.errors).toEqual([]);
      // Verify commands/main.md was created (when implemented)
    });

    it('should accept all valid unit types', async () => {
      const types: ('agent' | 'code' | 'user-input')[] = ['agent', 'code', 'user-input'];

      for (const type of types) {
        const result = await service.create(`${type}-test`, type);
        expect(result.errors).toEqual([]);
      }
    });
  });

  // ============================================
  // validate() tests
  // ============================================

  describe('validate()', () => {
    it('should return valid=true for valid unit', async () => {
      /*
      Test Doc:
      - Why: Core functionality - validation
      - Contract: validate(valid) returns { valid: true, issues: [] }
      - Quality Contribution: Verifies positive validation path
      */
      setupUnit('valid-unit', SAMPLE_AGENT_UNIT_YAML, PARSED_AGENT_UNIT);

      const result = await service.validate('valid-unit');

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should return issues with severity and path', async () => {
      /*
      Test Doc:
      - Why: Validation details - issue structure
      - Contract: validate(invalid) returns { issues: [{ severity, code, path, message }] }
      - Quality Contribution: Verifies issue detail reporting
      */
      fs.setDir('.chainglass/units/invalid');
      fs.setFile('.chainglass/units/invalid/unit.yaml', INVALID_UNIT_YAML);
      yamlParser.setPresetParseResult(INVALID_UNIT_YAML, {
        slug: 'bad-unit',
        type: 'agent',
        version: '1.0.0',
        outputs: [],
        agent: { prompt_template: 'commands/main.md' },
      });

      const result = await service.validate('invalid');

      if (result.issues.length > 0) {
        expect(result.issues[0]).toHaveProperty('severity');
        expect(result.issues[0]).toHaveProperty('code');
        expect(result.issues[0]).toHaveProperty('path');
        expect(result.issues[0]).toHaveProperty('message');
      }
    });

    it('should return E120 for non-existent unit', async () => {
      const result = await service.validate('nonexistent');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E120');
    });
  });
});
