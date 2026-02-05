/**
 * Feature: 030 Orchestration
 *
 * Barrel export for orchestration types, schemas, builder, and view.
 *
 * @packageDocumentation
 */

// Types
export type {
  ExecutionStatus,
  ReadinessDetail,
  NodeError,
  NodeReality,
  LineReality,
  QuestionOption,
  QuestionReality,
  PositionalGraphReality,
} from './reality.types.js';

// Schemas
export {
  ExecutionStatusSchema,
  ReadinessDetailSchema,
  NodeErrorSchema,
  QuestionOptionSchema,
  LineRealitySchema,
  QuestionRealitySchema,
  NodeRealitySchema,
} from './reality.schema.js';

// Builder
export { buildPositionalGraphReality } from './reality.builder.js';
export type { BuildRealityOptions } from './reality.builder.js';

// View
export { PositionalGraphRealityView } from './reality.view.js';
