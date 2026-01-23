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

# Start development
just dev
```

This starts the Next.js development server at `http://localhost:3000`.

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

See [How-To Guides](docs/how/) for detailed documentation on extending these patterns.

## CLI Commands

After building (`just build`), the CLI is available:

| Command | Description |
|---------|-------------|
| `cg web` | Start production web server |
| `cg mcp --stdio` | Start MCP server (stdio transport) |
| `cg --help` | Show available commands |

To use the CLI globally during development:

```bash
npm link
cg --help
```

## Project Structure

```
chainglass/
├── apps/
│   ├── web/              # Next.js web application
│   └── cli/              # @chainglass/cli - Command-line interface
├── packages/
│   ├── shared/           # @chainglass/shared - Interfaces, fakes, utilities
│   └── mcp-server/       # @chainglass/mcp-server - MCP server
├── test/                 # Centralized test suite
│   ├── unit/             # Unit tests (by package)
│   ├── integration/      # Integration tests
│   └── contracts/        # Contract tests
└── docs/                 # Documentation
```

## Documentation

- [Architecture Rules](docs/rules/architecture.md) - Clean architecture patterns and guidelines
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
