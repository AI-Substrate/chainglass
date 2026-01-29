/**
 * Plan 019: Agent Manager Refactor - Web Feature Barrel Export
 *
 * Re-exports all public implementations from the agent manager refactor
 * web-specific feature folder (real SSE broadcasting, adapters, etc.)
 *
 * Per PlanPak: plan-scoped files live in feature folders.
 */

// Real implementations
export { AgentNotifierService } from './agent-notifier.service.js';
export { SSEManagerBroadcaster } from './sse-manager-broadcaster.js';
