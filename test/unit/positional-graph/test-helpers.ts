/**
 * Test Helpers for Positional Graph Tests
 *
 * This file provides reusable test utilities for positional graph testing.
 * Created as part of Plan 028: Positional Graph Execution Lifecycle Commands.
 *
 * These helpers consolidate patterns found in multiple test files to reduce
 * duplication and provide a consistent testing interface for Phase 2-6.
 */

import { unitNotFoundError } from '@chainglass/positional-graph/errors';
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
