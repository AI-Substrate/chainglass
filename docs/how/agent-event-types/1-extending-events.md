# Extending Agent Event Types

This guide explains how to add new event types to the agent activity system.

## Overview

Agent events flow through three layers:
1. **Adapter Layer** (packages/shared) - Parses raw CLI/SDK output into events
2. **Storage Layer** (packages/shared) - Persists events as NDJSON
3. **UI Layer** (apps/web) - Transforms and renders events

Adding a new event type requires changes to all three layers.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Adapter Layer  │ ──► │  Storage Layer  │ ──► │    UI Layer     │
│                 │     │                 │     │                 │
│ ClaudeCodeAdapter   │     │ EventStorageService │     │ Transformer     │
│ SdkCopilotAdapter   │     │ events.ndjson │     │ LogEntry        │
│                 │     │                 │     │ ToolCallCard    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Step-by-Step Guide

### 1. Define the Schema (packages/shared)

Edit `packages/shared/src/schemas/agent-event.schema.ts`:

```typescript
// Add new event schema
export const AgentNewEventTypeSchema = AgentEventBaseSchema.extend({
  type: z.literal('new_event_type'),
  data: z.object({
    // Your event-specific fields
    myField: z.string(),
    optionalField: z.number().optional(),
  }),
});

// Export the type
export type AgentNewEventType = z.infer<typeof AgentNewEventTypeSchema>;

// Add to the union
export const AgentStoredEventSchema = z.discriminatedUnion('type', [
  AgentToolCallEventSchema,
  AgentToolResultEventSchema,
  AgentThinkingEventSchema,
  AgentNewEventTypeSchema, // Add here
]);
```

### 2. Update Adapter Parsing

#### For Claude Code (packages/shared/src/adapters/claude-code.adapter.ts)

```typescript
// In _translateClaudeToAgentEvents method
private _translateClaudeToAgentEvents(event: StreamEvent): AgentEvent[] {
  // ... existing cases ...

  // Handle your new event type
  if (event.type === 'content_block_start') {
    const block = event.content_block;
    if (block.type === 'new_block_type') {
      events.push({
        type: 'new_event_type',
        timestamp: new Date().toISOString(),
        data: {
          myField: block.field_name,
        },
      });
    }
  }

  return events;
}
```

#### For Copilot SDK (packages/shared/src/adapters/sdk-copilot-adapter.ts)

```typescript
// In _translateToAgentEvent method
private _translateToAgentEvent(event: CopilotEvent): AgentEvent | null {
  // ... existing cases ...

  // Handle your new event type
  if (event.type === 'copilot.new_event') {
    return {
      type: 'new_event_type',
      timestamp: new Date().toISOString(),
      data: {
        myField: event.content,
      },
    };
  }

  return null;
}
```

### 3. Add Contract Tests

Edit `test/contracts/agent-tool-events.contract.test.ts`:

```typescript
describe('new_event_type parity', () => {
  it('should emit matching shapes from both adapters', async () => {
    // Test that both adapters emit the same event shape
  });
});
```

### 4. Add FakeAgentAdapter Helper

Edit `packages/shared/src/fakes/fake-agent-adapter.ts`:

```typescript
/**
 * Emit a new_event_type event for testing.
 */
emitNewEventType(data: { myField: string }): void {
  this._emitEvent({
    type: 'new_event_type',
    timestamp: new Date().toISOString(),
    data,
  });
}
```

### 5. Create UI Component (apps/web)

Create `apps/web/src/components/agents/new-event-block.tsx`:

```typescript
export interface NewEventBlockProps {
  myField: string;
}

export function NewEventBlock({ myField }: NewEventBlockProps) {
  return (
    <div className="p-3 rounded border">
      <p>{myField}</p>
    </div>
  );
}
```

### 6. Update LogEntry Routing

Edit `apps/web/src/components/agents/log-entry.tsx`:

```typescript
// Add data interface
export interface NewEventData {
  myField: string;
}

// Add to props
export interface LogEntryProps {
  // ... existing props ...
  newEventData?: NewEventData;
}

// Add routing in component
if (effectiveContentType === 'new_event_type' && newEventData) {
  return (
    <div className={cn('px-4 py-2', className)}>
      <NewEventBlock myField={newEventData.myField} />
    </div>
  );
}
```

### 7. Update Transformer

Edit `apps/web/src/lib/transformers/stored-event-to-log-entry.ts`:

```typescript
case 'new_event_type': {
  return {
    ...baseProps,
    contentType: 'new_event_type',
    newEventData: {
      myField: event.data.myField,
    },
  };
}
```

### 8. Add Tests

Create tests for:
- Schema validation (`test/unit/schemas/`)
- UI component (`test/unit/components/`)
- Transformer (`test/unit/transformers/`)

## Testing Checklist

- [ ] Schema validates correct data shapes
- [ ] Schema rejects invalid data
- [ ] Claude adapter emits event from raw stream
- [ ] Copilot adapter emits event from SDK events
- [ ] Both adapters emit matching shapes (contract test)
- [ ] FakeAgentAdapter helper works
- [ ] Storage appends event correctly
- [ ] Storage retrieves event correctly
- [ ] Transformer converts to LogEntryProps
- [ ] LogEntry routes to correct component
- [ ] UI component renders correctly
- [ ] Integration test passes end-to-end

## Example: Adding `file_change` Event Type

Here's a complete example of adding a hypothetical `file_change` event:

1. **Schema**: Track when agent modifies files
2. **Adapter**: Parse from tool results that modify files
3. **UI**: Show file path with edit icon

See the `tool_call` / `tool_result` / `thinking` implementations for reference.

## Related Files

- `packages/shared/src/schemas/agent-event.schema.ts` - Event schemas
- `packages/shared/src/adapters/claude-code.adapter.ts` - Claude parsing
- `packages/shared/src/adapters/sdk-copilot-adapter.ts` - Copilot parsing
- `packages/shared/src/fakes/fake-agent-adapter.ts` - Test helpers
- `apps/web/src/lib/transformers/stored-event-to-log-entry.ts` - Transformer
- `apps/web/src/components/agents/log-entry.tsx` - Routing component
- `test/contracts/agent-tool-events.contract.test.ts` - Contract tests
