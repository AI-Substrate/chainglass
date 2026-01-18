# Research Dossier: Chainglass Clean Architecture Setup

**Generated**: 2026-01-18
**Research Query**: Establish patterns for clean architecture for a Next.js project called "Chainglass"
**Mode**: Plan-Associated
**Plan Folder**: `docs/plans/001-project-setup`
**FlowSpace**: Not Available (fresh project)

---

## Executive Summary

### What We're Building

Chainglass is a Next.js application implementing clean architecture patterns with:
- TypeScript backend with full dependency injection
- React frontend using App Router
- CLI tool (`cg`) for commands
- MCP server exposed via `cg mcp`
- Justfile for command orchestration

### Key Decisions

| Topic | Recommendation | Rationale |
|-------|----------------|-----------|
| **CLI Name** | `cg` ✅ SAFE | No conflicts on any major OS/package manager |
| **CLI Parser** | **Commander.js** | Zero dependencies, fast npx, simple API, industry standard |
| **Package Structure** | **pnpm + Turborepo** | 50-70% disk savings, intelligent caching, parallel builds |
| **DI Container** | **TSyringe** (Microsoft) | Lightweight, tree-shakeable, decorator-optional, Next.js compatible |
| **Test Framework** | **Vitest** | 10x faster than Jest, native TS, intelligent watch mode, fakes-friendly |
| **Linter/Formatter** | **Biome** | 20x faster, unified linting+formatting, simpler config |
| **Logger** | Custom with Pino adapter | Interface-first, supports fakes for testing |
| **Task Runner** | **Just** | Modern, fast, cross-platform, declarative |

### Quick Stats

- **Project Type**: Greenfield Next.js 15 with App Router
- **Architecture**: Clean Architecture with Services + Adapters
- **Test Strategy**: TDD with fakes over mocks
- **Build Tools**: Vite-based toolchain for speed

---

## Finding CLI-01: CLI Command Name Validation

### `cg` is Safe to Use

**Comprehensive verification confirms `cg` is NOT used by any major tool:**

| Platform/Manager | Status | Notes |
|-----------------|--------|-------|
| macOS (Homebrew) | ✅ Safe | No package named `cg` |
| Linux (apt, yum, dnf, pacman) | ✅ Safe | Only `cg*` prefixed tools (cgcreate, cgexec for cgroups) |
| Windows (Chocolatey, Scoop, Winget) | ✅ Safe | No conflicts |
| Common CLI tools | ✅ Safe | NVIDIA uses `cgc`, not `cg` |

**Verification Commands:**
```bash
# macOS
which cg  # Returns nothing
brew search cg  # No exact match

# Linux
which cg  # Returns nothing
# Note: cgcreate, cgexec exist for cgroups but are distinct commands

# Windows
where cg  # Returns nothing
```

**Recommendation**: Proceed with `cg` as the CLI command name.

---

## Finding CP-01: CLI Parser Selection

### Commander.js Recommended

**Comparison Matrix:**

| Framework | Bundle Size | Dependencies | TypeScript | Subcommands | Maintenance |
|-----------|-------------|--------------|------------|-------------|-------------|
| **Commander.js** ⭐ | 38KB | 0 | Native (v12+) | Excellent | Active (tj/commander) |
| Clipanion | 24KB | 0 | Native | Excellent | Yarn team |
| citty | ~6KB | 0 | Native | Good | UnJS ecosystem |
| oclif | Heavy | Many | Good | Excellent | Salesforce |
| yargs | 105KB | 2 | @types needed | Good | Active |
| meow | 27KB | 1 | @types needed | Manual | Active |

### Why Commander.js

1. **Zero dependencies**: No supply chain risk, minimal attack surface
2. **Fast npx execution**: Critical for CLI tools distributed via npx
3. **TypeScript native**: Full type support in v12+ without additional packages
4. **Industry standard**: Most popular CLI parser (75k+ GitHub stars)
5. **Subcommand support**: Built-in `.command()` API perfect for `cg mcp` pattern
6. **Simple API**: Low learning curve, readable command definitions
7. **Auto-help generation**: `--help` comes free with good formatting

### Implementation for Chainglass CLI

```typescript
// cli/src/bin/cg.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../../package.json';

const program = new Command();

program
  .name('cg')
  .description('Chainglass CLI - Clean architecture tooling')
  .version(version);

// MCP server command
program
  .command('mcp')
  .description('Start the MCP (Model Context Protocol) server')
  .option('-p, --port <port>', 'Port to listen on', '3001')
  .option('--stdio', 'Use stdio transport instead of HTTP')
  .action(async (options) => {
    const { startMcpServer } = await import('../commands/mcp.command');
    await startMcpServer(options);
  });

// Dev command
program
  .command('dev')
  .description('Start development server')
  .action(async () => {
    const { execSync } = await import('child_process');
    execSync('next dev', { stdio: 'inherit' });
  });

// Parse and execute
program.parse();
```

### Package Configuration

```json
// cli/package.json
{
  "name": "@chainglass/cli",
  "version": "0.1.0",
  "bin": {
    "cg": "./dist/bin/cg.js"
  },
  "dependencies": {
    "commander": "^12.1.0"
  }
}
```

### Alternative: Clipanion

If the team prefers maximum type safety with a declarative class-based approach:

```typescript
import { Command, Option } from 'clipanion';

class McpCommand extends Command {
  static paths = [['mcp']];
  port = Option.String('-p,--port', '3001');

  async execute() {
    // Type-safe access to this.port
  }
}
```

**When to use Clipanion:**
- Complex CLI with many nested subcommands
- Need for strict TypeScript validation
- Building Yarn-like sophisticated tooling

**Stick with Commander.js when:**
- Building straightforward CLIs like Chainglass
- Want the most ecosystem support/documentation
- Need fast npx startup times

---

## Finding PD-01: Package Distribution & npx Setup

### pnpm Workspaces + Turborepo Recommended

For a multi-entry-point package (CLI, MCP server, Next.js app) runnable via npx, the recommended 2024-2025 approach is **pnpm workspaces for dependency management** combined with **Turborepo for build orchestration**.

**Comparison Matrix:**

| Tool | Disk Efficiency | Speed | Task Orchestration | Caching | Complexity |
|------|-----------------|-------|-------------------|---------|------------|
| **pnpm + Turborepo** ⭐ | 50-70% smaller | Excellent | Built-in | Intelligent | Medium |
| npm workspaces | Baseline | Good | Manual | None | Low |
| pnpm alone | 50-70% smaller | Excellent | Manual | None | Low |
| Nx | Good | Excellent | Built-in | Intelligent | High |

### Why pnpm + Turborepo

1. **pnpm benefits**:
   - Content-addressable storage: each dependency version stored once on disk
   - Hard links create virtual node_modules (50-70% disk savings)
   - Strict dependency resolution prevents "phantom dependencies"
   - workspace:* protocol for local package linking

2. **Turborepo benefits**:
   - Understands package dependency graph
   - Parallel execution of independent tasks
   - Intelligent caching (70-80% faster CI builds)
   - Incremental builds - only rebuild what changed

### Project Structure for Chainglass

```
chainglass/
├── packages/
│   ├── cli/                          # CLI entry point
│   │   ├── src/
│   │   │   ├── bin/
│   │   │   │   └── cg.ts            # #!/usr/bin/env node entry
│   │   │   ├── commands/
│   │   │   │   ├── mcp.ts
│   │   │   │   ├── dev.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── shared/                       # Shared types & utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mcp-server/                   # MCP server implementation
│       ├── src/
│       │   ├── server.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── web/                          # Next.js application
│       ├── src/
│       │   ├── app/
│       │   ├── services/
│       │   └── adapters/
│       ├── next.config.js
│       ├── package.json
│       └── tsconfig.json
│
├── pnpm-workspace.yaml               # Workspace definition
├── turbo.json                        # Build orchestration
├── package.json                      # Root package with bin exports
└── tsconfig.json                     # Base TypeScript config
```

### Root package.json Configuration

```json
{
  "name": "chainglass",
  "version": "0.1.0",
  "description": "First class enrichment workflow for spec driven development",
  "bin": {
    "cg": "./dist/cli.js",
    "chainglass": "./dist/cli.js"
  },
  "type": "module",
  "exports": {
    ".": {
      "types": "./packages/shared/dist/index.d.ts",
      "default": "./packages/shared/dist/index.js"
    },
    "./server": {
      "types": "./packages/mcp-server/dist/index.d.ts",
      "default": "./packages/mcp-server/dist/index.js"
    }
  },
  "files": [
    "dist",
    "packages/*/dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint",
    "format": "turbo format"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

### pnpm Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### Turborepo Configuration

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": [],
      "cache": true
    },
    "lint": {
      "outputs": [],
      "cache": true
    },
    "format": {
      "outputs": [],
      "cache": false
    }
  }
}
```

### CLI Package Configuration

```json
// packages/cli/package.json
{
  "name": "@chainglass/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "esbuild src/bin/cg.ts --bundle --minify --platform=node --target=node18 --outfile=../../dist/cli.js --banner:js='#!/usr/bin/env node'",
    "dev": "esbuild src/bin/cg.ts --bundle --platform=node --outfile=../../dist/cli.js --watch"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "@chainglass/shared": "workspace:*"
  },
  "devDependencies": {
    "esbuild": "^0.20.0",
    "typescript": "^5.0.0"
  }
}
```

### Shared Package Configuration

```json
// packages/shared/package.json
{
  "name": "@chainglass/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Fast npx Startup Optimization

Key strategies for fast `npx cg` execution:

1. **Bundle CLI with esbuild**: Single file, no module resolution at runtime
   ```bash
   esbuild src/bin/cg.ts --bundle --minify --platform=node --outfile=dist/cli.js
   ```

2. **Lazy-load commands**: Import heavy dependencies only when needed
   ```typescript
   program
     .command('mcp')
     .action(async () => {
       // Only load MCP server code when this command runs
       const { startMcpServer } = await import('@chainglass/mcp-server');
       await startMcpServer();
     });
   ```

3. **Shebang in bundled output**: `--banner:js='#!/usr/bin/env node'`
   - Avoids npm wrapper script overhead

4. **Minimize root dependencies**: CLI package only needs commander + shared
   - Next.js, Pino, etc. loaded lazily per command

### Testing Locally Before Publishing

```bash
# Link package globally for testing
pnpm build
npm link

# Test commands anywhere
cg --help
cg mcp --port 3001
cg dev

# Unlink when done
npm unlink -g chainglass
```

### Publishing Workflow

```bash
# Build all packages
pnpm build

# Verify package contents
npm pack --dry-run

# Publish to npm
npm publish

# Users can then run:
npx cg --help
npx cg mcp
npx chainglass dev
```

### Alternative: Single-Package Approach

For simpler projects, skip monorepo and use a single package:

```
chainglass/
├── src/
│   ├── cli/
│   ├── server/
│   ├── shared/
│   └── app/           # Next.js app
├── package.json
└── tsconfig.json
```

**When to use monorepo vs single package:**
- **Monorepo**: Multiple teams, independent versioning needed, large codebase
- **Single package**: Solo/small team, unified versioning, simpler deployment

**Recommendation for Chainglass**: Start with monorepo structure. The separation of cli/shared/mcp-server/web provides clean boundaries that align with clean architecture principles.

---

## Finding DI-01: Dependency Injection Container Selection

### TSyringe Recommended

**Comparison Matrix:**

| Framework | Bundle Size | Tree-Shaking | Decorators | Testing | Next.js |
|-----------|-------------|--------------|------------|---------|---------|
| **TSyringe** ⭐ | Small | Excellent | Optional | Easy | Great |
| Awilix | Small | Excellent | None | Excellent | Great |
| InversifyJS | Large | Poor | Required | Complex | Slow startup |
| TypeDI | Medium | Poor | Required | Problematic | Global state issues |

### Why TSyringe

1. **Microsoft-backed**: Active maintenance, institutional support
2. **Lightweight**: Minimal bundle impact, fast startup (critical for serverless)
3. **Decorator-optional**: Basic constructor injection works without `@inject()`
4. **Tree-shakeable**: Unused code drops from production bundles
5. **Testing-friendly**: `container.registerInstance()` for fakes, `container.clearInstances()` for cleanup

### Alternative: Awilix

If the team strongly prefers zero decorators, Awilix is the best alternative:
- Explicit functional registration
- Superior tree-shaking
- Excellent for pure clean architecture
- More verbose but completely transparent

### Rejected Options

**InversifyJS**: Feature-rich but overkill for Next.js
- Heavy decorator reliance creates bundle size issues
- Poor tree-shaking (20-50% larger bundles)
- Slow cold-start times (problematic for serverless)

**TypeDI**: Avoid for new projects
- Global singleton container causes testing issues
- State leaks between tests
- Incompatible with Next.js server component model

### Implementation Pattern

```typescript
// src/lib/server/di-container.ts
import { container } from 'tsyringe';
import { ILogger } from '@/adapters/logging/logger.interface';
import { PinoLoggerAdapter } from '@/adapters/logging/pino-logger.adapter';

// Register adapters
container.register<ILogger>('ILogger', { useClass: PinoLoggerAdapter });

// For testing
export function registerTestDependencies() {
  container.clearInstances();
  container.register<ILogger>('ILogger', { useClass: FakeLogger });
}

export { container };
```

---

## Finding TF-01: Test Framework Selection

### Vitest Recommended

**Comparison Matrix:**

| Framework | Speed | TypeScript | Watch Mode | Fakes | Next.js |
|-----------|-------|------------|------------|-------|---------|
| **Vitest** ⭐ | 10x faster | Native | Graph-based | Excellent | Official |
| Jest | Baseline | ts-jest | Git-based | Good | Official |
| Bun test | Very fast | Native | Good | Good | Experimental |
| Node test | Variable | Loader needed | None | No mocking | Limited |

### Performance Benchmarks

| Metric | Vitest | Jest | Improvement |
|--------|--------|------|-------------|
| Test execution (17 files) | 1.8s | 18.7s | **10x faster** |
| Startup time | 0.3s | 8.2s | **27x faster** |
| Watch mode (affected tests) | <200ms | Several seconds | **Instant feedback** |

### Why Vitest for TDD

1. **Intelligent watch mode**: Traces ES module graph, runs only affected tests
2. **Native TypeScript**: Zero configuration, uses Vite's transformation
3. **Fakes-friendly**: Module interception makes lightweight fakes easy
4. **Sub-200ms feedback**: Maintains developer flow state during TDD cycles
5. **Next.js official support**: Documented configuration available

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

### Fakes Over Mocks Strategy

The team prefers fakes over mocks because:
- Fakes test behavior, mocks test implementation
- Fakes remain stable during refactoring
- Fakes encourage interface-driven design
- Fakes are reusable across tests

```typescript
// test/fakes/fake-logger.ts
export class FakeLogger implements ILogger {
  private entries: CapturedLogEntry[] = [];

  info(message: string, data?: Record<string, unknown>): void {
    this.entries.push({ level: 'INFO', message, data, timestamp: new Date() });
  }

  // Test helpers
  hasLoggedMessage(level: string, message: string): boolean {
    return this.entries.some(e => e.level === level && e.message.includes(message));
  }

  clear(): void {
    this.entries = [];
  }
}
```

---

## Finding LF-01: Linting and Formatting Selection

### Biome Recommended

**Comparison Matrix:**

| Tool | Speed | Config Files | TypeScript | Next.js |
|------|-------|--------------|------------|---------|
| **Biome** ⭐ | 20x faster | 1 | Native | Good |
| ESLint + Prettier | Baseline | 3+ | Via plugins | Excellent |
| Oxlint | 50x faster | 0-1 | Native | Good |
| dprint | Very fast | 1 | Native | N/A (formatter only) |

### Performance Benchmarks

| Tool | 4,800 files | 500 files | Setup Time |
|------|-------------|-----------|------------|
| Biome | 1.3s | 0.5s | 5 minutes |
| ESLint + Prettier | 28s | 8s | 45 minutes |
| Oxlint (lint only) | 0.7s | 0.2s | 2 minutes |

### Why Biome

1. **Unified tooling**: Single tool for linting AND formatting
2. **20x faster**: Sub-second execution even on large codebases
3. **Simple config**: One `biome.json` file vs 3+ for ESLint+Prettier
4. **No conflicts**: Formatter and linter designed together
5. **Native TypeScript**: No additional plugins required

### Configuration

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "style": {
        "useConst": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
```

### When to Use ESLint Instead

Consider ESLint + Prettier if you need:
- `eslint-plugin-jsx-a11y` for accessibility
- Security-focused plugins
- Framework-specific plugins (Vue, Svelte)
- Existing ESLint configuration investment

---

## Finding JF-01: Justfile Task Runner

### Just Recommended

**Why Just over alternatives:**

| Feature | Just | npm scripts | Make |
|---------|------|-------------|------|
| Performance | ~22ms | ~400ms | Minimal |
| Syntax | Simple | JSON strings | Complex |
| Cross-platform | Excellent | Good | Unix-focused |
| Dependencies | Built-in | None | File-based |
| Documentation | Auto-generated | Manual | Manual |

### Installation

```bash
# macOS
brew install just

# Linux (various)
apt install just  # Debian/Ubuntu
dnf install just  # Fedora

# Windows
winget install --id Casey.Just --exact
scoop install just
choco install just

# Universal
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash
```

### Justfile for Chainglass

```justfile
# Chainglass - Clean Architecture Next.js Project
# Usage: just <recipe>

set shell := ["bash", "-uc"]
set dotenv-load

# Default: show available commands
default:
    @just --list

# === INSTALLATION ===

# Install all dependencies
install:
    @echo "Installing dependencies..."
    npm install

# === DEVELOPMENT ===

# Start development server
dev:
    @echo "Starting Next.js development server..."
    npm run dev

# Start production server
start: build
    @echo "Starting production server..."
    npm start

# === QUALITY ===

# Run linting
lint:
    @echo "Running Biome linter..."
    npx biome lint .

# Auto-fix linting issues
fix:
    @echo "Fixing linting issues..."
    npx biome lint --write .

# Format code
format:
    @echo "Formatting code..."
    npx biome format --write .

# Check formatting without changes
format-check:
    @echo "Checking code formatting..."
    npx biome format .

# Run tests
test:
    @echo "Running tests..."
    npx vitest run

# Run tests in watch mode
test-watch:
    @echo "Running tests in watch mode..."
    npx vitest

# Run tests with coverage
test-coverage:
    @echo "Running tests with coverage..."
    npx vitest run --coverage

# === COMBINED COMMANDS ===

# Fix, Format, Test (FFT)
fft: fix format test
    @echo "FFT complete!"

# Full quality check
check: lint format-check test
    @echo "All checks passed!"

# === BUILD ===

# Build for production
build:
    @echo "Building for production..."
    npm run build

# Clean build artifacts
clean:
    @echo "Cleaning build artifacts..."
    rm -rf .next node_modules dist build .turbo

# Clean and reinstall
clean-install: clean install

# === CLI ===

# Run the Chainglass CLI
cg *args:
    @echo "Running Chainglass CLI..."
    npx cg {{args}}

# Start MCP server
mcp:
    @echo "Starting MCP server..."
    npx cg mcp

# === TYPE CHECKING ===

# Run TypeScript type check
typecheck:
    @echo "Running TypeScript type check..."
    npx tsc --noEmit
```

---

## Finding LA-01: Logger Adapter Design

### Interface-First Approach

Following clean architecture, the logger is defined as an interface that adapters implement.

### Interface Definition

```typescript
// src/adapters/logging/logger.interface.ts
export enum LogLevel {
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export interface ILogger {
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;
  child(metadata: Record<string, unknown>): ILogger;
}
```

### Pino Implementation

```typescript
// src/adapters/logging/pino-logger.adapter.ts
import pino from 'pino';
import { ILogger } from './logger.interface';

export class PinoLoggerAdapter implements ILogger {
  private logger: pino.Logger;

  constructor(name: string = 'chainglass') {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      base: { service: name },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.logger.trace(data, message);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(data, message);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(data, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(data, message);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.error({ ...data, error: error?.message, stack: error?.stack }, message);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.fatal({ ...data, error: error?.message, stack: error?.stack }, message);
  }

  child(metadata: Record<string, unknown>): ILogger {
    const childPino = this.logger.child(metadata);
    const adapter = new PinoLoggerAdapter();
    (adapter as any).logger = childPino;
    return adapter;
  }
}
```

### Fake Logger for Testing

```typescript
// test/fakes/fake-logger.ts
import { ILogger, LogLevel } from '@/adapters/logging/logger.interface';

export interface CapturedLogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export class FakeLogger implements ILogger {
  private entries: CapturedLogEntry[] = [];

  trace(message: string, data?: Record<string, unknown>): void {
    this.capture(LogLevel.TRACE, message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.capture(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.capture(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.capture(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.capture(LogLevel.ERROR, message, data, error);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.capture(LogLevel.FATAL, message, data, error);
  }

  child(metadata: Record<string, unknown>): ILogger {
    return new FakeLogger(); // Simple child implementation for tests
  }

  private capture(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    this.entries.push({ timestamp: new Date(), level, message, data, error });
  }

  // === Test Helpers ===

  getEntries(): CapturedLogEntry[] {
    return [...this.entries];
  }

  getEntriesByLevel(level: LogLevel): CapturedLogEntry[] {
    return this.entries.filter(e => e.level === level);
  }

  hasLoggedMessage(level: LogLevel, messagePattern: string | RegExp): boolean {
    return this.entries.some(e => {
      if (e.level !== level) return false;
      if (typeof messagePattern === 'string') {
        return e.message.includes(messagePattern);
      }
      return messagePattern.test(e.message);
    });
  }

  getLastEntry(): CapturedLogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  clear(): void {
    this.entries = [];
  }

  assertLoggedAtLevel(level: LogLevel, messagePattern: string | RegExp): void {
    if (!this.hasLoggedMessage(level, messagePattern)) {
      const messages = this.getEntriesByLevel(level).map(e => e.message).join(', ');
      throw new Error(
        `Expected log at ${level} matching "${messagePattern}". Found: ${messages || 'none'}`
      );
    }
  }
}
```

---

## Architecture Documentation

### Clean Architecture Rules

#### Dependency Direction: LEFT ← RIGHT

```
┌──────────────────────────────────────────────────────────────┐
│                    DEPENDENCY DIRECTION                       │
│                    ═══════════════════                       │
│                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│   │  SERVICES   │ ←  │  ADAPTERS   │ ←  │  EXTERNAL   │     │
│   │ (Business)  │    │(Infrastructure)│  │  (3rd Party)│     │
│   └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
│   ✓ Services CAN depend on Adapter interfaces (ILogger)     │
│   ✗ Adapters CANNOT depend on Services                      │
│   ✗ Services CANNOT know about concrete adapters            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Layer Rules

| Layer | Can Depend On | Cannot Depend On |
|-------|---------------|------------------|
| **Services** | Adapter Interfaces, Other Services | Concrete Adapters, External libs |
| **Adapters** | External libraries, Interfaces | Services, Other Adapters |
| **External** | N/A | N/A (3rd party code) |

### Example: Service with Adapter Injection

```typescript
// src/services/sample.service.ts
import { ILogger } from '@/adapters/logging/logger.interface';

export interface ISampleService {
  doSomething(input: string): Promise<string>;
}

export class SampleService implements ISampleService {
  constructor(private readonly logger: ILogger) {} // ← Adapter injected via interface

  async doSomething(input: string): Promise<string> {
    this.logger.info('Processing input', { input });

    // Business logic here
    const result = `Processed: ${input}`;

    this.logger.info('Processing complete', { result });
    return result;
  }
}
```

### Example: Service Test with Fake

```typescript
// src/services/sample.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SampleService } from './sample.service';
import { FakeLogger } from '@test/fakes/fake-logger';
import { LogLevel } from '@/adapters/logging/logger.interface';

describe('SampleService', () => {
  let service: SampleService;
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
    service = new SampleService(fakeLogger);
  });

  it('should process input and log operations', async () => {
    const result = await service.doSomething('test-input');

    expect(result).toBe('Processed: test-input');
    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing input');
    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing complete');
  });

  it('should include input in log metadata', async () => {
    await service.doSomething('my-value');

    const entries = fakeLogger.getEntriesByLevel(LogLevel.INFO);
    const inputEntry = entries.find(e => e.message.includes('Processing input'));

    expect(inputEntry?.data?.input).toBe('my-value');
  });
});
```

---

## Recommended Project Structure

**Monorepo with pnpm workspaces + Turborepo** (see Finding PD-01 for full details)

**Architecture Clarification (2026-01-18)**: Most services and adapters are SHARED between CLI and web. Only package-specific code lives in apps/web or packages/cli. Interfaces ALWAYS live in shared.

```
chainglass/
├── packages/
│   ├── shared/                       # CORE - used by CLI, web, and MCP server
│   │   ├── src/
│   │   │   ├── interfaces/           # ALL interfaces (single source of truth)
│   │   │   │   ├── logger.interface.ts
│   │   │   │   ├── storage.interface.ts
│   │   │   │   └── index.ts
│   │   │   ├── services/             # Shared business logic (majority)
│   │   │   │   ├── enrichment.service.ts
│   │   │   │   ├── spec.service.ts
│   │   │   │   └── index.ts
│   │   │   ├── adapters/             # Shared adapters (majority)
│   │   │   │   ├── pino-logger.adapter.ts
│   │   │   │   ├── file-storage.adapter.ts
│   │   │   │   └── index.ts
│   │   │   ├── fakes/                # ALL fakes for shared interfaces
│   │   │   │   ├── fake-logger.ts
│   │   │   │   ├── fake-storage.ts
│   │   │   │   └── index.ts
│   │   │   ├── types/                # DTOs, shared types
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── package.json             # @chainglass/shared
│   │   └── tsconfig.json
│   │
│   ├── cli/                          # CLI entry point (Commander.js)
│   │   ├── src/
│   │   │   ├── bin/
│   │   │   │   └── cg.ts            # #!/usr/bin/env node
│   │   │   ├── commands/
│   │   │   │   ├── mcp.command.ts
│   │   │   │   ├── dev.command.ts
│   │   │   │   └── index.ts
│   │   │   ├── services/             # CLI-ONLY services
│   │   │   ├── adapters/             # CLI-ONLY adapters (e.g., TerminalAdapter)
│   │   │   └── index.ts
│   │   ├── test/
│   │   │   └── fakes/                # Fakes for CLI-only interfaces
│   │   ├── package.json             # @chainglass/cli
│   │   └── tsconfig.json
│   │
│   └── mcp-server/                   # MCP server implementation
│       ├── src/
│       │   ├── server.ts
│       │   └── index.ts
│       ├── package.json             # @chainglass/mcp-server
│       └── tsconfig.json
│
├── apps/
│   └── web/                          # Next.js application (end-user facing)
│       ├── src/
│       │   ├── app/                  # Next.js App Router
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   └── api/
│       │   │       └── health/
│       │   │           └── route.ts
│       │   │
│       │   ├── services/             # Web-ONLY services (e.g., SessionService)
│       │   ├── adapters/             # Web-ONLY adapters (e.g., NextAuthAdapter)
│       │   │
│       │   └── lib/
│       │       └── di-container.ts   # TSyringe DI setup (wires shared + web-specific)
│       │
│       ├── next.config.js
│       ├── package.json
│       └── tsconfig.json
│
├── test/                             # CENTRAL test suite (all tests here)
│   ├── setup.ts                      # Global Vitest setup
│   ├── vitest.config.ts              # Root Vitest config
│   ├── fixtures/                     # Shared test data/fixtures
│   ├── base/                         # Base test classes, test utilities
│   ├── unit/                         # Unit tests (organized by package)
│   │   ├── shared/                   # Tests for @chainglass/shared
│   │   ├── cli/                      # Tests for @chainglass/cli
│   │   └── web/                      # Tests for apps/web
│   ├── integration/                  # Integration tests
│   └── e2e/                          # End-to-end tests (future)
│
├── docs/
│   ├── plans/
│   │   └── 001-project-setup/
│   │       ├── research-dossier.md   # This file
│   │       └── project-setup-spec.md # Feature specification
│   └── rules/
│       └── architecture.md           # Architecture rules
│
├── dist/                             # Bundled CLI output (git-ignored)
│   └── cli.js                        # esbuild bundle
│
├── pnpm-workspace.yaml               # Workspace definition
├── turbo.json                        # Build orchestration
├── justfile                          # Task runner
├── biome.json                        # Linter/formatter
├── tsconfig.json                     # Base TypeScript config
├── package.json                      # Root with bin exports
└── README.md
```

**Key Architecture Principles**:
1. **Interfaces in shared**: ALL interfaces live in `@chainglass/shared/interfaces` - single source of truth
2. **Fakes colocated with interfaces**: Fakes live in `@chainglass/shared/fakes` (not in test folder)
3. **Centralized tests**: ALL tests live in root `test/` folder, organized by package
4. **Package-specific code**: Only truly package-specific services/adapters live in that package
5. **TDD support**: Any test can import fakes from `@chainglass/shared/fakes`

---

## Implementation Phases

### Phase 1: Monorepo Foundation
- [ ] Initialize pnpm workspace with `pnpm-workspace.yaml`
- [ ] Create root `package.json` with bin exports for `cg`/`chainglass`
- [ ] Set up Turborepo with `turbo.json`
- [ ] Create base `tsconfig.json` for TypeScript
- [ ] Configure Biome for linting/formatting
- [ ] Create justfile with workspace commands

### Phase 2: Shared Package
- [ ] Create `packages/shared` structure
- [ ] Define ILogger interface in shared types
- [ ] Create FakeLogger for tests
- [ ] Export types and utilities
- [ ] Set up package build with tsc

### Phase 3: Next.js App with Clean Architecture
- [ ] Create `apps/web` with Next.js 15 + App Router
- [ ] Set up services/ and adapters/ directories
- [ ] Implement PinoLoggerAdapter
- [ ] Set up TSyringe DI container
- [ ] Configure Vitest for testing
- [ ] Write sample service with adapter injection

### Phase 4: CLI Package
- [ ] Create `packages/cli` structure
- [ ] Implement `cg.ts` entry point with Commander.js
- [ ] Add `cg mcp` command (lazy-loaded)
- [ ] Add `cg dev` command to start Next.js
- [ ] Bundle CLI with esbuild to `dist/cli.js`
- [ ] Test `npm link` workflow

### Phase 5: MCP Server Package
- [ ] Create `packages/mcp-server` structure
- [ ] Implement MCP server basic functionality
- [ ] Wire up to CLI `cg mcp` command
- [ ] Add stdio and HTTP transport options

### Phase 6: Documentation & Polish
- [ ] Create `docs/rules/architecture.md`
- [ ] Document all patterns and conventions
- [ ] Verify all `just` commands work
- [ ] Test `npx cg` workflow end-to-end
- [ ] Manual test hot reload in development

---

## Success Criteria

After implementation, these commands should work:

### Development Commands (via Just)

| Command | Purpose | Expected Outcome |
|---------|---------|------------------|
| `just install` | Install dependencies | pnpm install completes |
| `just dev` | Start dev server | Next.js on localhost:3000 |
| `just build` | Build all packages | turbo build completes |
| `just test` | Run all tests | All tests pass |
| `just fft` | Fix, Format, Test | All checks pass |
| `just lint` | Check linting | No errors |
| `just format` | Format code | Code formatted |
| `just typecheck` | Type checking | No TS errors |

### CLI Commands (via npx or npm link)

| Command | Purpose | Expected Outcome |
|---------|---------|------------------|
| `cg --help` | Show CLI help | Lists available commands |
| `cg --version` | CLI version | Shows version number |
| `cg dev` | Start dev server | Next.js on localhost:3000 |
| `cg mcp` | Start MCP server | MCP server running |
| `cg mcp --stdio` | MCP via stdio | Stdio transport active |

### npx Distribution (after npm publish)

| Command | Purpose | Expected Outcome |
|---------|---------|------------------|
| `npx cg --help` | Run CLI via npx | Help displays quickly |
| `npx chainglass dev` | Start dev via npx | Next.js starts |
| `npx cg mcp` | Start MCP via npx | MCP server running |

---

## External Research Sources

Research was conducted using Perplexity Deep Research on:

1. **CLI name availability** - Verified across all major package managers
2. **CLI parser selection** - Compared Commander.js, Clipanion, citty, oclif, yargs, meow
3. **Package distribution & npx** - Monorepo structure, pnpm workspaces, Turborepo, fast npx startup
4. **TypeScript DI containers** - Compared TSyringe, Awilix, InversifyJS, TypeDI
5. **Next.js 14/15 best practices** - Project structure, App Router, clean architecture
6. **Test frameworks for TDD** - Compared Vitest, Jest, Bun test, Node test runner
7. **Linters and formatters** - Compared Biome, ESLint, Prettier, Oxlint
8. **Logger adapter patterns** - Clean architecture logging with Pino
9. **Just task runner** - Installation, syntax, Node.js integration

---

## Next Steps

1. **Run `/plan-1b-specify`** to create formal specification
2. **Run `/plan-3-architect`** to generate implementation plan
3. **Run `/plan-6-implement-phase`** to begin Phase 1 implementation

---

**Research Complete**: 2026-01-18
**Report Location**: `docs/plans/001-project-setup/research-dossier.md`
