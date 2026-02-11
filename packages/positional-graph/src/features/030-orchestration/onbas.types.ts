/**
 * IONBAS — Interface for the OrchestrationNextBestActionService.
 *
 * Pure, synchronous, stateless: takes a snapshot, returns a request.
 * Per Workshop #5 §Service Interface.
 *
 * @packageDocumentation
 */

import type { OrchestrationRequest } from './orchestration-request.schema.js';
import type { PositionalGraphReality } from './reality.types.js';

/**
 * Determines the next best action for a positional graph.
 *
 * Wraps `walkForNextAction()` behind an interface for DI and test substitution.
 */
export interface IONBAS {
  getNextAction(reality: PositionalGraphReality): OrchestrationRequest;
}
