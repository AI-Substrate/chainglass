/**
 * Feature: 029 Agentic Work Units
 *
 * Barrel export for work unit types, schemas, and error factories.
 *
 * @packageDocumentation
 */

// Types - re-exported from schema (per ADR-0003 schema-first approach)
// Note: workunit.types.ts contains compile-time assertions and interface documentation
export type {
  WorkUnit,
  AgenticWorkUnit,
  CodeUnit,
  UserInputUnit,
  WorkUnitInput,
  WorkUnitOutput,
  AgentConfig,
  CodeConfig,
  UserInputConfig,
  UserInputOption,
} from './workunit.schema.js';

// Schemas
export {
  WorkUnitSchema,
  AgenticWorkUnitSchema,
  CodeUnitSchema,
  UserInputUnitSchema,
  WorkUnitInputSchema,
  WorkUnitOutputSchema,
  AgentConfigSchema,
  CodeConfigSchema,
  UserInputConfigSchema,
  UserInputOptionSchema,
  SlugSchema,
  IOTypeSchema,
  DataTypeSchema,
  InputNameSchema,
  formatZodErrors,
} from './workunit.schema.js';

// Errors
export {
  WORKUNIT_ERROR_CODES,
  type WorkunitErrorCode,
  workunitNotFoundError,
  workunitYamlParseError,
  workunitSchemaValidationError,
  workunitNoTemplateError,
  workunitPathEscapeError,
  workunitTemplateNotFoundError,
  workunitTypeMismatchError,
  workunitSlugInvalidError,
  workunitSlugExistsError,
  workunitDeleteFailedError,
} from './workunit-errors.js';

// Adapter (Phase 2)
export { WorkUnitAdapter } from './workunit.adapter.js';

// Service Interface and Types (Phase 2 + Plan 058)
export type {
  IWorkUnitService,
  WorkUnitSummary,
  ListUnitsResult,
  LoadUnitResult,
  ValidateUnitResult,
  CreateUnitSpec,
  CreateUnitResult,
  UpdateUnitPatch,
  UpdateUnitResult,
  DeleteUnitResult,
  RenameUnitResult,
} from './workunit-service.interface.js';
export {
  isAgenticWorkUnit,
  isCodeUnit,
  isUserInputUnit,
} from './workunit-service.interface.js';

// Service Implementation (Phase 2)
export { WorkUnitService } from './workunit.service.js';

// Rich Domain Classes (Phase 2)
export type {
  WorkUnitInstance,
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  UserInputUnitInstance,
} from './workunit.classes.js';
export {
  createAgenticWorkUnitInstance,
  createCodeUnitInstance,
  createUserInputUnitInstance,
} from './workunit.classes.js';

// Fake Service for Testing (Phase 2)
export {
  FakeWorkUnitService,
  type FakeAgentUnitConfig,
  type FakeCodeUnitConfig,
  type FakeUserInputUnitConfig,
  type FakeUnitConfig,
} from './fake-workunit.service.js';

// Reserved Input Parameters (Phase 3)
export {
  RESERVED_INPUT_PARAMS,
  type ReservedInputParam,
  isReservedInputParam,
} from './reserved-params.js';
