/**
 * Test Helpers for Positional Graph Tests
 *
 * This file provides reusable test utilities for positional graph testing.
 * Created as part of Plan 028: Positional Graph Execution Lifecycle Commands.
 *
 * These helpers consolidate patterns found in multiple test files to reduce
 * duplication and provide a consistent testing interface for Phase 2-6.
 */

import type {
  AgenticWorkUnit,
  CodeUnit,
  UserInputUnit,
  WorkUnit,
} from '@chainglass/positional-graph';
import { unitNoTemplateError, unitNotFoundError } from '@chainglass/positional-graph/errors';
import type {
  IWorkUnitService,
  ListUnitsResult,
  LoadUnitResult,
  ValidateUnitResult,
  WorkUnitSummary,
} from '@chainglass/positional-graph/features/029-agentic-work-units';
import type {
  IWorkUnitLoader,
  NarrowWorkUnit,
  NarrowWorkUnitInput,
  NarrowWorkUnitOutput,
} from '@chainglass/positional-graph/interfaces';
import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

// ============================================
// WorkUnit Builder
// ============================================

/**
 * Builder interface for creating NarrowWorkUnit test fixtures.
 */
export interface WorkUnitConfig {
  slug: string;
  inputs?: Array<{
    name: string;
    type?: 'data' | 'file';
    required?: boolean;
    description?: string;
  }>;
  outputs?: Array<{
    name: string;
    type?: 'data' | 'file';
    required?: boolean;
    description?: string;
  }>;
}

/**
 * Creates a NarrowWorkUnit from a simplified configuration.
 *
 * Defaults:
 * - type: 'data'
 * - required: true (for outputs), false (for inputs)
 *
 * @example
 * const unit = createWorkUnit({
 *   slug: 'sample-coder',
 *   inputs: [{ name: 'spec' }],
 *   outputs: [{ name: 'script', type: 'file' }, { name: 'language' }]
 * });
 */
export function createWorkUnit(config: WorkUnitConfig): NarrowWorkUnit {
  const inputs: NarrowWorkUnitInput[] = (config.inputs ?? []).map((input) => ({
    name: input.name,
    type: input.type ?? 'data',
    required: input.required ?? false,
    description: input.description,
  }));

  const outputs: NarrowWorkUnitOutput[] = (config.outputs ?? []).map((output) => ({
    name: output.name,
    type: output.type ?? 'data',
    required: output.required ?? true,
    description: output.description,
  }));

  return {
    slug: config.slug,
    inputs,
    outputs,
  };
}

// ============================================
// stubWorkUnitLoader
// ============================================

/**
 * Options for stubWorkUnitLoader configuration.
 */
export interface StubWorkUnitLoaderOptions {
  /**
   * Pre-configured WorkUnits. Takes precedence over slugs.
   */
  units?: NarrowWorkUnit[];

  /**
   * Simple slugs that should return minimal stub units.
   * Useful for tests that don't care about I/O declarations.
   */
  slugs?: string[];

  /**
   * Default inputs/outputs to use for slug-based units.
   */
  defaultInputs?: NarrowWorkUnitInput[];
  defaultOutputs?: NarrowWorkUnitOutput[];

  /**
   * If true, returns E159 error for unknown slugs.
   * If false (default), returns empty unit for any slug.
   */
  strictMode?: boolean;
}

/**
 * Creates a stub IWorkUnitLoader for testing.
 *
 * This is the primary test helper for creating mock WorkUnit loaders in
 * Phase 2-6 tests. It supports multiple configuration patterns:
 *
 * 1. **Minimal stub** (no config): Returns empty unit for any slug
 * 2. **Units array**: Full control over unit definitions
 * 3. **Slugs array**: Simple slugs with default I/O
 * 4. **Strict mode**: Returns E159 error for unknown slugs
 *
 * @example
 * // Minimal stub - accepts any slug
 * const loader = stubWorkUnitLoader();
 *
 * @example
 * // With specific units
 * const loader = stubWorkUnitLoader({
 *   units: [
 *     createWorkUnit({ slug: 'sample-coder', outputs: [{ name: 'script' }] }),
 *     createWorkUnit({ slug: 'sample-input', outputs: [{ name: 'spec' }] }),
 *   ]
 * });
 *
 * @example
 * // Simple slugs (accepts these slugs with empty I/O)
 * const loader = stubWorkUnitLoader({
 *   slugs: ['sample-coder', 'sample-input', 'sample-tester']
 * });
 *
 * @example
 * // Strict mode (returns error for unknown slugs)
 * const loader = stubWorkUnitLoader({
 *   units: [...],
 *   strictMode: true
 * });
 */
export function stubWorkUnitLoader(options: StubWorkUnitLoaderOptions = {}): IWorkUnitLoader {
  const {
    units = [],
    slugs = [],
    defaultInputs = [],
    defaultOutputs = [],
    strictMode = false,
  } = options;

  // Build lookup map from units
  const unitMap = new Map<string, NarrowWorkUnit>(units.map((u) => [u.slug, u]));

  // Add simple slugs as stub units
  for (const slug of slugs) {
    if (!unitMap.has(slug)) {
      unitMap.set(slug, {
        slug,
        inputs: defaultInputs,
        outputs: defaultOutputs,
      });
    }
  }

  return {
    async load(
      _ctx: WorkspaceContext,
      slug: string
    ): Promise<{ unit?: NarrowWorkUnit; errors: ResultError[] }> {
      const unit = unitMap.get(slug);

      if (unit) {
        return { unit, errors: [] };
      }

      if (strictMode) {
        return { errors: [unitNotFoundError(slug)] };
      }

      // Non-strict mode: return a minimal stub for any unknown slug
      return {
        unit: { slug, inputs: defaultInputs, outputs: defaultOutputs },
        errors: [],
      };
    },
  };
}

// ============================================
// Test Fixtures for Common WorkUnits
// ============================================

/**
 * Standard test fixtures for the 3-node E2E pipeline.
 * These match the sample-input, sample-coder, sample-tester units
 * used in the E2E flow.
 */
export const testFixtures = {
  /**
   * sample-input: Produces spec (string)
   */
  sampleInput: createWorkUnit({
    slug: 'sample-input',
    outputs: [{ name: 'spec', type: 'data', required: true }],
  }),

  /**
   * sample-coder: Consumes spec, produces script (file) and language (string)
   */
  sampleCoder: createWorkUnit({
    slug: 'sample-coder',
    inputs: [{ name: 'spec', type: 'data' }],
    outputs: [
      { name: 'script', type: 'file', required: true },
      { name: 'language', type: 'data', required: true },
    ],
  }),

  /**
   * sample-tester: Consumes script and language, produces success and output
   */
  sampleTester: createWorkUnit({
    slug: 'sample-tester',
    inputs: [
      { name: 'script', type: 'file' },
      { name: 'language', type: 'data' },
    ],
    outputs: [
      { name: 'success', type: 'data', required: true },
      { name: 'output', type: 'data', required: false },
    ],
  }),

  /**
   * research-concept: Common utility unit with multiple outputs
   */
  researchConcept: createWorkUnit({
    slug: 'research-concept',
    outputs: [
      { name: 'summary', type: 'data', required: true },
      { name: 'references', type: 'data', required: false },
    ],
  }),
};

/**
 * Creates a loader pre-configured with the standard E2E pipeline units.
 */
export function createE2ETestLoader(): IWorkUnitLoader {
  return stubWorkUnitLoader({
    units: [
      testFixtures.sampleInput,
      testFixtures.sampleCoder,
      testFixtures.sampleTester,
      testFixtures.researchConcept,
    ],
    strictMode: true,
  });
}

// ============================================
// E2E Execution Lifecycle Test Fixtures (7-node pipeline)
// ============================================

/**
 * E2E execution lifecycle test fixtures for the 3-line, 7-node pipeline.
 *
 * These fixtures test the **execution lifecycle infrastructure** — the data
 * system that lets nodes start, save outputs, ask questions, retrieve inputs,
 * and complete. All units use NarrowWorkUnit (no type field — behavior is
 * implicit in the E2E test script).
 *
 * Pipeline structure:
 * - Line 0 (Spec Creation): spec-builder → spec-reviewer (serial)
 * - Line 1 (Implementation): coder (Q&A) → tester (serial, MANUAL gate)
 * - Line 2 (PR Preparation): alignment-tester || pr-preparer → PR-creator
 *
 * @see e2e-workunits.md for full WorkUnit definitions
 */
export const e2eExecutionFixtures = {
  /**
   * sample-spec-builder: Entry point, produces spec
   * Behavior: Agentic (simulates agent creating spec)
   */
  sampleSpecBuilder: createWorkUnit({
    slug: 'sample-spec-builder',
    inputs: [], // Entry point - no inputs
    outputs: [{ name: 'spec', type: 'data', required: true }],
  }),

  /**
   * sample-spec-reviewer: Reviews and refines spec
   * Behavior: Agentic (simulates agent reviewing spec)
   */
  sampleSpecReviewer: createWorkUnit({
    slug: 'sample-spec-reviewer',
    inputs: [{ name: 'spec', type: 'data', required: true }],
    outputs: [
      { name: 'reviewed_spec', type: 'data', required: true },
      { name: 'review_notes', type: 'data', required: false },
    ],
  }),

  /**
   * sample-coder: Writes code based on spec
   * Behavior: Agentic with Q&A (asks "Which language?")
   */
  sampleCoderE2E: createWorkUnit({
    slug: 'sample-coder',
    inputs: [{ name: 'spec', type: 'data', required: true }],
    outputs: [
      { name: 'language', type: 'data', required: true },
      { name: 'code', type: 'file', required: true },
    ],
  }),

  /**
   * sample-tester: Tests the generated code
   * Behavior: Agentic (simulates running tests)
   */
  sampleTesterE2E: createWorkUnit({
    slug: 'sample-tester',
    inputs: [
      { name: 'language', type: 'data', required: true },
      { name: 'code', type: 'file', required: true },
    ],
    outputs: [
      { name: 'test_passed', type: 'data', required: true },
      { name: 'test_output', type: 'data', required: true },
    ],
  }),

  /**
   * sample-spec-alignment-tester: Verifies implementation aligns with spec
   * Behavior: Agentic (simulates spec alignment check)
   * Line 2, Position 0 (PARALLEL)
   */
  sampleSpecAlignmentTester: createWorkUnit({
    slug: 'sample-spec-alignment-tester',
    inputs: [
      { name: 'spec', type: 'data', required: true },
      { name: 'code', type: 'file', required: true },
      { name: 'test_output', type: 'data', required: true },
    ],
    outputs: [
      { name: 'alignment_score', type: 'data', required: true },
      { name: 'alignment_notes', type: 'data', required: true },
    ],
  }),

  /**
   * sample-pr-preparer: Prepares PR metadata (title, body)
   * Behavior: Agentic (simulates PR metadata creation)
   * Line 2, Position 1 (PARALLEL - NO dependency on alignment-tester!)
   */
  samplePrPreparer: createWorkUnit({
    slug: 'sample-pr-preparer',
    inputs: [
      { name: 'spec', type: 'data', required: true },
      { name: 'test_output', type: 'data', required: true },
    ],
    outputs: [
      { name: 'pr_title', type: 'data', required: true },
      { name: 'pr_body', type: 'data', required: true },
      { name: 'pr_labels', type: 'data', required: false },
    ],
  }),

  /**
   * sample-pr-creator: Creates the actual PR
   * Behavior: Code-unit (simple start → save → end, no Q&A)
   * Line 2, Position 2 (SERIAL - waits for pr-preparer)
   */
  samplePrCreator: createWorkUnit({
    slug: 'sample-pr-creator',
    inputs: [
      { name: 'pr_title', type: 'data', required: true },
      { name: 'pr_body', type: 'data', required: true },
    ],
    outputs: [
      { name: 'pr_url', type: 'data', required: true },
      { name: 'pr_number', type: 'data', required: true },
    ],
  }),
};

/**
 * Creates a loader pre-configured with all 7 E2E execution lifecycle units.
 */
export function createE2EExecutionTestLoader(): IWorkUnitLoader {
  return stubWorkUnitLoader({
    units: [
      e2eExecutionFixtures.sampleSpecBuilder,
      e2eExecutionFixtures.sampleSpecReviewer,
      e2eExecutionFixtures.sampleCoderE2E,
      e2eExecutionFixtures.sampleTesterE2E,
      e2eExecutionFixtures.sampleSpecAlignmentTester,
      e2eExecutionFixtures.samplePrPreparer,
      e2eExecutionFixtures.samplePrCreator,
    ],
    strictMode: true,
  });
}

// ============================================
// Enriched E2E Fixtures (Full WorkUnit Types)
// ============================================

/**
 * Enriched E2E execution lifecycle fixtures with full WorkUnit types.
 *
 * Pipeline structure:
 * - Line 0 (Spec Creation): spec-builder [agent] → spec-reviewer [agent]
 * - Line 1 (Implementation): coder [agent+Q&A] → tester [agent]
 * - Line 2 (PR Preparation): alignment-tester [agent] || pr-preparer [agent] → pr-creator [code]
 *
 * Naming convention: camelCase with acronyms lowercase (Pr not PR)
 */
export const e2eEnrichedFixtures = {
  /**
   * sample-spec-builder: Entry point agent
   * Type: AgenticWorkUnit
   */
  sampleSpecBuilder: {
    slug: 'sample-spec-builder',
    type: 'agent',
    version: '1.0.0',
    description: 'Creates initial specification from user request',
    inputs: [],
    outputs: [
      {
        name: 'spec',
        type: 'data',
        data_type: 'text',
        required: true,
        description: 'The generated specification',
      },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      system_prompt: 'You are a specification writer.',
      supported_agents: ['claude-code'],
      estimated_tokens: 1500,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-spec-reviewer: Reviews and refines spec
   * Type: AgenticWorkUnit
   */
  sampleSpecReviewer: {
    slug: 'sample-spec-reviewer',
    type: 'agent',
    version: '1.0.0',
    description: 'Reviews specification for completeness and clarity',
    inputs: [{ name: 'spec', type: 'data', data_type: 'text', required: true }],
    outputs: [
      { name: 'reviewed_spec', type: 'data', data_type: 'text', required: true },
      { name: 'review_notes', type: 'data', data_type: 'text', required: false },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1500,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-coder: Writes code with Q&A for language selection
   * Type: AgenticWorkUnit
   */
  sampleCoderE2E: {
    slug: 'sample-coder',
    type: 'agent',
    version: '1.0.0',
    description: 'Generates code based on specification, asks which language to use',
    inputs: [{ name: 'spec', type: 'data', data_type: 'text', required: true }],
    outputs: [
      { name: 'language', type: 'data', data_type: 'text', required: true },
      { name: 'code', type: 'file', required: true },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 2000,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-tester: Tests the generated code
   * Type: AgenticWorkUnit
   */
  sampleTesterE2E: {
    slug: 'sample-tester',
    type: 'agent',
    version: '1.0.0',
    description: 'Runs generated code and reports output',
    inputs: [
      { name: 'language', type: 'data', data_type: 'text', required: true },
      { name: 'code', type: 'file', required: true },
    ],
    outputs: [
      { name: 'test_passed', type: 'data', data_type: 'boolean', required: true },
      { name: 'test_output', type: 'data', data_type: 'text', required: true },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1000,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-spec-alignment-tester: Verifies code aligns with spec
   * Type: AgenticWorkUnit
   * Line 2, Position 0 (PARALLEL)
   */
  sampleSpecAlignmentTester: {
    slug: 'sample-spec-alignment-tester',
    type: 'agent',
    version: '1.0.0',
    description: 'Verifies implementation aligns with specification',
    inputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true },
      { name: 'code', type: 'file', required: true },
      { name: 'test_output', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'alignment_score', type: 'data', data_type: 'text', required: true },
      { name: 'alignment_notes', type: 'data', data_type: 'text', required: true },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1500,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-pr-preparer: Prepares PR metadata
   * Type: AgenticWorkUnit
   * Line 2, Position 1 (PARALLEL)
   */
  samplePrPreparer: {
    slug: 'sample-pr-preparer',
    type: 'agent',
    version: '1.0.0',
    description: 'Prepares PR metadata (title, body, labels)',
    inputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true },
      { name: 'test_output', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'pr_title', type: 'data', data_type: 'text', required: true },
      { name: 'pr_body', type: 'data', data_type: 'text', required: true },
      { name: 'pr_labels', type: 'data', data_type: 'text', required: false },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1000,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-pr-creator: Creates the actual PR
   * Type: CodeUnit (simple script execution, no Q&A)
   * Line 2, Position 2 (SERIAL)
   */
  samplePrCreator: {
    slug: 'sample-pr-creator',
    type: 'code',
    version: '1.0.0',
    description: 'Creates PR using GitHub CLI',
    inputs: [
      { name: 'pr_title', type: 'data', data_type: 'text', required: true },
      { name: 'pr_body', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'pr_url', type: 'data', data_type: 'text', required: true },
      { name: 'pr_number', type: 'data', data_type: 'text', required: true },
    ],
    code: {
      script: 'scripts/main.sh',
      timeout: 60,
    },
  } satisfies CodeUnit,
};

// ============================================
// UserInputUnit Fixtures
// ============================================

/**
 * sample-user-requirements: Entry point UserInputUnit
 * Type: UserInputUnit
 * Purpose: Demonstrates Row 0 semantics — human provides initial data
 */
export const sampleUserRequirements: UserInputUnit = {
  slug: 'sample-user-requirements',
  type: 'user-input',
  version: '1.0.0',
  description: 'Collects requirements from user to start the workflow',
  inputs: [], // Entry point — no inputs
  outputs: [{ name: 'requirements', type: 'data', data_type: 'text', required: true }],
  user_input: {
    question_type: 'text',
    prompt: 'Enter the requirements for the code to generate:',
  },
};

/**
 * sample-language-selector: Single-choice UserInputUnit
 * Type: UserInputUnit
 * Purpose: Demonstrates single-choice question type
 */
export const sampleLanguageSelector: UserInputUnit = {
  slug: 'sample-language-selector',
  type: 'user-input',
  version: '1.0.0',
  description: 'User selects programming language',
  inputs: [],
  outputs: [{ name: 'language', type: 'data', data_type: 'text', required: true }],
  user_input: {
    question_type: 'single',
    prompt: 'Which programming language should be used?',
    options: [
      { key: 'A', label: 'TypeScript', description: 'Recommended for web projects' },
      { key: 'B', label: 'Python', description: 'Good for data/ML projects' },
      { key: 'C', label: 'Go', description: 'Good for CLI tools' },
      { key: 'D', label: 'Rust', description: 'Good for performance-critical code' },
    ],
  },
};

/**
 * Creates a loader pre-configured with the enriched E2E units.
 * Returns units as NarrowWorkUnit (narrowed from full WorkUnit types).
 */
export function createE2EEnrichedTestLoader(): IWorkUnitLoader {
  return stubWorkUnitLoader({
    units: Object.values(e2eEnrichedFixtures),
    strictMode: true,
  });
}

// ============================================
// stubWorkUnitService
// ============================================

/**
 * Options for stubWorkUnitService.
 */
export interface StubWorkUnitServiceOptions {
  /** Full WorkUnit definitions */
  units: WorkUnit[];

  /**
   * Template content for AgenticWorkUnit and CodeUnit.
   * Key: slug, Value: template content string
   */
  templateContent?: Map<string, string>;

  /** If true, returns E180 error for unknown slugs (default: true) */
  strictMode?: boolean;
}

/**
 * Creates a stub IWorkUnitService for testing enriched unit types.
 *
 * This helper provides a functional API for creating WorkUnit service stubs
 * without instantiating a class. It wraps FakeWorkUnitService internally.
 *
 * @example
 * const service = stubWorkUnitService({
 *   units: [
 *     e2eEnrichedFixtures.sampleSpecBuilder,
 *     e2eEnrichedFixtures.sampleCoderE2E,
 *   ],
 *   templateContent: new Map([
 *     ['sample-spec-builder', 'You are a specification writer.\n\n{{spec}}'],
 *     ['sample-coder', 'Write code for:\n\n{{spec}}'],
 *   ]),
 * });
 */
export function stubWorkUnitService(options: StubWorkUnitServiceOptions): IWorkUnitService {
  const { units, templateContent = new Map(), strictMode = true } = options;

  // Import FakeWorkUnitService dynamically to avoid circular deps
  // Using inline implementation instead for test isolation
  const unitMap = new Map<string, WorkUnit>(units.map((u) => [u.slug, u]));

  return {
    async list(_ctx): Promise<ListUnitsResult> {
      const summaries: WorkUnitSummary[] = units.map((u) => ({
        slug: u.slug,
        type: u.type,
        version: u.version,
      }));
      return { units: summaries, errors: [] };
    },

    async load(_ctx, slug): Promise<LoadUnitResult> {
      const unit = unitMap.get(slug);
      if (!unit) {
        if (strictMode) {
          return { errors: [unitNotFoundError(slug)] };
        }
        return { unit: undefined, errors: [unitNotFoundError(slug)] };
      }

      // Create fake instance based on type
      const instance = createFakeWorkUnitInstance(unit, templateContent);
      return { unit: instance, errors: [] };
    },

    async validate(_ctx, slug): Promise<ValidateUnitResult> {
      const exists = unitMap.has(slug);
      if (!exists && strictMode) {
        return { valid: false, errors: [unitNotFoundError(slug)] };
      }
      return { valid: exists, errors: [] };
    },
  };
}

/**
 * Helper type for WorkUnitInstance creation.
 */
type WorkUnitInstanceType =
  | import('@chainglass/positional-graph/features/029-agentic-work-units').AgenticWorkUnitInstance
  | import('@chainglass/positional-graph/features/029-agentic-work-units').CodeUnitInstance
  | import('@chainglass/positional-graph/features/029-agentic-work-units').UserInputUnitInstance;

/**
 * Create a fake WorkUnitInstance from a WorkUnit definition.
 * @internal
 */
function createFakeWorkUnitInstance(
  unit: WorkUnit,
  templateContent: Map<string, string>
): WorkUnitInstanceType {
  const getContent = () => templateContent.get(unit.slug);

  switch (unit.type) {
    case 'agent':
      return {
        type: 'agent',
        slug: unit.slug,
        version: unit.version,
        description: unit.description,
        inputs: unit.inputs,
        outputs: unit.outputs,
        agent: unit.agent,
        async getPrompt(_ctx): Promise<string> {
          const content = getContent();
          if (content === undefined) {
            throw new Error(`E185: Template content not configured for '${unit.slug}' in stub`);
          }
          return content;
        },
        async setPrompt(_ctx, content: string): Promise<void> {
          templateContent.set(unit.slug, content);
        },
      };

    case 'code':
      return {
        type: 'code',
        slug: unit.slug,
        version: unit.version,
        description: unit.description,
        inputs: unit.inputs,
        outputs: unit.outputs,
        code: unit.code,
        async getScript(_ctx): Promise<string> {
          const content = getContent();
          if (content === undefined) {
            throw new Error(`E185: Template content not configured for '${unit.slug}' in stub`);
          }
          return content;
        },
        async setScript(_ctx, content: string): Promise<void> {
          templateContent.set(unit.slug, content);
        },
      };

    case 'user-input':
      return {
        type: 'user-input',
        slug: unit.slug,
        version: unit.version,
        description: unit.description,
        inputs: unit.inputs,
        outputs: unit.outputs,
        user_input: unit.user_input,
      };
  }
}
