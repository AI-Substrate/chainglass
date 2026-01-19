/**
 * MCP Server Tests
 *
 * TDD: RED phase - These tests should fail until T003 implements the server.
 *
 * Per ADR-0001 and Critical Discovery 10: MCP server must maintain strict
 * stdout discipline - all logs to stderr in stdio mode.
 */

import { FakeLogger, LogLevel } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

// These imports will fail until T003 creates them
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - Module does not exist yet (TDD RED phase)
import {
  type ChainglassMcpServer,
  type McpServerOptions,
  createMcpServer,
} from '@chainglass/mcp-server';

describe('MCP Server', () => {
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
  });

  describe('createMcpServer', () => {
    it('should create server instance with logger', () => {
      /*
      Test Doc:
      - Why: MCP server is the core of Phase 5; must be instantiable with DI-provided logger
      - Contract: createMcpServer(options) returns a valid server instance with run() method
      - Usage Notes: Pass logger via options; server doesn't start until connect() called
      - Quality Contribution: Catches constructor errors, missing deps, validates factory pattern
      - Worked Example: createMcpServer({ logger }) returns object with connect(), close()
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server).toBeDefined();
      expect(typeof server.connect).toBe('function');
      expect(typeof server.close).toBe('function');
    });

    it('should return server info with correct name and version', () => {
      /*
      Test Doc:
      - Why: MCP protocol requires serverInfo for initialize handshake; agents use this for identification
      - Contract: Server has serverInfo property with name='chainglass' and valid version
      - Usage Notes: serverInfo is used during MCP initialize handshake to identify server
      - Quality Contribution: Catches missing or misconfigured server identity
      - Worked Example: server.serverInfo.name === 'chainglass', version matches package.json
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.serverInfo.name).toBe('chainglass');
      expect(server.serverInfo.version).toBeDefined();
      expect(typeof server.serverInfo.version).toBe('string');
    });

    it('should have check_health tool registered', () => {
      /*
      Test Doc:
      - Why: check_health is the exemplar tool per ADR-0001 IMP-002; must be available at creation
      - Contract: Server has tools property containing 'check_health' tool
      - Usage Notes: Tools are registered during server creation, not connect()
      - Quality Contribution: Catches missing tool registration or broken tool setup
      - Worked Example: server.tools includes entry with name='check_health'
      */
      const server = createMcpServer({ logger: fakeLogger });

      expect(server.tools).toBeDefined();
      expect(server.tools.has('check_health')).toBe(true);
    });

    it('should log server creation at info level', () => {
      /*
      Test Doc:
      - Why: Observability requires knowing when server is created; aids debugging startup issues
      - Contract: Creating server logs INFO message about server creation
      - Usage Notes: Log message should include server name for identification
      - Quality Contribution: Catches missing startup logging; ensures observability
      - Worked Example: After createMcpServer(), fakeLogger has INFO entry with 'chainglass'
      */
      createMcpServer({ logger: fakeLogger });

      const entries = fakeLogger.getEntriesByLevel(LogLevel.INFO);
      const creationLog = entries.find((e) => e.message.includes('MCP server'));

      expect(creationLog).toBeDefined();
    });
  });

  describe('server configuration', () => {
    it('should accept optional server name override', () => {
      /*
      Test Doc:
      - Why: Different deployments may want custom server names for identification
      - Contract: serverName option overrides default 'chainglass' name
      - Usage Notes: Optional; defaults to 'chainglass' if not provided
      - Quality Contribution: Catches hardcoded name that prevents customization
      - Worked Example: createMcpServer({ serverName: 'custom' }).serverInfo.name === 'custom'
      */
      const server = createMcpServer({
        logger: fakeLogger,
        serverName: 'custom-server',
      });

      expect(server.serverInfo.name).toBe('custom-server');
    });

    it('should accept optional version override', () => {
      /*
      Test Doc:
      - Why: Version may need to match deployment or differ from package.json
      - Contract: serverVersion option overrides default version
      - Usage Notes: Optional; defaults to package version if not provided
      - Quality Contribution: Catches hardcoded version that prevents customization
      - Worked Example: createMcpServer({ serverVersion: '2.0.0' }).serverInfo.version === '2.0.0'
      */
      const server = createMcpServer({
        logger: fakeLogger,
        serverVersion: '2.0.0',
      });

      expect(server.serverInfo.version).toBe('2.0.0');
    });
  });
});
