# Level 2 Detail: CLI Tool

> Internal structure of the Chainglass CLI (`cg`) — command groups organized by purpose.

```mermaid
C4Component
    title Component diagram — CLI Tool (apps/cli)

    Container_Boundary(cli, "CLI Tool (cg)") {

        Boundary(core, "Core Domain Commands") {
            Component(workflow, "Workflow", "Commander.js", "Compose, run, and manage<br/>workflow definitions")
            Component(phase, "Phase", "Commander.js", "Prepare, validate, finalize,<br/>accept, and handover phases")
            Component(template, "Template", "Commander.js", "List, create, and manage<br/>workflow templates")
            Component(unit, "Unit", "Commander.js", "Create and manage<br/>work units")
            Component(agent, "Agent", "Commander.js", "Start and manage<br/>agent pods")
            Component(posGraphCmd, "Positional Graph", "Commander.js", "Inspect and query<br/>graph topology")
        }

        Boundary(infraCmd, "Infrastructure Commands") {
            Component(init, "Init", "Commander.js", "Initialize workspace<br/>with workflow template")
            Component(webCmd, "Web", "Commander.js", "Start production<br/>web server")
            Component(mcpCmd, "MCP", "Commander.js", "Start MCP server<br/>for AI agents")
            Component(workspace, "Workspace", "Commander.js", "List and manage<br/>workspaces")
        }

        Boundary(util, "Utility Commands") {
            Component(message, "Message", "Commander.js", "Create, answer, list,<br/>read messages")
            Component(runs, "Runs", "Commander.js", "List and inspect<br/>workflow runs")
            Component(sample, "Sample", "Commander.js", "Run sample service<br/>for testing")
        }

        Boundary(legacy, "Legacy (Deprecated)") {
            Component(workgraph, "Workgraph", "Commander.js", "Legacy graph commands<br/>Successor: positional-graph")
        }
    }

    Container_Ext(shared, "Shared Packages", "")

    Rel(workflow, shared, "Uses", "IFileSystem, IWorkflowService")
    Rel(phase, shared, "Uses", "IFileSystem, Result types")
    Rel(template, shared, "Uses", "ITemplateService")
    Rel(posGraphCmd, shared, "Uses", "IPositionalGraphService")
    Rel(unit, shared, "Uses", "IWorkUnitService")
    Rel(agent, shared, "Uses", "IAgentAdapter")
```

## Command Groups

| Group | Commands | Purpose |
|-------|----------|---------|
| **Core** | workflow, phase, template, unit, agent, positional-graph | Domain-specific workflow operations |
| **Infrastructure** | init, web, mcp, workspace | Setup, servers, workspace management |
| **Utility** | message, runs, sample | Messaging, run inspection, testing |
| **Legacy** | workgraph | Deprecated — successor: positional-graph |

## Entry Point

`apps/cli/src/bin/cg.ts` — Creates Commander.js program, registers all command groups via `apps/cli/src/commands/index.ts`. Bundled with esbuild for distribution.

---

## Navigation

- **Zoom Out**: [Container Overview](overview.md) | [System Context](../system-context.md)
- **Hub**: [C4 Overview](../README.md)
