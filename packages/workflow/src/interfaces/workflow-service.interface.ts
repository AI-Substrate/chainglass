/**
 * Workflow service interface for managing workflow compositions.
 *
 * Per Phase 2: Compose Command - Provides the compose() method that creates
 * a new workflow run from a template.
 *
 * Implementations:
 * - WorkflowService: Real implementation using IFileSystem, IYamlParser, ISchemaValidator
 * - FakeWorkflowService: Configurable implementation for testing with call capture
 */

import type { ComposeResult } from '@chainglass/shared';

/**
 * Interface for workflow management operations.
 */
export interface IWorkflowService {
  /**
   * Create a new workflow run from a template.
   *
   * Resolves the template (name vs path), validates wf.yaml, creates run folder
   * structure, copies schemas and commands, and initializes wf-status.json.
   *
   * Template Resolution (per DYK-02):
   * 1. Expand tilde: if starts with "~", replace with os.homedir()
   * 2. Check KISS indicators:
   *    - Contains "/" OR starts with "." OR path.isAbsolute()?
   *      → YES: Treat as PATH, resolve directly
   *      → NO:  Treat as NAME, search template libraries
   *
   * Search Order for Names:
   * 1. `.chainglass/templates/<name>/` — Project-local
   * 2. `~/.config/chainglass/templates/<name>/` — User-global
   *
   * Run Folder Naming (per DYK-03):
   * - Format: `run-{YYYY-MM-DD}-{NNN}` where NNN is zero-padded ordinal
   * - Ordinal is date-scoped, found via regex filter of existing entries
   * - Handles gaps by finding max+1
   *
   * @param template - Template slug (name) or path to template directory
   * @param runsDir - Directory where run folders are created (default: .chainglass/runs)
   * @returns ComposeResult with runDir, template name, phases array, and errors
   *
   * @example
   * ```typescript
   * // By name (searches template libraries)
   * const result = await service.compose('hello-workflow', '.chainglass/runs');
   *
   * // By path (resolves directly)
   * const result = await service.compose('./my-templates/custom', '.chainglass/runs');
   *
   * // With tilde expansion
   * const result = await service.compose('~/templates/my-workflow', '.chainglass/runs');
   * ```
   *
   * @throws Never throws - all errors returned in ComposeResult.errors:
   * - E020: Template not found
   * - E021: YAML parse error (with line/column)
   * - E022: Schema validation failure (actionable details)
   */
  compose(template: string, runsDir: string): Promise<ComposeResult>;
}
