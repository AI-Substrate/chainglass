/**
 * Phase MCP Tools
 *
 * Per Phase 5: MCP Integration - Implements phase_prepare, phase_validate, phase_finalize tools.
 * Per ADR-0001: Follows check_health exemplar pattern.
 * Per WF-01: Uses Zod for inputSchema (SDK natively supports it).
 */

import type { ILogger } from '@chainglass/shared';
import {
  type FinalizeResult,
  type IFileSystem,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
  type PrepareResult,
  type ValidateResult,
} from '@chainglass/shared';
import {
  type IPhaseService,
  type ISchemaValidator,
  type IYamlParser,
  PhaseService,
  SchemaValidatorAdapter,
  type ValidateCheckMode,
  YamlParserAdapter,
} from '@chainglass/workflow';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegisteredToolInfo } from '../server.js';

/**
 * Registers all phase tools on the MCP server.
 */
export function registerPhaseTools(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  registerPhasePrepareTool(server, registry, logger);
  registerPhaseValidateTool(server, registry, logger);
  registerPhaseFinalizeTool(server, registry, logger);
}

/**
 * Creates PhaseService with dependencies.
 * TODO: Wire through DI container (per ADR-0004 IMP-005 known violation)
 */
function createPhaseService(): IPhaseService {
  const fs: IFileSystem = new NodeFileSystemAdapter();
  const yamlParser: IYamlParser = new YamlParserAdapter();
  const schemaValidator: ISchemaValidator = new SchemaValidatorAdapter();
  return new PhaseService(fs, yamlParser, schemaValidator);
}

/**
 * Registers the phase_prepare tool.
 *
 * Per ADR-0001: This tool prepares a phase for execution.
 * - IS idempotent: Can be called multiple times safely
 * - NOT read-only: Copies files, updates status
 * - NOT destructive: Doesn't delete existing data
 */
function registerPhasePrepareTool(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  const toolName = 'phase_prepare';
  const toolDescription =
    'Prepare a workflow phase for execution. Use this tool after composing a workflow to set up phase inputs and validate dependencies. Copies required files from prior phases and resolves parameter inputs. Returns preparation status with list of resolved inputs. If the phase is not found or prior phases are not finalized, returns an appropriate error.';

  // Per WF-01: Use Zod schema
  const inputSchema = {
    phase: z.string().describe('Name of the phase to prepare. Example: "gather"'),
    run_dir: z.string().describe('Path to the run directory created by wf_compose'),
  };

  server.registerTool(
    toolName,
    {
      description: toolDescription,
      inputSchema,
      annotations: {
        title: 'Prepare Workflow Phase',
        readOnlyHint: false, // Copies files, updates status
        destructiveHint: false, // Doesn't delete anything
        idempotentHint: true, // Safe to call multiple times
        openWorldHint: false, // Operates on local filesystem only
      },
    },
    async (args: { phase: string; run_dir: string }) => {
      logger.info('phase_prepare invoked', { args });

      const { phase, run_dir: runDir } = args;
      const phaseService = createPhaseService();

      // Call the service
      const result: PrepareResult = await phaseService.prepare(phase, runDir);

      // Format response using JsonOutputAdapter for consistency with CLI
      const outputAdapter = new JsonOutputAdapter();
      const formattedResponse = outputAdapter.format('phase.prepare', result);

      logger.info('phase_prepare completed', {
        success: result.errors.length === 0,
        phase,
        status: result.status,
      });

      return {
        content: [
          {
            type: 'text',
            text: formattedResponse,
          },
        ],
      };
    }
  );

  registry.set(toolName, { name: toolName, description: toolDescription });
  logger.debug('Registered tool', { toolName });
}

/**
 * Registers the phase_validate tool.
 *
 * Per ADR-0001: This tool validates phase inputs or outputs.
 * - IS idempotent: Read-only validation
 * - IS read-only: Only checks files, never modifies
 * - NOT destructive: Pure read operation
 */
function registerPhaseValidateTool(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  const toolName = 'phase_validate';
  const toolDescription =
    'Validate phase inputs or outputs against their schemas. Use this tool to verify phase readiness (inputs) or completion (outputs). Returns list of required files and their validation status. If files are missing or fail schema validation, returns errors with suggested actions.';

  // Per WF-01: Use Zod schema with enum constraint
  const inputSchema = {
    phase: z.string().describe('Name of the phase to validate. Example: "gather"'),
    run_dir: z.string().describe('Path to the run directory'),
    check: z
      .enum(['inputs', 'outputs'])
      .default('outputs')
      .describe('What to validate: "inputs" or "outputs". Defaults to "outputs"'),
  };

  server.registerTool(
    toolName,
    {
      description: toolDescription,
      inputSchema,
      annotations: {
        title: 'Validate Phase Files',
        readOnlyHint: true, // Pure read operation
        destructiveHint: false, // Never modifies anything
        idempotentHint: true, // Same inputs = same outputs
        openWorldHint: false, // Operates on local filesystem only
      },
    },
    async (args: { phase: string; run_dir: string; check?: 'inputs' | 'outputs' }) => {
      logger.info('phase_validate invoked', { args });

      const { phase, run_dir: runDir, check = 'outputs' } = args;
      const phaseService = createPhaseService();

      // Call the service
      const result: ValidateResult = await phaseService.validate(
        phase,
        runDir,
        check as ValidateCheckMode
      );

      // Format response using JsonOutputAdapter for consistency with CLI
      const outputAdapter = new JsonOutputAdapter();
      const formattedResponse = outputAdapter.format('phase.validate', result);

      logger.info('phase_validate completed', {
        success: result.errors.length === 0,
        phase,
        check,
        validatedCount: result.files.validated.length,
      });

      return {
        content: [
          {
            type: 'text',
            text: formattedResponse,
          },
        ],
      };
    }
  );

  registry.set(toolName, { name: toolName, description: toolDescription });
  logger.debug('Registered tool', { toolName });
}

/**
 * Registers the phase_finalize tool.
 *
 * Per ADR-0001: This tool finalizes a phase, extracting output parameters.
 * - IS idempotent: Re-extracts and overwrites (same inputs = same outputs)
 * - NOT read-only: Writes output-params.json, updates status
 * - NOT destructive: Overwrites only derived state
 */
function registerPhaseFinalizeTool(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  const toolName = 'phase_finalize';
  const toolDescription =
    'Finalize a workflow phase by extracting output parameters. Use this tool after phase work is complete to extract parameters from outputs and mark the phase as complete. The extracted parameters become available to subsequent phases. Returns the extracted parameters and phase status. If required outputs are missing, returns an error.';

  // Per WF-01: Use Zod schema
  const inputSchema = {
    phase: z.string().describe('Name of the phase to finalize. Example: "gather"'),
    run_dir: z.string().describe('Path to the run directory'),
  };

  server.registerTool(
    toolName,
    {
      description: toolDescription,
      inputSchema,
      annotations: {
        title: 'Finalize Workflow Phase',
        readOnlyHint: false, // Writes output-params.json
        destructiveHint: false, // Doesn't delete anything
        idempotentHint: true, // Re-extracts safely (per DYK-04)
        openWorldHint: false, // Operates on local filesystem only
      },
    },
    async (args: { phase: string; run_dir: string }) => {
      logger.info('phase_finalize invoked', { args });

      const { phase, run_dir: runDir } = args;
      const phaseService = createPhaseService();

      // Call the service
      const result: FinalizeResult = await phaseService.finalize(phase, runDir);

      // Format response using JsonOutputAdapter for consistency with CLI
      const outputAdapter = new JsonOutputAdapter();
      const formattedResponse = outputAdapter.format('phase.finalize', result);

      logger.info('phase_finalize completed', {
        success: result.errors.length === 0,
        phase,
        paramCount: Object.keys(result.extractedParams).length,
      });

      return {
        content: [
          {
            type: 'text',
            text: formattedResponse,
          },
        ],
      };
    }
  );

  registry.set(toolName, { name: toolName, description: toolDescription });
  logger.debug('Registered tool', { toolName });
}
