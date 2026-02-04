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
} from './workunit-errors.js';
