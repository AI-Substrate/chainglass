# Domain: File Operations

**Slug**: _platform/file-ops
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from existing codebase (pre-Plan 041)
**Status**: active

## Purpose

Type-safe file system abstraction and path security for all services that touch disk. Provides `IFileSystem` for CRUD operations and `IPathResolver` for directory-traversal prevention. Every service in the system depends on this domain — no code reads or writes files without going through these contracts.

## Boundary

### Owns
- File system abstraction (IFileSystem interface + NodeFileSystemAdapter)
- Path security validation (IPathResolver interface + PathResolverAdapter + PathSecurityError)
- In-memory test fakes (FakeFileSystem, FakePathResolver)
- Contract tests ensuring fake/real parity
- Atomic write utilities (tmp+rename pattern)
- DI token registration for file system + path resolver

### Does NOT Own
- Git commands or worktree resolution — separate concern (`packages/workflow` resolvers)
- Server actions that USE file operations — those belong to their consuming domain (e.g., file-browser)
- Workspace-specific file logic (workspace registry adapter uses IFileSystem but owns its own write patterns)
- File viewer rendering — that's `_platform/viewer`

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IFileSystem` | Interface | workflow, workgraph, positional-graph, web actions, file-browser | Async file CRUD: exists, readFile, writeFile, readDir, stat, rename, mkdir, glob, etc. |
| `IPathResolver` | Interface | git-diff-action, file-browser actions, init service | `resolvePath(base, relative)` with traversal prevention |
| `PathSecurityError` | Error class | Consumers of IPathResolver | Thrown when path escapes base directory |
| `FileSystemError` | Error class | All IFileSystem consumers | Typed error with code + path context |
| `FakeFileSystem` | Test fake | All test suites | In-memory IFileSystem with `setFile()`, `simulateError()` helpers |
| `FakePathResolver` | Test fake | All test suites | Configurable security, path mappings, call tracking |
| `SHARED_DI_TOKENS.FILESYSTEM` | DI token | DI container | Resolves to NodeFileSystemAdapter (prod) or FakeFileSystem (test) |
| `SHARED_DI_TOKENS.PATH_RESOLVER` | DI token | DI container | Resolves to PathResolverAdapter or FakePathResolver |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `IFileSystem` | Contract definition | Nothing |
| `NodeFileSystemAdapter` | Production implementation | Node.js `fs/promises`, `fast-glob` |
| `FakeFileSystem` | In-memory test double | Nothing (self-contained Map) |
| `IPathResolver` | Contract definition | Nothing |
| `PathResolverAdapter` | Production implementation | Node.js `path` module |
| `FakePathResolver` | Configurable test double | Nothing |
| `atomicWriteFile()` | Write utility (tmp+rename) | IFileSystem (or direct fs) |

## Source Location

Primary: `packages/shared/src/`

| File | Role | Notes |
|------|------|-------|
| `packages/shared/src/interfaces/filesystem.interface.ts` | IFileSystem + FileSystemError | Core contract |
| `packages/shared/src/interfaces/path-resolver.interface.ts` | IPathResolver + PathSecurityError | Security contract |
| `packages/shared/src/adapters/node-filesystem.adapter.ts` | NodeFileSystemAdapter | Production impl |
| `packages/shared/src/adapters/path-resolver.adapter.ts` | PathResolverAdapter | Production impl |
| `packages/shared/src/fakes/fake-filesystem.ts` | FakeFileSystem | Test double |
| `packages/shared/src/fakes/fake-path-resolver.ts` | FakePathResolver | Test double |
| `packages/workgraph/src/services/atomic-file.ts` | atomicWriteFile() | Utility (also in positional-graph) |
| `test/contracts/filesystem.contract.ts` | Contract tests | Ensures fake/real parity |

## Dependencies

### This Domain Depends On
- Node.js `fs/promises` (runtime)
- Node.js `path` (runtime)
- `fast-glob` (npm package for glob patterns)

### Domains That Depend On This
- `file-browser` — readFile/saveFile actions use IFileSystem + IPathResolver
- `_platform/viewer` — Shiki processor reads files server-side
- `_platform/workspace-url` — indirectly (workspace registry uses IFileSystem)
- Every workflow/workgraph service that touches disk

## History

| Plan | What Changed | Date |
|------|-------------|------|
| *(extracted)* | Domain extracted. Contracts stable since Plan 006. | 2026-02-24 |
| Plan 041 Phase 4 | Adding `realpath()` to IFileSystem for symlink escape detection (DYK-P4-02) | 2026-02-24 |
