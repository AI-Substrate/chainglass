/**
 * Reserved Input Parameters
 *
 * Defines reserved parameter names for template content access.
 * Per Plan 029: Agentic Work Units — Phase 3.
 *
 * Reserved params use hyphens (e.g., 'main-prompt') while user input names
 * use underscores (per schema: /^[a-z][a-z0-9_]*$/), so there's no collision.
 *
 * @packageDocumentation
 */

/**
 * Reserved input parameter names that route to template content.
 *
 * - `main-prompt`: Routes to AgenticWorkUnit.getPrompt() — returns prompt template content
 * - `main-script`: Routes to CodeUnit.getScript() — returns script file content
 *
 * Per Critical Discovery 04: No collision with user inputs because schema prevents
 * hyphens in user input names.
 */
export const RESERVED_INPUT_PARAMS = ['main-prompt', 'main-script'] as const;

/**
 * Type for reserved input parameter names.
 */
export type ReservedInputParam = (typeof RESERVED_INPUT_PARAMS)[number];

/**
 * Check if an input name is a reserved parameter.
 *
 * @param inputName - The input name to check
 * @returns True if the input name is reserved (main-prompt or main-script)
 *
 * @example
 * ```typescript
 * isReservedInputParam('main-prompt')  // → true
 * isReservedInputParam('user_input')   // → false
 * isReservedInputParam('main_prompt')  // → false (underscore, not hyphen)
 * ```
 */
export function isReservedInputParam(inputName: string): inputName is ReservedInputParam {
  return (RESERVED_INPUT_PARAMS as readonly string[]).includes(inputName);
}
