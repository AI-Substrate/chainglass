/**
 * Shared CLI command helpers.
 *
 * Extracted from workgraph.command.ts and unit.command.ts (Phase 6: Plan 026).
 * Per DYK-P6-I5: These helpers were duplicated across 2 command files
 * and would be duplicated a 3rd time for positional-graph.
 *
 * Exports:
 * - createOutputAdapter: Select JSON or Console output
 * - wrapAction: Try-catch wrapper for Commander.js action handlers
 * - resolveOrOverrideContext: Resolve WorkspaceContext from CWD or --workspace-path
 * - noContextError: Build a standard E074 error result for missing workspace context
 */

import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import { createCliProductionContainer } from '../lib/container.js';

/**
 * Create an output adapter based on the --json flag.
 */
export function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Wrap async action handlers with try-catch for graceful error handling.
 * Per FIX-003: Prevents unhandled promise rejections from crashing CLI.
 */
export function wrapAction<T extends unknown[]>(
  handler: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  };
}

/**
 * Resolve workspace context from CWD or explicit --workspace-path.
 *
 * Per AC-23: --workspace-path flag overrides CWD-based context.
 * Per Plan 021: All service calls require WorkspaceContext.
 *
 * @param overridePath - Explicit path if --workspace-path was provided
 * @returns WorkspaceContext if found, null otherwise
 */
export async function resolveOrOverrideContext(
  overridePath?: string
): Promise<WorkspaceContext | null> {
  const container = createCliProductionContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const path = overridePath ?? process.cwd();
  return workspaceService.resolveContext(path);
}

/**
 * Build a standard E074 "no workspace context" error object.
 *
 * Every command handler needs this when resolveOrOverrideContext returns null.
 * Returns an array of ResultError for inclusion in a result object.
 */
export function noContextError(workspacePath?: string): {
  code: string;
  message: string;
  action: string;
}[] {
  return [
    {
      code: 'E074',
      message: 'No workspace context found',
      action: workspacePath
        ? `Path '${workspacePath}' is not inside a registered workspace`
        : 'Current directory is not inside a registered workspace. Run: cg workspace list',
    },
  ];
}
