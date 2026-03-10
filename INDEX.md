# Documentation Index — PR View & File Notes Features

## 📚 Complete Documentation Package

This project now includes comprehensive interface and contract documentation for implementing the **PR View** and **File Notes** features.

### Document Overview

| Document | Lines | Purpose | Audience |
|----------|-------|---------|----------|
| **INTERFACE_CONTRACTS.md** | 458 | Complete interface specifications (IC-01 through IC-11) | Developers, Architects |
| **INTERFACE_SUMMARY.md** | 240 | Quick reference, one-page summary | Everyone |
| **IMPLEMENTATION_PATTERNS.md** | 420 | 10 concrete runnable code patterns | Developers |
| **README_INTERFACE_DOCS.md** | 260 | Master guide and integration checklist | Project Leads |
| **VERIFICATION_CHECKLIST.md** | 280 | Coverage validation and quality metrics | QA, Architects |
| **INDEX.md** | This file | Navigation and overview | Everyone |

**Total:** ~1,918 lines of documentation

---

## 🎯 Quick Navigation

### For Implementing PR View
→ Start: **INTERFACE_SUMMARY.md** "For PR View Feature"  
→ Read: **INTERFACE_CONTRACTS.md** IC-03, IC-05, IC-09  
→ Code: **IMPLEMENTATION_PATTERNS.md** Patterns 1, 2, 3, 6, 7

### For Implementing File Notes
→ Start: **INTERFACE_SUMMARY.md** "For File Notes Feature"  
→ Read: **INTERFACE_CONTRACTS.md** IC-03, IC-04, IC-09  
→ Code: **IMPLEMENTATION_PATTERNS.md** Patterns 1, 2, 3, 5

### For Architecture Review
→ Overview: **README_INTERFACE_DOCS.md**  
→ Patterns: **INTERFACE_SUMMARY.md** Design Patterns section  
→ Details: **INTERFACE_CONTRACTS.md** all IC-## sections  
→ Verify: **VERIFICATION_CHECKLIST.md**

---

## 📋 Interfaces Documented

### Core Interfaces (8)

| IC | Interface | File | Methods |
|----|-----------|------|---------|
| **01** | **IFileSystem** | filesystem.interface.ts | 13 |
| **02** | **IPathResolver** | path-resolver.interface.ts | 7 |
| **03** | **IStateService** | state.interface.ts | 10 |
| **05** | **IGitDiffService** | diff.interface.ts | 1 |
| **06** | **ViewerFile** | viewer.interface.ts | 3 props |
| **07** | **IWorkUnitStateService** | work-unit-state.interface.ts | 7 |
| **08** | **IWorkflowEvents** | workflow-events.interface.ts | 9 |
| **10** | **IAgentManagerService** | agent-manager-service.interface.ts | 5-6 |

### SDK Facade (IC-04) — 4 Sub-Interfaces

| Sub-Interface | Methods | Purpose |
|---|---|---|
| **ICommandRegistry** | 4 | Commands (register, execute, list, isAvailable) |
| **ISDKSettings** | 7 | Settings (hydrate, contribute, get, set, reset, onChange) |
| **IContextKeyService** | 3 | Context keys (set, get, evaluate when-clauses) |
| **IKeybindingService** | 3 | Keybindings (register, getBindings, buildTinykeysMap) |

### Event System (IC-09) — 2 Interfaces

| Interface | Method | Purpose |
|---|---|---|
| **ICentralEventNotifier** | emit() | Domain-facing event API |
| **ISSEBroadcaster** | broadcast() | SSE transport layer |

### Instance/Wrapper (IC-11)

| Interface | Type | Purpose |
|---|---|---|
| **IAgentInstance** | Instance wrapper | Agent session management |

**Total: 15 interfaces**

---

## 🔑 Key Design Patterns

### 1. Adapter Pattern
**Examples:** IFileSystem, IAgentAdapter, IOutputAdapter  
**Contract:** Interface in shared/, implementation context-specific

### 2. Service Registry
**Examples:** IAgentManagerService, IWorkUnitStateService  
**Contract:** Single source of truth, optional persistence

### 3. Domain Events
**Examples:** ICentralEventNotifier, IWorkflowEvents  
**Contract:** Minimal payload, SSE transport, clients fetch full state via REST

### 4. Pub/Sub State Hierarchy
**Example:** IStateService  
**Contract:** domain:property (singleton) or domain:instanceId:property (multi-instance)

### 5. Error Handling
**Examples:** FileSystemError, PathSecurityError, ZodError  
**Contract:** Custom types with context, graceful degradation

### 6. Subscription Pattern
**All event APIs**  
**Contract:** Pattern matching, unsubscribe functions, isolated errors

---

## 📝 State Path Format

All state uses colon-delimited hierarchical paths:

```
Singleton (2 segments):
  domain:property

Multi-instance (3 segments):
  domain:instanceId:property

Examples:
  pr-view:worktree-main:reviewed      // PR View per-worktree
  file-notes:note-uuid-1:content      // File Notes per-note
  work-unit-state:agent-abc:status    // Work unit status
```

---

## ✅ Critical Contracts

### Filesystem & Paths
1. **Always use `IFileSystem`** — never `fs` direct (CD-04)
2. **Always use `IPathResolver.resolvePath()`** — prevents directory traversal (CD-11)

### State System
3. **Register domains at bootstrap** — single owner, fail-fast
4. **Store-first updates** — publish before notifying subscribers
5. **Unidirectional dispatch** — never call back to publishers

### Events
6. **Minimal payload** — IDs only per ADR-0007
7. **Clients fetch full state** — via REST, not SSE
8. **SSE transport** — ICentralEventNotifier → ISSEBroadcaster

### Services
9. **Graceful error handling** — SDK handlers wrapped in try/catch
10. **Same-instance guarantee** — agents with same sessionId return identical object

### Subscriptions
11. **Pattern matching** — exact, wildcard (`*`), domain-all (`**`)
12. **Isolated errors** — one failing subscriber doesn't block others
13. **Always unsubscribe** — return value from subscribe() calls

---

## 🚀 PR View Implementation Outline

**State Domain:**
```typescript
stateService.registerDomain({
  domain: 'pr-view',
  multiInstance: true,
  properties: [
    { key: 'diffs', description: '...', typeHint: 'DiffEntry[]' },
    { key: 'reviewed', description: '...', typeHint: 'string[]' },
    { key: 'comments', description: '...', typeHint: 'Comment[]' }
  ]
});
```

**State Paths:**
- `pr-view:{worktreeId}:diffs` — Active diffs
- `pr-view:{worktreeId}:reviewed` — Reviewed files
- `pr-view:{worktreeId}:comments` — Inline comments

**Events:**
- `emit('file-changes', 'pr-diff-reviewed', { worktreeId, filePath })`

**File Operations:**
- Use `IFileSystem` + `IPathResolver`

**Diff Fetching:**
- Use `IGitDiffService.getGitDiff()`

---

## 🗒️ File Notes Implementation Outline

**State Domain:**
```typescript
stateService.registerDomain({
  domain: 'file-notes',
  multiInstance: true,
  properties: [
    { key: 'content', description: '...', typeHint: 'string' },
    { key: 'links', description: '...', typeHint: 'Link[]' },
    { key: 'metadata', description: '...', typeHint: 'NoteMetadata' }
  ]
});
```

**State Paths:**
- `file-notes:{noteId}:content` — Note body
- `file-notes:{noteId}:links` — Link targets (file, workflow, agent)
- `file-notes:{noteId}:metadata` — Created/updated, author

**Events:**
- `emit('file-notes', 'note-created', { noteId, linked })`
- `emit('file-notes', 'note-updated', { noteId })`
- `emit('file-notes', 'note-deleted', { noteId })`

**CLI/SDK Commands:**
- `note.create`, `note.list`, `note.read`, `note.update`, `note.delete`

**Settings:**
- Use `IUSDK.settings` for display preferences

**Storage:**
- Use `IFileSystem` for persistent notes (JSON/YAML)

---

## 📂 File Locations

### Core Interfaces
- **All interfaces**: `/packages/shared/src/interfaces/`
- **State types**: `/packages/shared/src/state/`
- **Event domain**: `/packages/shared/src/features/027-central-notify-events/`
- **Agent system**: `/packages/shared/src/features/034-agentic-cli/` and `019-agent-manager-refactor/`

### Test Doubles
- **Fakes**: `/packages/shared/src/fakes/`
  - FakeFileSystem
  - FakeCentralEventNotifier
  - FakeStateService
  - FakeUSDK
  - etc.

### Implementations (Phase 2+)
- **Web adapters**: `/apps/web/src/lib/`
  - NodeFileSystemAdapter
  - PathResolverAdapter
  - StateService
  - etc.

---

## 🔍 Coverage Summary

| Aspect | Status | Details |
|--------|--------|---------|
| **Interfaces** | ✅ Complete | 15 total (8 core + 4 SDK sub + 2 event + 1 instance) |
| **Methods** | ✅ Complete | 50+ methods documented with signatures |
| **Patterns** | ✅ Complete | 10 runnable code examples |
| **PR View** | ✅ Complete | State, events, file ops, diff fetching |
| **File Notes** | ✅ Complete | State, events, SDK, storage, CLI |
| **Contracts** | ✅ Complete | 20+ critical contracts |
| **File Paths** | ✅ Verified | All 15+ interface locations verified |

---

## 📚 Reading Order

### For New Team Members
1. **README_INTERFACE_DOCS.md** — Overview and quick start
2. **INTERFACE_SUMMARY.md** — All interfaces at a glance
3. **IMPLEMENTATION_PATTERNS.md** → Pattern relevant to your task
4. **INTERFACE_CONTRACTS.md** → IC-## sections you need details on

### For Feature Implementation
1. **INTERFACE_SUMMARY.md** → "For PR View/File Notes Feature" section
2. **IMPLEMENTATION_PATTERNS.md** → Relevant patterns (1-7 for PR View, 1-5 for File Notes)
3. **INTERFACE_CONTRACTS.md** → Specific IC-## sections
4. **Actual code** → Test files and fake implementations in `/packages/shared/src/fakes/`

### For Architecture Review
1. **VERIFICATION_CHECKLIST.md** — Coverage analysis
2. **INTERFACE_SUMMARY.md** → Design Patterns table
3. **INTERFACE_CONTRACTS.md** → All IC-## sections (deep dive)
4. **README_INTERFACE_DOCS.md** → Integration guidance

---

## 🎓 Key Concepts

### Colon-Delimited State Paths
- Two segments: `domain:property` (singleton)
- Three segments: `domain:instanceId:property` (multi-instance)
- Pattern matching: exact, wildcard (`*`), domain-all (`**`), global (`*`)

### Minimal Event Payload (ADR-0007)
- Events carry only identifiers (e.g., `{ graphSlug: 'my-graph' }`)
- Clients fetch full state via REST, not SSE
- Reduces bandwidth and decouples state schema from transport

### Same-Instance Guarantee
- `IAgentManagerService.getWithSessionId()` returns same object reference
- Multiple consumers share cohesive state and event handlers
- Ensures session continuity across UI/CLI/orchestrator

### Store-First Semantics (PL-01)
- `IStateService.publish()` updates store BEFORE notifying subscribers
- Subscribers see consistent state
- Errors in one subscriber don't affect others (PL-07)

---

## 💡 Pro Tips

1. **Always test with fakes** — Use FakeFileSystem, FakeCentralEventNotifier, etc.
2. **Use secure paths** — Never construct paths with string concatenation
3. **Emit minimal events** — Clients should fetch full state via REST
4. **Subscribe with patterns** — `'file-notes:**'` matches all file-notes entries
5. **Register domains early** — At application bootstrap, before publishing
6. **Handle subscription errors** — Subscribers run in isolated try/catch
7. **Use unsubscribe functions** — Always return from subscribe() callbacks

---

## 📞 Reference Links

- **Plans**: Plan 027, 047, 053, 059, 061
- **ADRs**: ADR-0004 (DI tokens), ADR-0007 (minimal payload)
- **Critical Discoveries**: CD-04 (IFileSystem), CD-11 (path security)
- **Specs**: AC-01 through AC-24 (agent manager), DYK-01 through DYK-13 (impl notes)

---

## ✨ Summary

You now have **complete interface and contract documentation** for the PR View and File Notes features:

- **15 interfaces** fully documented
- **10 implementation patterns** with runnable code
- **PR View guidance** with state paths and events
- **File Notes guidance** with state paths, commands, and storage
- **Design patterns** across all interfaces
- **Critical contracts** for safe integration

Ready to start implementing! 🚀

