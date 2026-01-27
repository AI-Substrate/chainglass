/**
 * Error thrown when an entity (Workflow, Checkpoint, Run, or Phase) is not found.
 *
 * Per Critical Discovery 07: EntityNotFoundError must have context fields
 * (entityType, identifier, path, parentContext) for debugging and error handling.
 *
 * Used by adapters when entity data is missing or corrupt. The parentContext
 * field helps trace navigation chain failures (e.g., run exists but checkpoint deleted).
 *
 * @example
 * ```typescript
 * // Adapter throws when workflow not found
 * throw new EntityNotFoundError(
 *   'Workflow',
 *   'hello-wf',
 *   '/home/user/.chainglass/workflows/hello-wf/current'
 * );
 *
 * // With parent context for navigation failures
 * throw new EntityNotFoundError(
 *   'Checkpoint',
 *   'v001-abc12345',
 *   '/home/user/.chainglass/workflows/hello-wf/checkpoints/v001-abc12345',
 *   'run-2026-01-25-001'
 * );
 * ```
 */

/**
 * Entity types that can be not found.
 */
export type EntityType = 'Workflow' | 'Checkpoint' | 'Run' | 'Phase' | 'Workspace';

/**
 * Error thrown when an entity is not found at the expected path.
 *
 * Includes context fields to aid debugging:
 * - entityType: The type of entity that was not found
 * - identifier: The identifier used to locate the entity
 * - path: The filesystem path where the entity was expected
 * - parentContext: Optional context about the parent entity in navigation chain
 */
export class EntityNotFoundError extends Error {
  /**
   * The type of entity that was not found.
   */
  readonly entityType: EntityType;

  /**
   * The identifier used to locate the entity (e.g., slug, version, runId, phase name).
   */
  readonly identifier: string;

  /**
   * The filesystem path where the entity was expected.
   */
  readonly path: string;

  /**
   * Optional parent context for navigation chain failures.
   * Helps identify which parent entity led to this lookup.
   */
  readonly parentContext?: string;

  /**
   * Creates a new EntityNotFoundError.
   *
   * @param entityType - The type of entity not found
   * @param identifier - The identifier used to locate the entity
   * @param path - The filesystem path where the entity was expected
   * @param parentContext - Optional parent context for navigation failures
   */
  constructor(entityType: EntityType, identifier: string, path: string, parentContext?: string) {
    const message = parentContext
      ? `${entityType} '${identifier}' not found at ${path} (parent: ${parentContext})`
      : `${entityType} '${identifier}' not found at ${path}`;

    super(message);

    this.entityType = entityType;
    this.identifier = identifier;
    this.path = path;
    this.parentContext = parentContext;

    // Set the prototype explicitly (required for extending built-in classes)
    Object.setPrototypeOf(this, EntityNotFoundError.prototype);

    // Set the name property for error type identification
    this.name = 'EntityNotFoundError';
  }
}
