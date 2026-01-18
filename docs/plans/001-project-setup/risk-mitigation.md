# Risk & Mitigation Plan: Chainglass Project Setup

**Generated**: 2026-01-18
**Plan Folder**: `docs/plans/001-project-setup`
**Parent Spec**: `project-setup-spec.md`

---

## Executive Summary

This document identifies 8 implementation risks across the 6-phase project setup, with concrete mitigation strategies and safety checks. Risks are categorized by type (Tooling, Integration, Architecture, Testing) and prioritized by impact.

### Risk Heat Map

| Phase | Critical | High | Medium | Low |
|-------|----------|------|--------|-----|
| Phase 1: Monorepo Foundation | 1 | 1 | 1 | - |
| Phase 2: Shared Package | - | 1 | - | - |
| Phase 3: Next.js + Clean Arch | 1 | 1 | - | - |
| Phase 4: CLI Package | - | 1 | - | - |
| Phase 5: MCP Server | - | - | 1 | - |
| Phase 6: Documentation | - | - | - | - |

---

## Discovery R1-01: Bootstrap Chicken-and-Egg Problem

**Category**: Tooling Risk
**Impact**: Critical
**Affects Phases**: 1, 2, 3

### Problem

Phase 1 requires Turborepo to orchestrate builds, but Turborepo needs `turbo.json` pipeline definitions that reference packages that don't exist yet. Similarly, the root `package.json` references workspace packages via `workspace:*` before those packages are created. Running `pnpm install` on an incomplete workspace configuration will fail with cryptic errors.

### Root Cause

pnpm workspaces + Turborepo have a strong expectation that all referenced packages exist when the workspace is initialized. The monorepo bootstrap sequence is order-dependent:
1. `pnpm-workspace.yaml` must exist before `pnpm install`
2. Packages referenced in `workspace:*` must exist before resolution
3. `turbo.json` pipelines reference package scripts that may not exist yet

### Mitigation

**Staged Bootstrap Approach**:
1. Create minimal `pnpm-workspace.yaml` first (with directories that exist)
2. Create package directories with minimal `package.json` (name + version only)
3. Run `pnpm install` to establish workspace linking
4. Add `turbo.json` after packages have build scripts
5. Incrementally add complexity

**Fallback Strategy**: If workspace setup fails, create a single-package scaffold first, verify tooling works, then split into monorepo.

### Safety Check

```bash
# Verify workspace is correctly configured
pnpm ls --depth 0 2>&1 | grep -v "ERR"

# Verify all workspace packages are linked
pnpm ls --filter "@chainglass/*" --depth 0

# Verify turbo can see the workspace
pnpm turbo build --dry-run
```

### Rollback

If bootstrap fails:
1. Delete `node_modules`, `pnpm-lock.yaml`, and `.turbo`
2. Verify `pnpm-workspace.yaml` only references directories that exist
3. Ensure each package has valid `package.json` with name and version
4. Re-run `pnpm install`

---

## Discovery R1-02: TypeScript Project References Configuration

**Category**: Tooling Risk
**Impact**: High
**Affects Phases**: 1, 2, 3, 4

### Problem

Monorepo TypeScript setup requires careful coordination between:
- Root `tsconfig.json` (base configuration)
- Package-specific `tsconfig.json` (extends base)
- TypeScript project references (for incremental builds)
- Path aliases (`@chainglass/shared` → `packages/shared/src`)

Misconfiguration leads to: "Cannot find module '@chainglass/shared'" errors at compile time, even when pnpm workspace linking is correct. The IDE may show errors that `tsc` doesn't catch, or vice versa.

### Root Cause

TypeScript module resolution and pnpm workspace resolution are separate systems:
- pnpm uses symlinks in `node_modules` for runtime
- TypeScript uses `paths` and `references` for compile-time
- These must be kept in sync manually

### Mitigation

**Configuration Pattern**:

```jsonc
// Root tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@chainglass/shared": ["packages/shared/src"],
      "@chainglass/cli": ["packages/cli/src"],
      "@chainglass/mcp-server": ["packages/mcp-server/src"]
    }
  },
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/cli" },
    { "path": "packages/mcp-server" },
    { "path": "apps/web" }
  ]
}

// Package tsconfig.json (e.g., packages/cli/tsconfig.json)
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "references": [
    { "path": "../shared" }
  ]
}
```

**Key Rules**:
1. Every package must have `"composite": true` for project references
2. References must match actual import dependencies
3. Build order must respect dependency graph (shared → cli/web)

### Safety Check

```bash
# Verify TypeScript can resolve all packages
pnpm tsc --build --dry

# Check for import resolution errors across workspace
pnpm turbo typecheck

# Verify IDE and CLI agree (run both, compare errors)
pnpm tsc --noEmit 2>&1 | head -20
```

### Rollback

If TypeScript resolution breaks:
1. Verify `composite: true` in all package tsconfigs
2. Check `references` arrays match import dependencies
3. Run `pnpm tsc --build --clean` to clear incremental cache
4. Re-run `pnpm tsc --build`

---

## Discovery R1-03: TSyringe Decorators in Next.js Server Components

**Category**: Integration Risk
**Impact**: Critical
**Affects Phases**: 3, 5

### Problem

TSyringe's `@injectable()` and `@inject()` decorators require:
1. `experimentalDecorators: true` in tsconfig
2. `emitDecoratorMetadata: true` in tsconfig
3. `reflect-metadata` polyfill imported before any decorated class

Next.js React Server Components (RSC) execute in a special environment where:
- Module initialization order is unpredictable
- Global `Reflect` polyfill may not be available
- Decorator metadata may be stripped during bundling

### Root Cause

Next.js 15 App Router uses React Server Components by default. RSC have restrictions on what JavaScript features work reliably. TSyringe decorators rely on runtime metadata that may not survive the RSC compilation pipeline.

### Mitigation

**Decorator-Free Pattern (Recommended)**:

```typescript
// Use explicit registration instead of decorators
// packages/shared/src/di/container.ts
import { container } from 'tsyringe';
import { ILogger } from '../interfaces/logger.interface';
import { PinoLoggerAdapter } from '../adapters/pino-logger.adapter';

// Explicit registration - no decorators needed
container.register<ILogger>('ILogger', { useClass: PinoLoggerAdapter });

// Service uses constructor injection without @inject
export class EnrichmentService {
  constructor(private readonly logger: ILogger) {}
}

// Resolution is explicit
const service = container.resolve(EnrichmentService);
```

**If Decorators Are Needed**:
1. Keep decorated classes in `packages/shared` (not in Next.js app)
2. Ensure `reflect-metadata` is imported in a dedicated entry point
3. Test RSC rendering explicitly after adding any decorator

### Safety Check

```bash
# Verify Next.js builds without decorator errors
cd apps/web && pnpm build 2>&1 | grep -i "decorator\|reflect\|metadata"

# Test RSC rendering
curl -s http://localhost:3000 | grep -q "html" && echo "OK" || echo "FAIL"

# Verify DI resolution works in server context
pnpm vitest run --filter "di-container"
```

### Rollback

If TSyringe causes RSC issues:
1. Remove all `@injectable()` and `@inject()` decorators
2. Switch to explicit `container.register()` calls
3. Consider fallback to Awilix (zero decorators) or manual DI

---

## Discovery R1-04: Vitest Monorepo Path Resolution

**Category**: Testing Risk
**Impact**: High
**Affects Phases**: 2, 3, 4, 5

### Problem

The centralized test suite at root `test/` must import from multiple workspace packages:
- `test/unit/shared/*.test.ts` imports from `@chainglass/shared`
- `test/unit/cli/*.test.ts` imports from `@chainglass/cli`
- `test/unit/web/*.test.ts` imports from `apps/web/src`

Vitest must resolve these imports correctly, but its path resolution is separate from TypeScript and pnpm.

### Root Cause

Three different resolution systems must agree:
1. **pnpm**: Uses `node_modules` symlinks
2. **TypeScript**: Uses `paths` in tsconfig
3. **Vitest**: Uses Vite's resolver (requires `vite-tsconfig-paths` plugin)

If any one is misconfigured, tests fail with "Cannot find module" despite code working in other contexts.

### Mitigation

**Vitest Configuration**:

```typescript
// vitest.config.ts (at repository root)
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    alias: {
      // Explicit fallback aliases if tsconfigPaths fails
      '@chainglass/shared': './packages/shared/src',
      '@chainglass/cli': './packages/cli/src',
      '@test/': './test/',
    },
  },
});
```

**Test Setup**:

```typescript
// test/setup.ts
import 'reflect-metadata'; // For TSyringe if using decorators
import { container } from 'tsyringe';
import { FakeLogger } from '@chainglass/shared/fakes';

// Reset DI container before each test file
beforeEach(() => {
  container.clearInstances();
  container.register('ILogger', { useValue: new FakeLogger() });
});
```

### Safety Check

```bash
# Verify test imports resolve
pnpm vitest run --reporter=verbose 2>&1 | head -50

# Check for path resolution errors
pnpm vitest run 2>&1 | grep -i "cannot find module\|module not found"

# Verify imports work from each test subdirectory
pnpm vitest run test/unit/shared --reporter=dot
pnpm vitest run test/unit/cli --reporter=dot
```

### Rollback

If Vitest path resolution fails:
1. Add explicit `alias` entries in `vitest.config.ts`
2. Verify `vite-tsconfig-paths` is installed and configured
3. Try using relative imports as fallback (`../../packages/shared/src`)

---

## Discovery R1-05: Clean Architecture Boundary Enforcement

**Category**: Architecture Risk
**Impact**: High
**Affects Phases**: 2, 3, 4

### Problem

The spec requires that services cannot import concrete adapters (only interfaces). However, TypeScript provides no built-in way to enforce this at compile time. A developer could accidentally import `PinoLoggerAdapter` directly into a service, violating clean architecture.

Without automated enforcement, architectural rules become "documentation only" and erode over time.

### Root Cause

TypeScript's module system allows any import that is syntactically valid. Clean architecture boundaries are semantic constraints that require external tooling to enforce.

### Mitigation

**Option A: ESLint `no-restricted-imports` (requires ESLint alongside Biome)**:

```javascript
// .eslintrc.js (architecture rules only, Biome handles formatting)
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/adapters/*.adapter'],
          message: 'Services cannot import concrete adapters. Use interfaces only.',
        },
        {
          group: ['**/adapters/**', '!**/adapters/*.interface'],
          importNames: ['*'],
          message: 'Import adapter interfaces, not implementations.',
        },
      ],
    }],
  },
  overrides: [
    {
      files: ['**/adapters/**', '**/di-container.ts', '**/test/**'],
      rules: {
        'no-restricted-imports': 'off', // DI container and tests can import adapters
      },
    },
  ],
};
```

**Option B: Custom TypeScript Lint Script**:

```typescript
// scripts/check-architecture.ts
import * as ts from 'typescript';
import * as path from 'path';

// Parse all service files, check for forbidden imports
function checkArchitectureBoundaries(): boolean {
  // Implementation: walk AST, find imports, validate against rules
}
```

**Option C: Directory-Level Package Exports**:

```json
// packages/shared/package.json
{
  "exports": {
    "./interfaces": "./src/interfaces/index.js",
    "./fakes": "./src/fakes/index.js"
    // No export for ./adapters - forces explicit import
  }
}
```

### Safety Check

```bash
# Custom architecture check (add to justfile)
just check-architecture

# Grep for violations (quick check)
grep -r "from.*adapter" packages/shared/src/services/ apps/web/src/services/ 2>/dev/null | grep -v ".interface" && echo "VIOLATION FOUND" || echo "OK"

# If using ESLint for architecture rules
pnpm eslint --rule 'no-restricted-imports: error' packages/shared/src/services/
```

### Rollback

If architecture enforcement is too strict:
1. Add exception files to eslint overrides
2. Use `// eslint-disable-next-line` for legitimate exceptions
3. Document why exception is needed

---

## Discovery R1-06: CLI Bundling with Workspace Dependencies

**Category**: Tooling Risk
**Impact**: High
**Affects Phases**: 4

### Problem

The CLI must be bundled into a single `dist/cli.js` file for npx distribution. However, it depends on `@chainglass/shared` which uses `workspace:*` protocol. esbuild must:

1. Bundle `@chainglass/shared` code into the CLI
2. NOT bundle Node.js built-ins (`fs`, `path`, etc.)
3. NOT bundle heavy runtime dependencies meant for lazy-loading
4. Handle TypeScript correctly

Misconfiguration results in either "Cannot find module" at runtime or 10MB+ bundles.

### Root Cause

The `workspace:*` protocol is a pnpm feature for local development. When publishing to npm or bundling, it must be resolved to actual code. esbuild's default behavior may externalize workspace packages (expecting them in node_modules at runtime).

### Mitigation

**esbuild Configuration**:

```typescript
// packages/cli/build.ts
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/bin/cg.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: '../../dist/cli.js',
  minify: true,

  // Critical: Include workspace packages in bundle
  packages: 'bundle', // Not 'external'

  // Externalize Node.js built-ins and runtime-heavy deps
  external: [
    'pino',           // Loaded at runtime by adapter
    'next',           // Loaded when cg dev runs
    '@modelcontextprotocol/*', // Loaded by cg mcp
  ],

  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

**Lazy Loading Pattern**:

```typescript
// packages/cli/src/commands/mcp.command.ts
export async function startMcpServer(options: McpOptions) {
  // Dynamic import - not bundled, loaded at runtime
  const { Server } = await import('@modelcontextprotocol/sdk');
  // ...
}
```

### Safety Check

```bash
# Verify bundle size is reasonable (<1MB for basic CLI)
ls -lh dist/cli.js | awk '{print $5}'

# Test CLI works without node_modules
mkdir /tmp/cli-test && cp dist/cli.js /tmp/cli-test/
cd /tmp/cli-test && node cli.js --help

# Verify workspace code is included
grep -q "chainglass" dist/cli.js && echo "Shared code bundled: OK" || echo "FAIL"
```

### Rollback

If bundle issues occur:
1. Switch from `packages: 'bundle'` to explicit `external` list
2. Use `--analyze` flag to see what's included
3. Consider tsup or rollup if esbuild is too opinionated

---

## Discovery R1-07: Fake Implementation Contract Drift

**Category**: Testing Risk
**Impact**: Medium
**Affects Phases**: 2, 3, 4, 5

### Problem

Fakes must implement the same interface as real adapters. Over time, fakes can drift:
- Real adapter adds a new method, fake doesn't implement it
- Fake's test helpers don't match actual behavior
- Interface changes aren't propagated to fakes

Tests pass with fakes but fail with real adapters in integration/production.

### Root Cause

TypeScript ensures fakes implement the interface at compile time, but doesn't verify behavioral equivalence. A fake could implement `save()` as a no-op while the real adapter has complex validation logic.

### Mitigation

**Contract Tests Pattern**:

```typescript
// test/contracts/logger.contract.ts
import { describe, it, expect } from 'vitest';
import { ILogger } from '@chainglass/shared';

// Shared test suite that both fake and real must pass
export function loggerContractTests(
  name: string,
  createLogger: () => ILogger
) {
  describe(`${name} implements ILogger contract`, () => {
    it('should not throw when logging info', () => {
      const logger = createLogger();
      expect(() => logger.info('test')).not.toThrow();
    });

    it('should create child logger with metadata', () => {
      const logger = createLogger();
      const child = logger.child({ requestId: '123' });
      expect(child).toBeDefined();
      expect(() => child.info('child log')).not.toThrow();
    });

    // Add tests for all interface methods
  });
}

// test/unit/shared/fake-logger.test.ts
import { loggerContractTests } from '../../contracts/logger.contract';
import { FakeLogger } from '@chainglass/shared/fakes';

loggerContractTests('FakeLogger', () => new FakeLogger());

// test/integration/pino-logger.test.ts
import { loggerContractTests } from '../contracts/logger.contract';
import { PinoLoggerAdapter } from '@chainglass/shared/adapters';

loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
```

### Safety Check

```bash
# Run contract tests for all implementations
pnpm vitest run test/contracts/

# Verify fake implements all interface methods (TypeScript check)
pnpm tsc --noEmit 2>&1 | grep -i "FakeLogger\|FakeStorage"
```

### Rollback

If contract drift is found:
1. Update fake to implement missing methods
2. Add missing contract tests
3. Consider generating fakes from interfaces (advanced)

---

## Discovery R1-08: MCP Server stdio Transport Compatibility

**Category**: Integration Risk
**Impact**: Medium
**Affects Phases**: 5

### Problem

MCP servers typically use stdio transport when invoked by AI agents. The `cg mcp` command must:
1. Read JSON-RPC from stdin
2. Write JSON-RPC to stdout
3. NOT write anything else to stdout (logs, errors, etc.)

Any extraneous stdout output (startup messages, console.log) corrupts the JSON-RPC stream and breaks agent communication.

### Root Cause

Node.js applications commonly log to stdout. In stdio transport mode, stdout is reserved for protocol messages. Logger output, uncaught exceptions, and debug statements can all corrupt the stream.

### Mitigation

**Strict stdout Discipline**:

```typescript
// packages/mcp-server/src/server.ts
export async function startMcpServer(options: McpOptions) {
  // In stdio mode, redirect all logs to stderr
  if (options.stdio) {
    const logger = createLogger({
      transport: {
        target: 'pino/file',
        options: { destination: 2 }, // fd 2 = stderr
      },
    });

    // Ensure console.log doesn't go to stdout
    console.log = (...args) => console.error('[LOG]', ...args);
  }

  // Handle uncaught exceptions without stdout
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
  });

  // ... MCP server setup
}
```

**Test for stdout Cleanliness**:

```typescript
// test/integration/mcp-stdio.test.ts
import { spawn } from 'child_process';

it('should not output anything to stdout before receiving input', async () => {
  const proc = spawn('node', ['dist/cli.js', 'mcp', '--stdio']);

  const stdout: string[] = [];
  proc.stdout.on('data', (data) => stdout.push(data.toString()));

  // Wait briefly for any startup messages
  await new Promise((r) => setTimeout(r, 500));

  // Should have no stdout output
  expect(stdout.join('')).toBe('');

  proc.kill();
});
```

### Safety Check

```bash
# Test stdio mode produces no spurious output
timeout 2 node dist/cli.js mcp --stdio 2>/dev/null || true
# Should produce nothing (empty output)

# Verify JSON-RPC response to valid request
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | \
  node dist/cli.js mcp --stdio 2>/dev/null | \
  jq -e '.result' && echo "Valid JSON-RPC response" || echo "FAIL"
```

### Rollback

If stdio issues occur:
1. Audit all `console.log` calls in MCP server path
2. Redirect all logging to stderr explicitly
3. Test with actual MCP client (Claude Desktop, Cursor)

---

## Summary: Recommended Execution Order

Based on risk analysis, phases should include these safety gates:

### Phase 1: Monorepo Foundation
- [ ] Create packages with minimal package.json first (R1-01)
- [ ] Verify `pnpm install` succeeds before adding Turborepo
- [ ] Run `pnpm tsc --build --dry` after TypeScript setup (R1-02)

### Phase 2: Shared Package
- [ ] Implement FakeLogger with contract tests (R1-07)
- [ ] Verify package exports from root `test/` (R1-04)

### Phase 3: Next.js + Clean Architecture
- [ ] Use decorator-free TSyringe pattern (R1-03)
- [ ] Add architecture enforcement from day one (R1-05)
- [ ] Test RSC rendering after DI setup

### Phase 4: CLI Package
- [ ] Configure esbuild with `packages: 'bundle'` (R1-06)
- [ ] Verify bundle works without node_modules
- [ ] Test `npm link` workflow

### Phase 5: MCP Server
- [ ] Implement strict stdout discipline for stdio (R1-08)
- [ ] Test with actual MCP client

### Phase 6: Documentation
- [ ] Document all mitigation patterns
- [ ] Add safety checks to justfile

---

**Document Created**: 2026-01-18
**Risk Assessment Complete**: 8 discoveries identified
**Next Action**: Incorporate safety checks into phase implementation plans
