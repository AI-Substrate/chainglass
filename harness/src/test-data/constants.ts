/**
 * Test-data constants — hardcoded, deterministic slugs.
 *
 * Plan 074 Phase 6 T004.
 * All test data uses these fixed names for reproducibility.
 * P6-DYK #2: templateSlug and workflowId are separate fields.
 */

export const TEST_DATA = {
  units: {
    agent: 'test-agent',
    code: 'test-code',
    userInput: 'test-user-input',
  },
  /** Template slug — used with `cg template save-from --as` */
  templateSlug: 'test-workflow-tpl',
  /** Source graph slug — temporary, deleted after template is saved */
  sourceGraphSlug: 'test-workflow-source',
  /** Workflow instance ID — used with `cg template instantiate --id` */
  workflowId: 'test-workflow',
} as const;

/** All unit slugs as an array for iteration */
export const ALL_UNIT_SLUGS = [
  TEST_DATA.units.agent,
  TEST_DATA.units.code,
  TEST_DATA.units.userInput,
] as const;

/** Unit type mapping */
export const UNIT_TYPES: Record<string, 'agent' | 'code' | 'user-input'> = {
  [TEST_DATA.units.agent]: 'agent',
  [TEST_DATA.units.code]: 'code',
  [TEST_DATA.units.userInput]: 'user-input',
};
