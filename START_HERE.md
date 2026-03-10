# START HERE — Complete Interface Documentation Ready

## What You Have

A complete **interface and contract documentation package** for PR View and File Notes features, containing:

- **6 comprehensive documents** (1,943 lines)
- **11 core interfaces** (IC-01 through IC-11) fully documented
- **4 SDK sub-interfaces** (Commands, Settings, Context, Keybindings)
- **10 implementation patterns** with runnable code
- **All critical contracts** explained and verified

## Quick Navigation

### 📖 For Everyone — Start with these:

1. **INDEX.md** — Master navigation guide (this file)
2. **README_INTERFACE_DOCS.md** — Overview and quick start
3. **INTERFACE_SUMMARY.md** — One-page reference card

### 🚀 For Implementing PR View:

1. **INTERFACE_SUMMARY.md** → Section "For PR View Feature"
2. **INTERFACE_CONTRACTS.md** → IC-03 (state), IC-05 (diff), IC-09 (events)
3. **IMPLEMENTATION_PATTERNS.md** → Patterns 1, 2, 3, 6, 7

### 🗒️ For Implementing File Notes:

1. **INTERFACE_SUMMARY.md** → Section "For File Notes Feature"
2. **INTERFACE_CONTRACTS.md** → IC-03 (state), IC-04 (SDK), IC-09 (events)
3. **IMPLEMENTATION_PATTERNS.md** → Patterns 1, 2, 3, 5

### 🏛️ For Architecture Review:

1. **README_INTERFACE_DOCS.md** → Master guide
2. **INTERFACE_SUMMARY.md** → Design Patterns section
3. **INTERFACE_CONTRACTS.md** → All IC-## sections
4. **VERIFICATION_CHECKLIST.md** → Coverage validation

## The 11 Interfaces At A Glance

| # | Interface | Purpose | Methods |
|---|-----------|---------|---------|
| IC-01 | **IFileSystem** | File operations | 13 |
| IC-02 | **IPathResolver** | Secure paths | 7 |
| IC-03 | **IStateService** | State system | 10 |
| IC-04 | **IUSDK** | SDK facade | 13 (4 subs) |
| IC-05 | **IGitDiffService** | Git diff | 1 |
| IC-06 | **ViewerFile** | File display | 3 props |
| IC-07 | **IWorkUnitStateService** | Work units | 7 |
| IC-08 | **IWorkflowEvents** | Workflow events | 9 (5+4) |
| IC-09 | **ICentralEventNotifier** + **ISSEBroadcaster** | Events | 2 |
| IC-10 | **IAgentManagerService** | Agent registry | 5-6 |
| IC-11 | **IAgentInstance** | Agent wrapper | 8 |

## Three Most Important Contracts

### 1️⃣ State Paths Are Hierarchical
```typescript
// Singleton: domain:property
'pr-view:mode'

// Multi-instance: domain:instanceId:property
'pr-view:worktree-main:reviewed'
'file-notes:note-uuid-1:content'
```

### 2️⃣ Events Carry Minimal Payload
```typescript
// Event payload is IDs only — clients fetch full state via REST
emit('file-changes', 'pr-diff-reviewed', { 
  worktreeId: 'main',
  filePath: 'src/app.ts' 
})
```

### 3️⃣ Use IFileSystem & IPathResolver
```typescript
// ✅ DO:
await fs.readFile(pathResolver.resolvePath(base, relative))

// ❌ DON'T:
await require('fs').readFile(path)  // Direct fs usage forbidden (CD-04)
const newPath = basePath + '/' + userInput  // Path traversal risk (CD-11)
```

## Documentation Files

```
📦 /Users/jordanknight/substrate/071-pr-view/

├── START_HERE.md ............................ You are here
├── INDEX.md ................................ Detailed navigation
├── README_INTERFACE_DOCS.md ................ Master guide
├── INTERFACE_SUMMARY.md ................... Quick reference (1-page)
├── INTERFACE_CONTRACTS.md ................. Full specs (IC-01 to IC-11)
├── IMPLEMENTATION_PATTERNS.md ............ 10 code examples
└── VERIFICATION_CHECKLIST.md ............. Coverage validation

Total: 1,943 lines of documentation
```

## Key Design Patterns

1. **Adapter Pattern** — IFileSystem, IAgentAdapter
2. **Service Registry** — IAgentManagerService, IWorkUnitStateService
3. **Domain Events** — ICentralEventNotifier, IWorkflowEvents
4. **Pub/Sub State** — IStateService with pattern matching
5. **Error Handling** — Custom error types with context
6. **Subscription** — Unsubscribe functions, isolated errors

## PR View At A Glance

**State Domain Setup:**
```typescript
stateService.registerDomain({
  domain: 'pr-view',
  multiInstance: true,
  properties: [
    { key: 'diffs', typeHint: 'DiffEntry[]' },
    { key: 'reviewed', typeHint: 'string[]' },
    { key: 'comments', typeHint: 'Comment[]' }
  ]
});
```

**State Paths:**
- `pr-view:{worktreeId}:diffs` — Active diffs
- `pr-view:{worktreeId}:reviewed` — Reviewed files
- `pr-view:{worktreeId}:comments` — Comments

**Events:**
- `emit('file-changes', 'pr-diff-reviewed', { worktreeId, filePath })`

**Implementation:** See IMPLEMENTATION_PATTERNS.md Pattern 6

## File Notes At A Glance

**State Domain Setup:**
```typescript
stateService.registerDomain({
  domain: 'file-notes',
  multiInstance: true,
  properties: [
    { key: 'content', typeHint: 'string' },
    { key: 'links', typeHint: 'Link[]' },
    { key: 'metadata', typeHint: 'NoteMetadata' }
  ]
});
```

**State Paths:**
- `file-notes:{noteId}:content` — Note body
- `file-notes:{noteId}:links` — Links (file, workflow, agent)
- `file-notes:{noteId}:metadata` — Created/updated/author

**Events:**
- `emit('file-notes', 'note-created', { noteId, linked })`
- `emit('file-notes', 'note-updated', { noteId })`

**CLI/SDK:** Register commands in IUSDK.commands
- `note.create`, `note.list`, `note.read`, `note.update`, `note.delete`

**Implementation:** See IMPLEMENTATION_PATTERNS.md Patterns 1-5

## Critical Files in Codebase

### Interfaces
- `/packages/shared/src/interfaces/filesystem.interface.ts`
- `/packages/shared/src/interfaces/path-resolver.interface.ts`
- `/packages/shared/src/interfaces/state.interface.ts`
- `/packages/shared/src/interfaces/sdk.interface.ts`
- `/packages/shared/src/interfaces/diff.interface.ts`
- `/packages/shared/src/interfaces/work-unit-state.interface.ts`
- `/packages/shared/src/interfaces/workflow-events.interface.ts`

### Event System
- `/packages/shared/src/features/027-central-notify-events/central-event-notifier.interface.ts`
- `/packages/shared/src/features/027-central-notify-events/workspace-domain.ts`

### Agent System
- `/packages/shared/src/features/034-agentic-cli/agent-manager-service.interface.ts`
- `/packages/shared/src/features/034-agentic-cli/agent-instance.interface.ts`

### State Types
- `/packages/shared/src/state/types.ts`

### Test Doubles
- `/packages/shared/src/fakes/` — FakeFileSystem, FakeCentralEventNotifier, etc.

## Next Steps

1. ✅ **Read** INTERFACE_SUMMARY.md (5 minutes)
2. ✅ **Read** Relevant IC-## sections from INTERFACE_CONTRACTS.md (10-20 minutes)
3. ✅ **Study** Relevant IMPLEMENTATION_PATTERNS.md patterns (10-15 minutes)
4. ✅ **Start coding** using interfaces and test doubles

## Pro Tips

- **Always test with fakes** — FakeFileSystem, FakeCentralEventNotifier, etc.
- **Use secure paths** — IPathResolver.resolvePath() prevents traversal
- **Emit minimal events** — Just IDs, clients fetch full state via REST
- **Subscribe with patterns** — `'domain:**'` matches all
- **Register early** — Domains at bootstrap, before publishing
- **Always unsubscribe** — Store return value from subscribe()

## Quality Assurance

✅ **15 interfaces** documented with full signatures  
✅ **50+ methods** with parameter and return types  
✅ **20+ critical contracts** enforced  
✅ **10 code patterns** with examples  
✅ **All file paths** verified in codebase  
✅ **All tasks completed** (8/8 ✓)  

## Questions?

See the specific documentation files above for detailed information:
- **Specific interface?** → INTERFACE_CONTRACTS.md
- **Quick overview?** → INTERFACE_SUMMARY.md
- **How to implement?** → IMPLEMENTATION_PATTERNS.md
- **Architecture details?** → README_INTERFACE_DOCS.md
- **Coverage proof?** → VERIFICATION_CHECKLIST.md

---

**Status:** ✅ COMPLETE AND READY FOR IMPLEMENTATION

Start with **INTERFACE_SUMMARY.md** next!
