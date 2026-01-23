/**
 * MCP Tools exports
 *
 * Per ADR-0001: Tools are the primary interface for AI agents.
 * check_health is the exemplar tool that demonstrates all best practices.
 */

// Tool registration functions
export { registerWorkflowTools } from './workflow.tools.js';
export { registerPhaseTools } from './phase.tools.js';
