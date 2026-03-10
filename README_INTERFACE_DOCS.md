# Interface & Contract Documentation — PR View & File Notes

## Overview

This documentation package contains complete interface contracts needed for implementing PR View and File Notes features. It includes **11 core interfaces** with implementations, patterns, and concrete examples.

## Documents

### 1. **INTERFACE_CONTRACTS.md** (458 lines)
Complete interface specifications with:
- IC-01 through IC-11: Full interface signatures
- Method signatures with parameters and return types
- Error handling specifications
- Implementation details and contracts
- File paths and dependencies

**Key interfaces:**
- IC-01: `IFileSystem` — File operations
- IC-02: `IPathResolver` — Secure paths
- IC-03: `IStateService` — State management
- IC-04: `IUSDK` — SDK facade (4 sub-interfaces)
- IC-05: `IGitDiffService` — Diff provider
- IC-06: `ViewerFile` — File display
- IC-07: `IWorkUnitStateService` — Work unit registry
- IC-08: `IWorkflowEvents` — Intent-based workflow API
- IC-09: `ICentralEventNotifier` + `ISSEBroadcaster` — Event system
- IC-10: `IAgentManagerService` — Agent registry
- IC-11: `IAgentInstance` — Agent wrapper

### 2. **INTERFACE_SUMMARY.md** (Quick Reference)
One-page summary with:
- All 11 interfaces at a glance
- 4 design patterns with examples
- State path format and examples
- PR View specific guidance
- File Notes specific guidance
- Critical contracts checklist
- File locations to review

### 3. **IMPLEMENTATION_PATTERNS.md** (Concrete Examples)
10 runnable patterns demonstrating:
1. Registering a new state domain
2. Publishing state changes
3. Subscribing to state changes
4. Secure file operations
5. SDK command registration
6. PR View state management
7. Event-driven updates (React hooks)
8. Adapter pattern for testing
9. Same-instance guarantee
10. Service error handling

## Quick Start

### For PR View Implementation

**State Management:**
```typescript
stateService.registerDomain({
  domain: 'pr-view',
  multiInstance: true,
  properties: [
    { key: 'diffs', ... },
    { key: 'reviewed', ... },
    { key: 'comments', ... }
  ]
});

// Publish: pr-view:{worktreeId}:diffs, :reviewed, :comments
// Event: emit('file-changes', 'pr-diff-reviewed', { worktreeId, filePath })
```

**File Operations:**
- Use `IFileSystem` + `IPathResolver` for secure operations
- Use `IGitDiffService.getGitDiff()` for diff fetching

### For File Notes Implementation

**State Management:**
```typescript
stateService.registerDomain({
  domain: 'file-notes',
  multiInstance: true,
  properties: [
    { key: 'content', ... },
    { key: 'links', ... },
    { key: 'metadata', ... }
  ]
});

// Publish: file-notes:{noteId}:content, :links, :metadata
// Event: emit('file-notes', 'note-created', { noteId, linked })
```

**CLI/SDK:**
- Register commands: `note.create`, `note.list`, `note.read`, `note.update`, `note.delete`
- Use `IUSDK.settings` for display preferences
- Use `IFileSystem` for persistent storage (JSON/YAML)

## State Path Format

All state uses colon-delimited hierarchical paths:

```
domain:property                    // Singleton (2 segments)
domain:instanceId:property         // Multi-instance (3 segments)

Examples:
work-unit-state:agent-abc:status
pr-view:worktree-main:reviewed
file-notes:note-uuid:content
```

## Design Patterns

| Pattern | Key Interfaces | Key Contract |
|---------|---|---|
| **Adapter** | IFileSystem, IAgentAdapter | Interface in shared/, implementation context-specific |
| **Service Registry** | IAgentManagerService, IWorkUnitStateService | Single source of truth, optional persistence |
| **Domain Events** | ICentralEventNotifier, IWorkflowEvents | Minimal payload, SSE transport, REST fetch full state |
| **Pub/Sub State** | IStateService | Store-first, unidirectional, isolated errors |
| **Error Handling** | All interfaces | Custom error types, graceful degradation |
| **Subscription** | All event APIs | Pattern matching, unsubscribe functions |

## Critical Contracts

1. **Filesystem**: Always absolute paths, use `IFileSystem`, never `fs` direct
2. **Paths**: Use `resolvePath()` to prevent `../../../etc/passwd` traversal
3. **State**: Register domains at bootstrap, store-first, unidirectional
4. **Events**: Minimal payload (IDs only), clients fetch full state via REST
5. **Agents**: Same-instance guarantee for session continuity
6. **Services**: Graceful error handling, never crash consumer
7. **Subscriptions**: Isolated errors, unsubscribe functions
8. **SDK**: Global singleton, lazy persistence

## File Locations

**Interfaces:**
- `/packages/shared/src/interfaces/` — Core interface definitions
- `/packages/shared/src/state/` — State system types (ParsedPath, StateEntry, etc.)
- `/packages/shared/src/features/027-central-notify-events/` — Event domain
- `/packages/shared/src/features/034-agentic-cli/` — Agent manager/instance
- `/packages/shared/src/features/019-agent-manager-refactor/` — Alternative patterns

**Implementations:**
- `/packages/shared/src/fakes/` — Test doubles (FakeFileSystem, FakeCentralEventNotifier)
- `/apps/web/src/lib/` — Web-specific adapters and services (Phase 2+)

## Integration Checklist

- [ ] Import interfaces from `@chainglass/shared`
- [ ] Implement `IFileSystem` wrapper or use provided adapter
- [ ] Register state domain with `IStateService` at bootstrap
- [ ] Emit events via `ICentralEventNotifier`
- [ ] Subscribe to state changes with pattern matching
- [ ] Register SDK commands for CLI/web access
- [ ] Handle errors gracefully in command handlers
- [ ] Use fake implementations for testing
- [ ] Test with FakeFileSystem, FakeCentralEventNotifier, etc.
- [ ] Verify state path format (2 or 3 segments)
- [ ] Verify subscription patterns match registered domain/properties

## Example: Create a Note

```typescript
// 1. Register domain (bootstrap)
stateService.registerDomain({
  domain: 'file-notes',
  multiInstance: true,
  properties: [
    { key: 'content', description: 'Note body', typeHint: 'string' },
    { key: 'links', description: 'Links', typeHint: 'Link[]' }
  ]
});

// 2. Publish state
const noteId = 'note-' + Date.now();
stateService.publish(
  `file-notes:${noteId}:content`,
  'This is my note'
);
stateService.publish(
  `file-notes:${noteId}:links`,
  [{ type: 'file', target: 'src/app.ts' }]
);

// 3. Emit event
eventNotifier.emit('file-notes', 'note-created', {
  noteId,
  linked: true
});

// 4. Subscribe to changes
stateService.subscribe(
  'file-notes:**',
  (change) => {
    console.log(`Note ${change.instanceId} ${change.property} = ${change.value}`);
  }
);
```

## Related Plans & Specs

- **Plan 053**: GlobalStateSystem (IStateService)
- **Plan 027**: Central Domain Event Notification (ICentralEventNotifier)
- **Plan 061**: WorkflowEvents (IWorkflowEvents)
- **Plan 059**: WorkUnit State System (IWorkUnitStateService)
- **Plan 047**: USDK (IUSDK)
- **Plan 034**: Agentic CLI (IAgentManagerService)
- **Plan 019**: Agent Manager Refactor (IAgentInstance)
- **ADR-0004**: DI token resolution
- **ADR-0007**: Minimal event payload

## Contacts & References

- Source files: See file paths in each IC-## section
- Test files: `test/unit/` in respective packages
- Fake implementations: `packages/shared/src/fakes/`
- Real implementations: `apps/web/src/lib/` (Phase 2+)

---

**Total Interfaces Documented:** 11 core + 4 sub-interfaces (IUSDK) = **15 total**

**Last Updated:** 2025

