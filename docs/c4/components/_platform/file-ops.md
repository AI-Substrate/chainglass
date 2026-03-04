# Component: File Operations (`_platform/file-ops`)

> **Domain Definition**: [_platform/file-ops/domain.md](../../../../domains/_platform/file-ops/domain.md)
> **Source**: `packages/shared/src/interfaces/` + `packages/shared/src/adapters/` + `packages/shared/src/fakes/`
> **Registry**: [registry.md](../../../../domains/registry.md) — Row: File Operations

Type-safe file system abstraction and path security for all services that touch disk. Provides async CRUD operations with traversal prevention, typed errors, and atomic writes. Every domain that reads or writes files goes through this contract.

```mermaid
C4Component
    title Component diagram — File Operations (_platform/file-ops)

    Container_Boundary(fileOps, "File Operations") {
        Component(iFS, "IFileSystem", "Interface", "Async file CRUD contract:<br/>readFile, writeFile, stat,<br/>listDirectory, exists, glob")
        Component(iPR, "IPathResolver", "Interface", "Secure path resolution<br/>with traversal prevention")
        Component(nodeFS, "NodeFileSystemAdapter", "Adapter", "Production implementation<br/>via Node.js fs/promises + fast-glob")
        Component(fakeFS, "FakeFileSystem", "Fake", "In-memory test double<br/>with assertion helpers")
        Component(pathAdapter, "PathResolverAdapter", "Adapter", "Production path resolver<br/>via Node.js path module")
        Component(fakePathRes, "FakePathResolver", "Fake", "Configurable test double<br/>for path resolution")
        Component(atomicWrite, "atomicWriteFile", "Utility", "Write to temp file + rename<br/>prevents partial writes")
        Component(fsError, "FileSystemError", "Error Type", "Typed errors with code<br/>+ path context")
        Component(pathSecError, "PathSecurityError", "Error Type", "Thrown on directory<br/>traversal attempts")
    }

    Rel(nodeFS, iFS, "Implements")
    Rel(fakeFS, iFS, "Implements")
    Rel(pathAdapter, iPR, "Implements")
    Rel(fakePathRes, iPR, "Implements")
    Rel(nodeFS, atomicWrite, "Uses for safe writes")
    Rel(nodeFS, fsError, "Throws")
    Rel(pathAdapter, pathSecError, "Throws on traversal")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| IFileSystem | Interface | Async file operations: readFile, writeFile, stat, listDirectory, exists, glob |
| IPathResolver | Interface | Resolves paths securely within workspace boundaries |
| NodeFileSystemAdapter | Adapter | Production fs via `fs/promises` + `fast-glob` |
| FakeFileSystem | Fake | In-memory filesystem with test assertion helpers |
| PathResolverAdapter | Adapter | Production path resolver via Node.js `path` |
| FakePathResolver | Fake | Configurable path resolver for unit tests |
| atomicWriteFile | Utility | Write to temp then rename — prevents partial/corrupt writes |
| FileSystemError | Error | Typed error with error code and path context |
| PathSecurityError | Error | Thrown when path traversal is attempted |

## External Dependencies

Depends on: Node.js `fs/promises`, `path`, `fast-glob` (npm).
Consumed by: viewer (Shiki reads files), file-browser, workspace-url, positional-graph, workflow services.

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md) | [Container Overview](../../containers/overview.md)
- **Domain**: [_platform/file-ops/domain.md](../../../../domains/_platform/file-ops/domain.md)
- **Hub**: [C4 Overview](../../README.md)
