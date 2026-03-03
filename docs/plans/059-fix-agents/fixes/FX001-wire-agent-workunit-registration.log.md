# Fix FX001 — Execution Log

**Started**: 2026-03-03
**Status**: Complete

## FX001-1: POST route bridge.registerAgent()

**File modified**: `apps/web/app/api/agents/route.ts`
**What**: Added `POSITIONAL_GRAPH_DI_TOKENS` import, `AgentWorkUnitBridge` type import, and bridge.registerAgent() call after broadcastCreated(). Wrapped in try/catch for best-effort.

## FX001-2: DELETE route bridge.unregisterAgent()

**File modified**: `apps/web/app/api/agents/[id]/route.ts`
**What**: Same imports + bridge.unregisterAgent() after broadcastTerminated(). Wrapped in try/catch.

## FX001-3: Notifier broadcastStatus() → lazy bridge

**File modified**: `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts`
**What**: Added `mapAgentStatus()` function (working→working, stopped→idle, error→error). Constructor accepts optional `resolveBridge: () => AgentWorkUnitBridge | undefined`. broadcastStatus() calls bridge.updateAgentStatus() after SSE broadcast. Documented DYK-FX001-02 (no intent wiring) and DYK-FX001-03 (no register/unregister in notifier).

## FX001-4: DI factory passes lazy bridge resolver

**File modified**: `apps/web/src/lib/di-container.ts`
**What**: Updated notifier factory to pass a lazy bridge resolver using try/catch around `c.resolve()`. This avoids DI registration order issues (DYK-FX001-01). Test container NOT modified (DYK-FX001-05).
