/**
 * Extended result types for PhaseService with optional Phase entity.
 *
 * Per Phase 6: Service Unification & Validation.
 * Per DYK-01: Keep Result types, add optional `phaseEntity?: Phase` field.
 *
 * These types extend the base Result types from @chainglass/shared to include
 * the Phase entity when IPhaseAdapter is injected into PhaseService.
 *
 * Using separate types avoids circular dependency:
 * - @chainglass/shared defines base Result types (no Phase reference)
 * - @chainglass/workflow defines extended types with Phase entity
 */

import type {
  AcceptResult,
  FinalizeResult,
  HandoverResult,
  PreflightResult,
  PrepareResult,
  ValidateResult,
} from '@chainglass/shared';
import type { Phase } from '../entities/phase.js';

/**
 * PrepareResult with optional Phase entity.
 *
 * When PhaseService is constructed with IPhaseAdapter, the prepare() method
 * will load and include the Phase entity reflecting post-prepare state.
 */
export interface PrepareResultWithEntity extends PrepareResult {
  /** Phase entity loaded after prepare (only present if IPhaseAdapter injected) */
  phaseEntity?: Phase;
}

/**
 * ValidateResult with optional Phase entity.
 *
 * When PhaseService is constructed with IPhaseAdapter, the validate() method
 * will load and include the Phase entity reflecting post-validate state.
 */
export interface ValidateResultWithEntity extends ValidateResult {
  /** Phase entity loaded after validate (only present if IPhaseAdapter injected) */
  phaseEntity?: Phase;
}

/**
 * FinalizeResult with optional Phase entity.
 *
 * When PhaseService is constructed with IPhaseAdapter, the finalize() method
 * will load and include the Phase entity reflecting post-finalize state (complete).
 */
export interface FinalizeResultWithEntity extends FinalizeResult {
  /** Phase entity loaded after finalize (only present if IPhaseAdapter injected) */
  phaseEntity?: Phase;
}

/**
 * AcceptResult with optional Phase entity.
 *
 * When PhaseService is constructed with IPhaseAdapter, the accept() method
 * will load and include the Phase entity reflecting post-accept state.
 */
export interface AcceptResultWithEntity extends AcceptResult {
  /** Phase entity loaded after accept (only present if IPhaseAdapter injected) */
  phaseEntity?: Phase;
}

/**
 * PreflightResult with optional Phase entity.
 *
 * When PhaseService is constructed with IPhaseAdapter, the preflight() method
 * will load and include the Phase entity reflecting post-preflight state.
 */
export interface PreflightResultWithEntity extends PreflightResult {
  /** Phase entity loaded after preflight (only present if IPhaseAdapter injected) */
  phaseEntity?: Phase;
}

/**
 * HandoverResult with optional Phase entity.
 *
 * When PhaseService is constructed with IPhaseAdapter, the handover() method
 * will load and include the Phase entity reflecting post-handover state.
 */
export interface HandoverResultWithEntity extends HandoverResult {
  /** Phase entity loaded after handover (only present if IPhaseAdapter injected) */
  phaseEntity?: Phase;
}
