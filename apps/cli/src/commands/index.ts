/**
 * CLI Command exports
 * Commands are registered with the Commander.js program
 */

export { registerWebCommand } from './web.command.js';
export { registerMcpCommand } from './mcp.command.js';
export { registerPhaseCommands } from './phase.command.js';
export { registerWorkflowCommands } from './workflow.command.js';
// WorkGraph commands (Phase 6: CLI Integration)
export { registerUnitCommands } from './unit.command.js';
export { registerWorkGraphCommands } from './workgraph.command.js';
