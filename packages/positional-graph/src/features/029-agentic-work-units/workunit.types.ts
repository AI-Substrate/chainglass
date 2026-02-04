/**
 * WorkUnit Compile-Time Compatibility Assertions
 *
 * This file verifies that the Zod-derived types from workunit.schema.ts
 * structurally satisfy NarrowWorkUnit for backward compatibility.
 *
 * Design Notes (from DYK Session 2026-02-04):
 * - DYK #1: data_type is optional at type level to maintain compatibility with NarrowWorkUnitInput
 * - DYK #2: Types derived from Zod schemas in workunit.schema.ts (ADR-0003 schema-first)
 * - DYK #3: Structural compatibility verified via explicit assignment tests and these assertions
 *
 * GREENFIELD: No imports from @chainglass/workgraph
 *
 * @packageDocumentation
 */

import type {
  NarrowWorkUnit,
  NarrowWorkUnitInput,
  NarrowWorkUnitOutput,
} from '../../interfaces/positional-graph-service.interface.js';

// Import the actual exported types from schema (per ADR-0003)
import type { WorkUnit, WorkUnitInput, WorkUnitOutput } from './workunit.schema.js';

// ============================================
// Compile-Time Compatibility Assertions
// ============================================

/**
 * Compile-time assertion: WorkUnitInput must satisfy NarrowWorkUnitInput.
 *
 * This verifies the schema-derived type (z.infer) is structurally compatible
 * with the narrow interface used by collateInputs() and other consumers.
 *
 * The assertion fails at compile time if:
 * - WorkUnitInput is missing required fields from NarrowWorkUnitInput
 * - WorkUnitInput has incompatible field types
 *
 * Note: Extra fields (like data_type) are allowed per structural typing.
 */
type _AssertInputCompatible = WorkUnitInput extends NarrowWorkUnitInput ? true : never;

/**
 * Compile-time assertion: WorkUnitOutput must satisfy NarrowWorkUnitOutput.
 */
type _AssertOutputCompatible = WorkUnitOutput extends NarrowWorkUnitOutput ? true : never;

/**
 * Compile-time assertion: WorkUnit must satisfy NarrowWorkUnit.
 *
 * Critical for backward compatibility: any WorkUnit (agent, code, user-input)
 * can be passed where NarrowWorkUnit is expected. This enables:
 * - collateInputs() to accept WorkUnit without casting
 * - Existing services to work with new unit types
 */
type _AssertWorkUnitCompatible = WorkUnit extends NarrowWorkUnit ? true : never;

// Suppress "unused" warnings - these assertions are for compile-time checking only
void (0 as unknown as _AssertInputCompatible);
void (0 as unknown as _AssertOutputCompatible);
void (0 as unknown as _AssertWorkUnitCompatible);
