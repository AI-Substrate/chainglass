# Chainglass

First-class enrichment workflow for spec-driven development.

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js 18+** - [Download](https://nodejs.org/)
- **pnpm** - Enable via corepack: `corepack enable && corepack prepare pnpm@latest --activate`
- **Just** - Task runner: `brew install just` or see [installation guide](https://github.com/casey/just#installation)

## Quick Start

```bash
# Clone and install
git clone <repository-url>
cd chainglass
just install

# Initialize a project (creates workflow templates and structure)
just build
cg init

# Start development
just dev
```

This starts the Next.js development server at `http://localhost:3000`.

## Authentication

Chainglass uses GitHub OAuth to control access. Only GitHub users listed in `.chainglass/auth.yaml` can sign in.

**Setup:**

1. **Create a GitHub OAuth App** at [github.com/settings/developers](https://github.com/settings/developers) with callback URL `http://localhost:3000/api/auth/callback/github`
2. **Configure credentials** — create `apps/web/.env.local`:
   ```bash
   AUTH_GITHUB_ID=your_client_id
   AUTH_GITHUB_SECRET=your_client_secret
   AUTH_SECRET=your_generated_secret_here
   ```
   Generate `AUTH_SECRET` by running `openssl rand -base64 32` in your terminal and pasting the output.
3. **Add allowed users** — edit `.chainglass/auth.yaml`:
   ```yaml
   allowed_users:
     - your-github-username
   ```

See [GitHub OAuth App Setup](docs/how/auth/github-oauth-setup.md) for the full walkthrough and troubleshooting.

## Common Commands

| Command | Description |
|---------|-------------|
| `just install` | Install all dependencies |
| `just dev` | Start development server (localhost:3000) |
| `just build` | Build all packages |
| `just test` | Run all tests |
| `just lint` | Run Biome linter |
| `just format` | Format code with Biome |
| `just fft` | Fix, format, and test (pre-commit workflow) |
| `just typecheck` | Run TypeScript type checking |
| `just check` | Full quality suite (lint + typecheck + test) |
| `just clean` | Clean build artifacts |
| `just reset` | Full reset (clean + install) |

## Dashboard Demo

The web application includes interactive demo pages showcasing the dashboard components:

### Features

- **Theme Toggle**: Click the sun/moon icon to switch between light and dark themes
- **Workflow Visualization**: Interactive graph showing CI/CD pipeline phases (`/workflow`)
- **Kanban Board**: Drag-and-drop task management with keyboard accessibility (`/kanban`)

### Running the Demo

```bash
# Start development server
just dev

# Open in browser
open http://localhost:3000
```

### Demo Pages

| Route | Description |
|-------|-------------|
| `/` | Home page with theme toggle |
| `/workflow` | ReactFlow workflow visualization with pan/zoom |
| `/kanban` | Kanban board with drag-drop between columns |

### Architecture Highlights

- **Headless Hooks**: Logic separated from UI for testability (`useBoardState`, `useFlowState`, `useSSE`)
- **Theme System**: CSS variables with next-themes for FOUC-free switching
- **Real-time Updates**: Server-Sent Events infrastructure for live data

### Harness Feedback Loop

Autonomous agents test the product and write structured retrospectives with "magic wand" suggestions. Those suggestions become fix tasks that ship in the same sprint — the product gets better every time an agent touches it. See [`harness/README.md`](harness/README.md) for the full philosophy.

See [How-To Guides](docs/how/) for detailed documentation on extending these patterns.

## CLI Commands

After building (`just build`), the CLI is available:

| Command | Description |
|---------|-------------|
| `cg web` | Start production web server |
| `cg mcp --stdio` | Start MCP server (stdio transport) |
| `cg init` | Initialize a Chainglass project with starter templates |
| `cg workflow list` | List all workflow templates |
| `cg workflow info <slug>` | Show workflow details and checkpoint history |
| `cg workflow checkpoint <slug>` | Create a versioned checkpoint from current/ |
| `cg workflow restore <slug> <version>` | Restore a checkpoint to current/ |
| `cg workflow versions <slug>` | List checkpoint versions for a workflow |
| `cg workflow compose <slug>` | Create a run from a checkpoint |
| `cg phase prepare <phase>` | Prepare phase inputs |
| `cg phase validate <phase>` | Validate phase outputs |
| `cg phase finalize <phase>` | Extract parameters and complete phase |
| `cg workspace add <name> <path>` | Register a folder as workspace |
| `cg workspace list` | List all registered workspaces |
| `cg workspace info <slug>` | Show workspace details + worktrees |
| `cg workspace remove <slug>` | Unregister workspace (--force required) |
| `cg sample add <name>` | Create sample in current workspace |
| `cg sample list` | List samples in current worktree |
| `cg sample info <slug>` | Show sample details |
| `cg sample delete <slug>` | Delete sample (--force required) |
| `cg agent run -t <type> -p <prompt>` | Run an agent with a prompt |
| `cg agent compact -t <type> -s <id>` | Compact an agent session |
| `cg --help` | Show available commands |

To use the CLI globally during development:

```bash
npm link
cg --help
```

### Workflow Commands

The workflow system enables multi-phase task execution with explicit input/output contracts and versioned template checkpoints.

```bash
# Initialize project with starter templates
cg init

# Manage workflow templates
cg workflow list                          # List available templates
cg workflow info hello-workflow           # Show details
cg workflow checkpoint hello-workflow     # Create a checkpoint from current/
cg workflow versions hello-workflow       # List checkpoint versions
cg workflow restore hello-workflow v001   # Restore a checkpoint to current/

# Create and execute workflow runs
cg workflow compose hello-workflow --json

# Execute a phase lifecycle
RUN_DIR=".chainglass/runs/hello-workflow/v001-abc123/run-2026-01-25-001"
cg phase prepare gather --run-dir $RUN_DIR --json
cg phase validate gather --run-dir $RUN_DIR --check outputs --json
cg phase finalize gather --run-dir $RUN_DIR --json
```

For detailed documentation, see [Workflows Guide](docs/how/workflows/1-overview.md) and [Workflow Management](docs/how/workflows/5-workflow-management.md).

### Template Commands

Save working graphs as reusable templates, create independent instances, and refresh units.

```bash
# Save a working graph as a template
cg template save-from my-graph --as my-template

# Browse templates
cg template list
cg template show my-template

# Create an independent instance
cg template instantiate my-template --id sprint-42

# List instances
cg template instances my-template

# Refresh instance units from template
cg template refresh my-template/sprint-42
```

For detailed documentation, see [Workflow Templates Guide](docs/how/workflow-templates.md).

## Project Structure

```
chainglass/
├── apps/
│   ├── web/              # Next.js web application
│   └── cli/              # @chainglass/cli - Command-line interface
├── packages/
│   ├── shared/           # @chainglass/shared - Interfaces, fakes, utilities
│   ├── workflow/         # @chainglass/workflow - Workflow execution engine
│   └── mcp-server/       # @chainglass/mcp-server - MCP server
├── test/                 # Centralized test suite
│   ├── unit/             # Unit tests (by package)
│   ├── integration/      # Integration tests
│   └── contracts/        # Contract tests
└── docs/                 # Documentation
```

## Agent System

The agent system provides a domain-agnostic wrapper around AI coding agents (Claude Code CLI, GitHub Copilot SDK). See [Agent System Guide](docs/how/agent-system/1-overview.md) for full documentation.

### Quick Start

```typescript
import { AgentManagerService, ClaudeCodeAdapter, UnixProcessManager, FakeLogger } from '@chainglass/shared';

// Create a manager with an adapter factory
const manager = new AgentManagerService(
  (type) => new ClaudeCodeAdapter(new UnixProcessManager(new FakeLogger()))
);

// New session
const instance = manager.getNew({ name: 'my-agent', type: 'claude-code', workspace: '.' });
instance.addEventHandler((event) => console.log(event.type, event.data));
await instance.run({ prompt: 'What is 2+2?' });
console.log(instance.sessionId); // ses-abc123

// Resume session
const resumed = manager.getWithSessionId(instance.sessionId, {
  name: 'resumed', type: 'claude-code', workspace: '.',
});
await resumed.run({ prompt: 'What did I ask before?' });
```

### CLI Usage

```bash
# New session
cg agent run -t claude-code -p "Write a hello world"

# Resume with session ID (from previous output)
cg agent run -t claude-code -s ses-abc123 -p "Add error handling"

# Compact session context
cg agent compact -t claude-code -s ses-abc123

# Stream events as NDJSON
cg agent run -t claude-code -p "Say hello" --stream
```

## Documentation

- [Agent System Guide](docs/how/agent-system/1-overview.md) - Agent lifecycle, event handling, session management
- [Workflows Guide](docs/how/workflows/1-overview.md) - Multi-phase workflow execution
- [Workflow Management](docs/how/workflows/5-workflow-management.md) - Template versioning and checkpoint workflow
- [Workspaces Guide](docs/how/workspaces/1-overview.md) - Multi-workspace management (local dev tool)
- [Configuration Guide](docs/how/configuration/1-overview.md) - Configuration system
- [Architecture Rules](docs/rules/architecture.md) - Clean architecture patterns and guidelines
- [Authentication Setup](docs/how/auth/github-oauth-setup.md) - GitHub OAuth configuration
- [ADR Index](docs/adr/README.md) - Architecture Decision Records
- [Theming Guide](docs/how/theming.md) - CSS variables and theme customization
- [Headless Components](docs/how/headless-components.md) - Hook-first TDD pattern
- [SSE Integration](docs/how/sse-integration.md) - Real-time event streaming

## Development Workflow

### Adding New Features

1. Read the [Architecture Rules](docs/rules/architecture.md)
2. Follow the interface-first design pattern
3. Write contract tests for new fakes
4. Use `just fft` before committing

### Running Tests

```bash
# Run all tests
just test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm vitest run test/unit/shared/fake-logger.test.ts
```

## License

Proprietary - All rights reserved.
