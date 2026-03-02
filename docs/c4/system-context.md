# Level 1: System Context

> The highest-level view of Chainglass — who uses it and what it connects to.

```mermaid
C4Context
    title System Context — Chainglass Platform

    Person(dev, "Developer", "Creates and manages<br/>agent workflows")
    Person(agent, "AI Agent", "Copilot CLI, Claude Code<br/>— operates on behalf of dev")

    Enterprise_Boundary(cg, "Chainglass Platform") {
        System(web, "Web Application", "Next.js 16 frontend<br/>Workspace browser, workflow editor,<br/>file viewer")
        System(cli, "CLI Tool", "Node.js CLI<br/>Workflow execution, graph inspection,<br/>agent orchestration")
        System(mcp, "MCP Server", "Model Context Protocol<br/>AI agent integration endpoint")
    }

    System_Ext(git, "Git", "Version control<br/>for workspace files")
    System_Ext(fs, "Local Filesystem", "Workspace directory<br/>containing project files")

    Rel(dev, web, "Browses workspaces,<br/>edits files, views workflows", "HTTPS")
    Rel(dev, cli, "Runs workflows,<br/>inspects graphs", "Terminal")
    Rel(agent, cli, "Executes commands<br/>on dev's behalf", "stdio")
    Rel(agent, mcp, "Queries tools,<br/>reads resources", "MCP/JSON-RPC")
    Rel(web, fs, "Reads/writes<br/>workspace files", "Node.js fs")
    Rel(cli, fs, "Reads workflow<br/>definitions", "Node.js fs")
    Rel(cli, git, "Commits changes,<br/>resolves worktrees", "git CLI")
    Rel(web, git, "Shows diffs,<br/>changed files", "git CLI")
    Rel(mcp, fs, "Reads workspace<br/>state", "Node.js fs")
```

## Key Elements

| Element | Type | Description |
|---------|------|-------------|
| Developer | Person | Human user who creates workflows, browses workspaces, and manages agents |
| AI Agent | Person | External AI tool (Copilot CLI, Claude Code) that executes workflow tasks |
| Web Application | System | Next.js 16 frontend — workspace browser, file viewer, workflow editor |
| CLI Tool | System | Node.js CLI (`cg`) — workflow execution, graph inspection, agent orchestration |
| MCP Server | System | Model Context Protocol server — AI agent integration via JSON-RPC |
| Git | External | Version control for all workspace files and workflow state |
| Local Filesystem | External | Workspace directory containing project files, workflow definitions, and state |

---

## Navigation

- **Zoom In**: [Container Overview](containers/overview.md) | [Web App](containers/web-app.md) | [CLI](containers/cli.md) | [MCP Server](containers/mcp-server.md) | [Shared Packages](containers/shared-packages.md)
- **Hub**: [C4 Overview](README.md)
