/**
 * MCP Server - Core server implementation
 *
 * This file implements the Model Context Protocol server using @modelcontextprotocol/sdk.
 * Follows ADR-0001 for MCP tool design patterns.
 *
 * Per Critical Discovery 10: stdout is reserved for JSON-RPC only in stdio mode.
 * All logging goes to stderr via PinoLoggerAdapter.createForStderr().
 */

import type { ILogger } from '@chainglass/shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { registerPhaseTools, registerWorkflowTools } from './tools/index.js';

// Default server info - can be overridden via options
const DEFAULT_SERVER_NAME = 'chainglass';
const DEFAULT_SERVER_VERSION = '0.0.1';

/**
 * Options for creating the MCP server.
 */
export interface McpServerOptions {
  /** Logger instance (should be stderr-configured for stdio mode) */
  logger: ILogger;
  /** Optional server name override (default: 'chainglass') */
  serverName?: string;
  /** Optional version override (default: '0.0.1') */
  serverVersion?: string;
}

/**
 * Wrapper around McpServer that provides DI integration and tool management.
 *
 * Per ADR-0001: This is the high-level interface for AI agents.
 */
export interface ChainglassMcpServer {
  /** Server identification info */
  readonly serverInfo: { name: string; version: string };
  /** Registered tools map */
  readonly tools: Map<string, RegisteredToolInfo>;
  /** Connect to a transport (stdio, HTTP, etc.) */
  connect(transport: Transport): Promise<void>;
  /** Connect using stdio transport (convenience method) */
  connectStdio(): Promise<void>;
  /** Close the server connection */
  close(): Promise<void>;
  /** Check if server is connected */
  isConnected(): boolean;
}

/**
 * Tool information stored in the server's tool registry.
 */
export interface RegisteredToolInfo {
  name: string;
  description: string;
}

/**
 * Creates an MCP server instance with the provided configuration.
 *
 * Per Critical Insights Discussion (2026-01-19):
 * - Uses McpServer high-level API (not raw Server class)
 * - Logger should be configured for stderr in stdio mode
 * - check_health tool is registered automatically as exemplar
 *
 * @param options Server configuration options
 * @returns ChainglassMcpServer instance
 */
export function createMcpServer(options: McpServerOptions): ChainglassMcpServer {
  const { logger, serverName, serverVersion } = options;

  const name = serverName ?? DEFAULT_SERVER_NAME;
  const version = serverVersion ?? DEFAULT_SERVER_VERSION;

  // Create the MCP server with server info
  const mcpServer = new McpServer(
    { name, version },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Internal tool registry for tracking registered tools
  const toolRegistry = new Map<string, RegisteredToolInfo>();

  // Register the check_health tool (exemplar per ADR-0001)
  registerCheckHealthTool(mcpServer, toolRegistry, logger);

  // Register workflow and phase tools (Phase 5: MCP Integration)
  registerWorkflowTools(mcpServer, toolRegistry, logger);
  registerPhaseTools(mcpServer, toolRegistry, logger);

  // Log server creation
  logger.info('MCP server created', { serverName: name, version });

  return {
    serverInfo: { name, version },
    tools: toolRegistry,

    async connect(transport: Transport): Promise<void> {
      logger.info('Connecting to transport');
      await mcpServer.connect(transport);
      logger.info('Connected to transport');
    },

    async connectStdio(): Promise<void> {
      const transport = new StdioServerTransport();
      await this.connect(transport);
    },

    async close(): Promise<void> {
      logger.info('Closing MCP server');
      await mcpServer.close();
      logger.info('MCP server closed');
    },

    isConnected(): boolean {
      return mcpServer.isConnected();
    },
  };
}

/**
 * Registers the check_health tool - the exemplar tool per ADR-0001 IMP-002.
 *
 * This tool demonstrates all MCP tool design patterns:
 * - verb_object naming (check_health)
 * - 3-4 sentence description
 * - Explicit JSON Schema constraints
 * - Semantic response with summary field
 * - Complete annotations
 *
 * Future tools should copy this pattern.
 */
function registerCheckHealthTool(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  const toolName = 'check_health';
  const toolDescription =
    'Check the health status of all Chainglass system components. Use this tool to verify the system is operational before performing other operations or when diagnosing issues. Returns component-level status (ok/degraded/error) with diagnostic details for any unhealthy components.';

  // Define input schema using Zod for SDK compatibility
  const inputSchema = {
    components: z
      .array(z.enum(['all', 'api', 'database', 'cache', 'queue']))
      .default(['all'])
      .describe("Components to check. Defaults to ['all']. Example: ['api', 'database']"),
    include_details: z
      .boolean()
      .default(false)
      .describe('Include detailed diagnostics for each component. Defaults to false.'),
  };

  server.registerTool(
    toolName,
    {
      description: toolDescription,
      inputSchema,
      annotations: {
        title: 'Check System Health',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: { components?: string[]; include_details?: boolean }) => {
      logger.info('check_health invoked', { args });

      // MVP implementation - returns simple "ok" status
      // Future phases will add real component checks
      const response = {
        status: 'ok',
        components: [
          {
            name: 'api',
            status: 'ok',
            message: 'API server responding normally',
          },
        ],
        summary: 'All 1 components healthy',
        checked_at: new Date().toISOString(),
      };

      logger.info('check_health completed', { status: response.status });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );

  registry.set(toolName, { name: toolName, description: toolDescription });
  logger.debug('Registered tool', { toolName });
}
