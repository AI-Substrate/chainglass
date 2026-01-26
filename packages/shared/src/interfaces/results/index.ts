/**
 * Result type exports.
 *
 * Exports all result interfaces for workflow commands.
 */

// Base types
export type { BaseResult, ResultError } from './base.types.js';

// Command-specific result types
export type {
  ComposeResult,
  PrepareResult,
  ValidateResult,
  FinalizeResult,
  // Handover command result types (Phase 3 Subtask 002)
  AcceptResult,
  PreflightResult,
  HandoverResult,
  // Supporting types
  ResolvedInput,
  CopiedFile,
  ValidatedFile,
  ValidatedOutput, // @deprecated alias
  PhaseInfo,
  Facilitator,
  PhaseState,
  StatusEntry,
  PreflightChecks,
} from './command.types.js';

// Message command result types (Phase 3 Subtask 001)
export type {
  MessageCreateResult,
  MessageAnswerResult,
  MessageListResult,
  MessageReadResult,
  MessageSummary,
  MessageAnswerData,
  MessageData,
} from './message.types.js';

// Workflow registry result types (Phase 1)
export type {
  ListResult,
  InfoResult,
  CheckpointResult,
  RestoreResult,
  VersionsResult,
  CheckpointInfo,
  WorkflowSummary,
  WorkflowInfo,
} from './registry.types.js';
