/**
 * @chainglass/mcp-server entry point
 *
 * Exports the MCP server factory and related types.
 * Per ADR-0001: This is the primary integration point for AI agents.
 */

export {
  createMcpServer,
  type McpServerOptions,
  type ChainglassMcpServer,
  type RegisteredToolInfo,
} from './server.js';

// Re-export lib utilities
export * from './lib/index.js';

// Tools will be exported here after implementation
export * from './tools/index.js';
