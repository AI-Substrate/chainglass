/**
 * Workflow MCP Tools
 *
 * Per Phase 5: MCP Integration - Implements wf_compose tool.
 * Per ADR-0001: Follows check_health exemplar pattern.
 * Per WF-01: Uses Zod for inputSchema (SDK natively supports it).
 */

import type { ILogger } from '@chainglass/shared';
import {
  type ComposeResult,
  HashGeneratorAdapter,
  type IFileSystem,
  type IHashGenerator,
  type IPathResolver,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
  PathResolverAdapter,
} from '@chainglass/shared';
import {
  type ISchemaValidator,
  type IWorkflowRegistry,
  type IWorkflowService,
  type IYamlParser,
  SchemaValidatorAdapter,
  WorkflowRegistryService,
  WorkflowService,
  YamlParserAdapter,
} from '@chainglass/workflow';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegisteredToolInfo } from '../server.js';

/**
 * Registers the wf_compose tool on the MCP server.
 *
 * Per ADR-0001: This tool creates a new workflow run from a template.
 * - NOT idempotent: Each call creates a new run folder
 * - NOT read-only: Creates files/folders
 * - NOT destructive: Doesn't delete existing data
 */
export function registerWorkflowTools(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  registerWfComposeTool(server, registry, logger);
}

/**
 * Registers the wf_compose tool.
 *
 * Per ADR-0001 IMP-002: Follows check_health exemplar pattern.
 */
function registerWfComposeTool(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  const toolName = 'wf_compose';
  const toolDescription =
    'Create a new workflow run from a template. Use this tool to initialize a workflow execution that agents can then operate phase-by-phase. Returns the created run directory path, template name, and ordered list of phases. If the template is not found, returns an E030 error with suggestions for template locations.';

  // Per WF-01: Use Zod schema - SDK handles conversion to JSON Schema
  const inputSchema = {
    template_slug: z
      .string()
      .describe(
        'Template slug (name) or path to template directory. Examples: "hello-workflow", "./templates/my-template"'
      ),
    runs_dir: z
      .string()
      .optional()
      .default('.chainglass/runs')
      .describe('Directory where run folders are created. Defaults to ".chainglass/runs"'),
  };

  server.registerTool(
    toolName,
    {
      description: toolDescription,
      inputSchema,
      annotations: {
        title: 'Create Workflow Run',
        readOnlyHint: false, // Creates files
        destructiveHint: false, // Doesn't delete anything
        idempotentHint: false, // Each call creates NEW run folder
        openWorldHint: false, // Operates on local filesystem only
      },
    },
    async (args: { template_slug: string; runs_dir?: string }) => {
      logger.info('wf_compose invoked', { args });

      const templateSlug = args.template_slug;
      const runsDir = args.runs_dir ?? '.chainglass/runs';

      // Create service dependencies
      // TODO: Wire through DI container (per ADR-0004 IMP-005 known violation)
      const fs: IFileSystem = new NodeFileSystemAdapter();
      const yamlParser: IYamlParser = new YamlParserAdapter();
      const schemaValidator: ISchemaValidator = new SchemaValidatorAdapter();
      const pathResolver: IPathResolver = new PathResolverAdapter();
      const hashGenerator: IHashGenerator = new HashGeneratorAdapter();
      const workflowRegistry: IWorkflowRegistry = new WorkflowRegistryService(
        fs,
        pathResolver,
        yamlParser,
        hashGenerator
      );
      const workflowService: IWorkflowService = new WorkflowService(
        fs,
        yamlParser,
        schemaValidator,
        pathResolver,
        workflowRegistry
      );

      // Call the service
      const result: ComposeResult = await workflowService.compose(templateSlug, runsDir);

      // Format response using JsonOutputAdapter for consistency with CLI
      const outputAdapter = new JsonOutputAdapter();
      const formattedResponse = outputAdapter.format('wf.compose', result);

      logger.info('wf_compose completed', {
        success: result.errors.length === 0,
        runDir: result.runDir,
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
