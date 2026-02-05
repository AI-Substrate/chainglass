/**
 * WorkUnit Rich Domain Classes
 *
 * Per DYK #6: Rich domain objects with type-specific methods.
 * - AgenticWorkUnitInstance: getPrompt(), setPrompt()
 * - CodeUnitInstance: getScript(), setScript()
 * - UserInputUnitInstance: (no template methods)
 *
 * Per Plan 029: Agentic Work Units — Phase 2.
 *
 * @packageDocumentation
 */

import * as path from 'node:path';
import type { IFileSystem } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import { workunitPathEscapeError, workunitTemplateNotFoundError } from './workunit-errors.js';
import type { WorkUnitAdapter } from './workunit.adapter.js';
import type { AgenticWorkUnit, CodeUnit, UserInputUnit, WorkUnit } from './workunit.schema.js';

/**
 * Base interface for all unit instances.
 * Includes the unit data plus access to adapter and filesystem.
 */
interface BaseUnitInstance {
  /** Unit slug */
  readonly slug: string;
  /** Unit version */
  readonly version: string;
  /** Unit description */
  readonly description?: string;
  /** Unit inputs */
  readonly inputs: WorkUnit['inputs'];
  /** Unit outputs */
  readonly outputs: WorkUnit['outputs'];
}

/**
 * Rich domain instance for agent-type work units.
 *
 * Per DYK #6: Has getPrompt() and setPrompt() methods for template access.
 */
export interface AgenticWorkUnitInstance extends BaseUnitInstance {
  readonly type: 'agent';
  /** Agent configuration */
  readonly agent: AgenticWorkUnit['agent'];

  /**
   * Get the prompt template content.
   *
   * @param ctx - Workspace context
   * @returns The prompt template content
   * @throws Error with E184 if path escape detected
   * @throws Error with E185 if template file not found
   */
  getPrompt(ctx: WorkspaceContext): Promise<string>;

  /**
   * Set the prompt template content.
   *
   * @param ctx - Workspace context
   * @param content - The new prompt content
   * @throws Error with E184 if path escape detected
   */
  setPrompt(ctx: WorkspaceContext, content: string): Promise<void>;
}

/**
 * Rich domain instance for code-type work units.
 *
 * Per DYK #6: Has getScript() and setScript() methods for template access.
 */
export interface CodeUnitInstance extends BaseUnitInstance {
  readonly type: 'code';
  /** Code configuration */
  readonly code: CodeUnit['code'];

  /**
   * Get the script content.
   *
   * @param ctx - Workspace context
   * @returns The script content
   * @throws Error with E184 if path escape detected
   * @throws Error with E185 if script file not found
   */
  getScript(ctx: WorkspaceContext): Promise<string>;

  /**
   * Set the script content.
   *
   * @param ctx - Workspace context
   * @param content - The new script content
   * @throws Error with E184 if path escape detected
   */
  setScript(ctx: WorkspaceContext, content: string): Promise<void>;
}

/**
 * Rich domain instance for user-input-type work units.
 *
 * Per DYK #6: Has NO template methods (no prompts or scripts).
 */
export interface UserInputUnitInstance extends BaseUnitInstance {
  readonly type: 'user-input';
  /** User input configuration */
  readonly user_input: UserInputUnit['user_input'];
}

/**
 * Union type for all unit instances.
 */
export type WorkUnitInstance = AgenticWorkUnitInstance | CodeUnitInstance | UserInputUnitInstance;

/**
 * Create an AgenticWorkUnitInstance from validated data.
 *
 * @internal
 */
export function createAgenticWorkUnitInstance(
  data: AgenticWorkUnit,
  adapter: WorkUnitAdapter,
  fs: IFileSystem
): AgenticWorkUnitInstance {
  return {
    type: 'agent',
    slug: data.slug,
    version: data.version,
    description: data.description,
    inputs: data.inputs,
    outputs: data.outputs,
    agent: data.agent,

    async getPrompt(ctx: WorkspaceContext): Promise<string> {
      const templatePath = adapter.getTemplatePath(ctx, data.slug, data.agent.prompt_template);
      const unitDir = adapter.getUnitDir(ctx, data.slug);

      // Security check per DYK #3: use startsWith(unitDir + sep)
      validatePathContainment(templatePath, unitDir, data.slug, data.agent.prompt_template);

      const exists = await fs.exists(templatePath);
      if (!exists) {
        const error = workunitTemplateNotFoundError(data.slug, data.agent.prompt_template);
        throw new Error(`${error.code}: ${error.message}`);
      }

      return fs.readFile(templatePath);
    },

    async setPrompt(ctx: WorkspaceContext, content: string): Promise<void> {
      const templatePath = adapter.getTemplatePath(ctx, data.slug, data.agent.prompt_template);
      const unitDir = adapter.getUnitDir(ctx, data.slug);

      // Security check per DYK #3
      validatePathContainment(templatePath, unitDir, data.slug, data.agent.prompt_template);

      await fs.writeFile(templatePath, content);
    },
  };
}

/**
 * Create a CodeUnitInstance from validated data.
 *
 * @internal
 */
export function createCodeUnitInstance(
  data: CodeUnit,
  adapter: WorkUnitAdapter,
  fs: IFileSystem
): CodeUnitInstance {
  return {
    type: 'code',
    slug: data.slug,
    version: data.version,
    description: data.description,
    inputs: data.inputs,
    outputs: data.outputs,
    code: data.code,

    async getScript(ctx: WorkspaceContext): Promise<string> {
      const scriptPath = adapter.getTemplatePath(ctx, data.slug, data.code.script);
      const unitDir = adapter.getUnitDir(ctx, data.slug);

      // Security check per DYK #3
      validatePathContainment(scriptPath, unitDir, data.slug, data.code.script);

      const exists = await fs.exists(scriptPath);
      if (!exists) {
        const error = workunitTemplateNotFoundError(data.slug, data.code.script);
        throw new Error(`${error.code}: ${error.message}`);
      }

      return fs.readFile(scriptPath);
    },

    async setScript(ctx: WorkspaceContext, content: string): Promise<void> {
      const scriptPath = adapter.getTemplatePath(ctx, data.slug, data.code.script);
      const unitDir = adapter.getUnitDir(ctx, data.slug);

      // Security check per DYK #3
      validatePathContainment(scriptPath, unitDir, data.slug, data.code.script);

      await fs.writeFile(scriptPath, content);
    },
  };
}

/**
 * Create a UserInputUnitInstance from validated data.
 *
 * @internal
 */
export function createUserInputUnitInstance(data: UserInputUnit): UserInputUnitInstance {
  return {
    type: 'user-input',
    slug: data.slug,
    version: data.version,
    description: data.description,
    inputs: data.inputs,
    outputs: data.outputs,
    user_input: data.user_input,
  };
}

/**
 * Validate that a resolved path is contained within the unit directory.
 *
 * Per DYK #3: Use startsWith(unitDir + sep) to prevent prefix attacks.
 * Example: unitDir='my-agent' would incorrectly match 'my-agent-evil/../secrets'
 * With trailing separator: unitDir + '/' = 'my-agent/' won't match 'my-agent-evil/'
 *
 * Also validates:
 * - Template path is not absolute (would bypass containment)
 * - Template path doesn't escape via ../ sequences
 *
 * @param fullPath - The fully resolved path
 * @param unitDir - The unit directory path
 * @param slug - Unit slug for error message
 * @param templatePath - Original template path for error message
 * @throws Error with E184 if path escapes unit directory
 */
function validatePathContainment(
  fullPath: string,
  unitDir: string,
  slug: string,
  templatePath: string
): void {
  // Security check: Reject absolute paths in template path
  // An absolute path like '/etc/passwd' should not be allowed even if
  // path.join() neutralizes it, as it indicates malicious intent.
  if (path.isAbsolute(templatePath)) {
    const error = workunitPathEscapeError(slug, templatePath);
    throw new Error(`${error.code}: ${error.message}`);
  }

  // Normalize paths for comparison
  const normalizedPath = path.normalize(fullPath);
  const normalizedUnitDir = path.normalize(unitDir);

  // Per DYK #3: Must use trailing separator to prevent prefix attacks
  const unitDirWithSep = normalizedUnitDir.endsWith(path.sep)
    ? normalizedUnitDir
    : normalizedUnitDir + path.sep;

  // Path must be exactly the unit dir or start with unitDir + separator
  if (normalizedPath !== normalizedUnitDir && !normalizedPath.startsWith(unitDirWithSep)) {
    const error = workunitPathEscapeError(slug, templatePath);
    throw new Error(`${error.code}: ${error.message}`);
  }
}
