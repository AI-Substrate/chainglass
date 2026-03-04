# Level 2: Container Overview

> The deployable units that make up the Chainglass platform and how they relate.

```mermaid
C4Container
    title Container diagram — Chainglass Platform

    Person(dev, "Developer", "")
    Person(agent, "AI Agent", "")

    System_Boundary(cg, "Chainglass Platform") {
        Container(web, "Web Application", "Next.js 16, React 19", "Server Components + Client Components<br/>Workspace browser, file viewer,<br/>workflow editor, work unit editor")
        Container(cli, "CLI Tool", "Node.js, Commander.js", "Workflow execution, graph inspection,<br/>template management, agent orchestration")
        Container(mcp, "MCP Server", "Node.js, JSON-RPC", "Model Context Protocol endpoint<br/>for AI agent integration")
        Container(shared, "Shared Packages", "TypeScript", "Interfaces, types, fakes, adapters<br/>shared between all consumers")
    }

    System_Ext(git, "Git", "")
    System_Ext(fs, "Filesystem", "")

    Rel(dev, web, "Uses", "HTTPS :3000")
    Rel(dev, cli, "Runs", "Terminal")
    Rel(agent, cli, "Executes", "stdio")
    Rel(agent, mcp, "Queries", "MCP/JSON-RPC")
    Rel(web, shared, "Imports", "TypeScript")
    Rel(cli, shared, "Imports", "TypeScript")
    Rel(mcp, shared, "Imports", "TypeScript")
    Rel(web, fs, "Reads/Writes", "Node.js fs")
    Rel(cli, fs, "Reads/Writes", "Node.js fs")
    Rel(mcp, fs, "Reads", "Node.js fs")
    Rel(cli, git, "Uses", "git CLI")
    Rel(web, git, "Uses", "git CLI")
```

## Containers

| Container | Technology | Source | Zoom In |
|-----------|-----------|--------|---------|
| Web Application | Next.js 16, React 19, Tailwind v4 | `apps/web/` | [web-app.md](web-app.md) |
| CLI Tool | Node.js, Commander.js, esbuild | `apps/cli/` | [cli.md](cli.md) |
| MCP Server | Node.js, JSON-RPC, MCP SDK | `packages/mcp-server/` | — |
| Shared Packages | TypeScript | `packages/shared/` | [shared-packages.md](shared-packages.md) |

## Key Relationships

- **All containers** import from Shared Packages (no circular dependencies)
- **Web + CLI** both access the filesystem and Git
- **MCP Server** is the AI agent's primary integration point (JSON-RPC over stdio)
- **No container imports from another container** — only through Shared Packages

---

## Navigation

- **Zoom Out**: [System Context](../system-context.md)
- **Zoom In**: [Web App](web-app.md) | [CLI](cli.md) | [Shared Packages](shared-packages.md)
- **Hub**: [C4 Overview](../README.md)
