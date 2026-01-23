# Implementation Discoveries: WF Basics - Workflow Fundamentals

**Generated**: 2026-01-23
**Source**: DYK Session Analysis, Phase Implementation Experience
**Purpose**: Implementation-focused insights for plan execution

---

## Discovery WF-01: MCP SDK Natively Supports Zod for inputSchema

**Category**: Schema Definition
**Impact**: High
**Phase**: 5 (MCP Integration)
**Date Discovered**: 2026-01-23

**What**: The MCP TypeScript SDK natively supports Zod schemas for `inputSchema` and `outputSchema` in `registerTool()`. The SDK internally converts Zod to JSON Schema via `zodToJsonSchema()`. Raw JSON Schema is NOT required.

**Evidence**:
- SDK type signature: `inputSchema?: InputArgs` where `InputArgs extends ZodRawShapeCompat | AnySchema`
- `ZodRawShapeCompat = Record<string, AnySchema>` (Zod v3 or v4)
- Official SDK examples use Zod exclusively
- SDK's `zod-compat.d.ts` provides cross-version support

**Current Pattern (works but not idiomatic)**:
```typescript
// check_health in server.ts - raw JSON Schema
inputSchema: {
  type: 'object',
  properties: {
    checks: { type: 'array', items: { type: 'string', enum: ['all', ...] } }
  }
}
```

**Recommended Pattern**:
```typescript
// Zod - SDK handles conversion
import { z } from 'zod';

inputSchema: {
  checks: z.array(z.enum(['all', 'config', 'filesystem', 'services']))
    .default(['all'])
    .describe('Health checks to run')
}
```

**Why It Matters**:
1. **Consistency** - Rest of codebase uses Zod for validation (YAML schemas, config)
2. **Type Safety** - Zod infers TypeScript types for handler parameters
3. **Descriptions** - `.describe()` provides LLM-friendly parameter documentation
4. **Validation** - Same schema validates input AND generates JSON Schema for protocol

**Action Required**:
- Phase 5 tools (`wf_compose`, `phase_prepare`, etc.) should use Zod for inputSchema
- Consider updating `check_health` exemplar to Zod pattern for consistency
- Import `z` from `zod` (SDK re-exports may have version compatibility)

**References**:
- MCP SDK README: https://github.com/modelcontextprotocol/typescript-sdk
- SDK zod-compat.d.ts: Supports Zod v3 and v4
- ADR-0001: MCP Tool Design Patterns (update candidate)

---

## Discovery WF-02: Output Adapter Pattern Applies to MCP

**Category**: Architecture
**Impact**: Medium
**Phase**: 5 (MCP Integration)
**Date Discovered**: 2026-01-23

**What**: The existing `IOutputAdapter` interface (Phase 1a) can be extended for MCP. Current implementations format for CLI (`JsonOutputAdapter` → JSON envelope, `ConsoleOutputAdapter` → human text). MCP requires a third adapter that formats for `content` blocks.

**Current Adapters**:
- `JsonOutputAdapter` → `{ success, command, timestamp, data }` envelope
- `ConsoleOutputAdapter` → Human-readable text with icons
- `FakeOutputAdapter` → Test assertions

**MCP Requirement**:
```typescript
// MCP tools return content array
return {
  content: [{ type: 'text', text: JSON.stringify(result) }]
};
```

**Open Question**: Should `McpOutputAdapter` produce the same envelope as `JsonOutputAdapter`, or a simpler format optimized for LLM consumption?

**Action Required**:
- Define whether MCP uses same envelope or different format
- Implement `McpOutputAdapter` if distinct format needed
- Alternatively, inline serialization may suffice for MVP

---

*Add new discoveries below as implementation progresses*
