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
│   └── web/              # Next.js web application
├── packages/
│   ├── shared/           # @chainglass/shared - Interfaces, fakes, utilities
│   ├── cli/              # @chainglass/cli - Command-line interface
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
