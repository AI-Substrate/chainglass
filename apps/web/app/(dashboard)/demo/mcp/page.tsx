/**
 * MCP Demo Page
 *
 * Demonstrates the Next.js 16 MCP (Model Context Protocol) integration.
 * Shows how AI agents can query application state via the /_next/mcp endpoint.
 */

'use client';

import { useState } from 'react';

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolInfo {
  name: string;
  description: string;
}

type McpTool = 'tools/list' | 'get_routes' | 'get_errors' | 'get_page_metadata' | 'get_project_metadata';

const MCP_TOOLS: { id: McpTool; label: string; description: string }[] = [
  { id: 'tools/list', label: 'List Tools', description: 'List all available MCP tools' },
  { id: 'get_routes', label: 'Get Routes', description: 'Get all application routes' },
  { id: 'get_errors', label: 'Get Errors', description: 'Get current build/runtime errors' },
  { id: 'get_page_metadata', label: 'Get Page Metadata', description: 'Get metadata for page components' },
  { id: 'get_project_metadata', label: 'Get Project Metadata', description: 'Get project configuration' },
];

export default function McpDemoPage() {
  const [selectedTool, setSelectedTool] = useState<McpTool>('tools/list');
  const [response, setResponse] = useState<McpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callMcp = async (tool: McpTool) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      let body: object;

      if (tool === 'tools/list') {
        body = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
        };
      } else {
        body = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: tool,
            arguments: {},
          },
        };
      }

      const res = await fetch('/_next/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatJson = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          MCP Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Next.js 16 Model Context Protocol integration. AI agents use this endpoint
          to query application state in real-time.
        </p>

        {/* Endpoint Info */}
        <div className="mb-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
            Endpoint
          </h2>
          <code className="text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
            POST /_next/mcp
          </code>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            JSON-RPC 2.0 protocol. Available when running <code className="text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">pnpm dev</code>.
          </p>
        </div>

        {/* Tool Selection */}
        <div className="mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
            Available Tools
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MCP_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => {
                  setSelectedTool(tool.id);
                  callMcp(tool.id);
                }}
                disabled={loading}
                className={`p-3 text-left rounded-lg border-2 transition-colors ${
                  selectedTool === tool.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {tool.label}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {tool.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Response Display */}
        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
            Response
          </h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden shadow-lg">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
              <span className="text-sm text-gray-400">
                {selectedTool}
              </span>
              {loading && (
                <span className="text-sm text-blue-400 animate-pulse">
                  Loading...
                </span>
              )}
            </div>
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto max-h-96 overflow-y-auto">
              {error ? (
                <span className="text-red-400">Error: {error}</span>
              ) : response ? (
                formatJson(response)
              ) : (
                <span className="text-gray-500">
                  Click a tool above to see the response
                </span>
              )}
            </pre>
          </div>
        </div>

        {/* How AI Agents Use This */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            How AI Agents Use MCP
          </h3>
          <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-sm">
            <li>
              <strong>Claude Code:</strong> Connects via <code className="text-xs bg-blue-100 dark:bg-blue-800 px-1 rounded">next-devtools</code> MCP server in <code className="text-xs bg-blue-100 dark:bg-blue-800 px-1 rounded">.mcp.json</code>
            </li>
            <li>
              <strong>Error Diagnosis:</strong> Agent calls <code className="text-xs bg-blue-100 dark:bg-blue-800 px-1 rounded">get_errors</code> to see build/runtime issues
            </li>
            <li>
              <strong>Route Validation:</strong> Agent calls <code className="text-xs bg-blue-100 dark:bg-blue-800 px-1 rounded">get_routes</code> to verify new routes exist
            </li>
            <li>
              <strong>Real-time State:</strong> MCP provides live app state, not static analysis
            </li>
          </ul>
        </div>

        {/* CLI Example */}
        <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            CLI Example
          </h3>
          <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
{`curl -X POST http://localhost:3000/_next/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}
