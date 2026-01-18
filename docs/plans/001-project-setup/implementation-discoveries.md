# Implementation Discoveries: Chainglass Project Setup

**Generated**: 2026-01-18
**Source**: Analysis of `research-dossier.md` and `project-setup-spec.md`
**Purpose**: Implementation-focused insights for plan execution

---

## Discovery I1-01: Bootstrap Sequence is Critical Path

**Category**: Phase Order
**Impact**: Critical

**What**: Phase 1 has a strict internal dependency order that must be followed: pnpm must exist before Turborepo can reference workspaces, TypeScript base config must exist before package configs can extend it, and Biome must be configured before any code is written (to avoid reformatting churn).

**Why It Matters**: Violating this order causes cascading failures. Installing Turborepo before pnpm-workspace.yaml exists will fail. Writing code before Biome is configured means immediate reformatting. TypeScript configs that extend non-existent base configs fail compilation.

**Action Required**: Phase 1 must follow this exact sequence:
1. `pnpm init` (root package.json)
2. `pnpm-workspace.yaml` (workspace definition)
3. `tsconfig.json` (base TypeScript - must exist before any package tsconfig)
4. `biome.json` (formatter/linter - must exist before writing ANY source code)
5. `turbo.json` (references workspace packages)
6. `justfile` (orchestrates all tools - last because it depends on all above)
7. Verify with `pnpm install` and `just --list`

**Affects Phases**: 1

---

## Discovery I1-02: Shared Package Must Be Built Before All Others

**Category**: Phase Order
**Impact**: Critical

**What**: The 6-phase structure has a hidden hard dependency: `@chainglass/shared` (Phase 2) must be buildable and importable before Phase 3 (web), Phase 4 (CLI), or Phase 5 (MCP server) can begin. Turborepo's `^build` dependency in turbo.json enforces this at build time, but development requires the shared package to exist first.

**Why It Matters**: If Phase 3 starts before Phase 2 is complete, `workspace:*` imports will fail. The DI container in `apps/web/src/lib/di-container.ts` imports from `@chainglass/shared` for interfaces and fakes. CLI commands import shared services.

**Action Required**:
- Phase 2 must be 100% complete (including first test passing) before Phase 3 starts
- Verify with: `cd packages/shared && pnpm build && pnpm test`
- Only proceed to Phase 3 after imports like `import { ILogger } from '@chainglass/shared'` resolve

**Affects Phases**: 2, 3, 4, 5

---

## Discovery I1-03: Interface-First TDD Cycle Within Shared Package

**Category**: Testing
**Impact**: High

**What**: The shared package follows a specific TDD cycle: (1) Write interface, (2) Write fake implementing interface, (3) Write test using fake, (4) Write real adapter implementing interface. This order ensures interfaces are driven by test needs, not implementation details.

**Why It Matters**: Writing the real adapter first (e.g., PinoLoggerAdapter) tempts you to design the interface around Pino's API rather than consumer needs. Writing the fake first forces interface design based on what tests need to assert.

**Action Required**: For ILogger in Phase 2:
1. Create `interfaces/logger.interface.ts` with method signatures
2. Create `fakes/fake-logger.ts` implementing ILogger with test helpers
3. Write test in `test/unit/shared/fake-logger.test.ts` that uses FakeLogger
4. Only then create `adapters/pino-logger.adapter.ts`
5. Write integration test that verifies PinoLoggerAdapter satisfies interface

**Affects Phases**: 2, 3

---

## Discovery I1-04: DI Container Setup Requires Dual Registration Pattern

**Category**: Integration
**Impact**: High

**What**: The DI container in `apps/web` must support two distinct registration modes: production (real adapters) and testing (fakes). TSyringe's `container.clearInstances()` is insufficient alone - tests need `container.reset()` equivalent and explicit re-registration.

**Why It Matters**: Without proper test isolation, DI state leaks between tests causing flaky failures. A test that registers FakeLogger pollutes subsequent tests expecting PinoLoggerAdapter.

**Action Required**: In Phase 3, create dual container setup:
```typescript
// apps/web/src/lib/di-container.ts
export function createProductionContainer() {
  const c = container.createChildContainer();
  c.register<ILogger>('ILogger', { useClass: PinoLoggerAdapter });
  return c;
}

// test/setup.ts
export function createTestContainer() {
  const c = container.createChildContainer();
  c.register<ILogger>('ILogger', { useClass: FakeLogger });
  return c;
}
```

**Affects Phases**: 3, 4, 5

---

## Discovery I1-05: CLI Bundle Must Exclude Node Modules Correctly

**Category**: Task Sequence
**Impact**: High

**What**: The esbuild configuration for CLI bundling (Phase 4) must mark `@chainglass/shared` as external when building for development (preserves workspace linking) but bundle it for production (creates standalone dist/cli.js). Two build modes are needed.

**Why It Matters**: If shared is bundled during development, changes to shared require CLI rebuild. If shared is external in production, npx users get "module not found" errors.

**Action Required**: In Phase 4, create two esbuild configurations:
```javascript
// Development: external shared for fast iteration
esbuild --external:@chainglass/shared --outfile=dist/cli.dev.js

// Production: bundle everything for npx distribution
esbuild --bundle --outfile=dist/cli.js
```
Update justfile to use appropriate mode:
- `just dev` uses dev build
- `just build` uses production build

**Affects Phases**: 4

---

## Discovery I1-06: Test Organization Requires Path Mapping Alignment

**Category**: Testing
**Impact**: Medium

**What**: The centralized test suite at `test/` must resolve imports to source files in `packages/` and `apps/`. Vitest's `vite-tsconfig-paths` plugin must be configured, AND the root tsconfig.json must define path aliases that match package exports.

**Why It Matters**: A test file `test/unit/shared/logger.test.ts` importing `@chainglass/shared` will fail if path resolution isn't configured. Tests importing `@/services/sample.service` from web app need different path context.

**Action Required**: In Phase 1, configure root tsconfig.json:
```json
{
  "compilerOptions": {
    "paths": {
      "@chainglass/shared": ["./packages/shared/src/index.ts"],
      "@chainglass/shared/*": ["./packages/shared/src/*"],
      "@chainglass/cli": ["./packages/cli/src/index.ts"],
      "@chainglass/cli/*": ["./packages/cli/src/*"],
      "@test/*": ["./test/*"]
    }
  }
}
```
In Phase 3, add Vitest config referencing root tsconfig.

**Affects Phases**: 1, 2, 3

---

## Discovery I1-07: Phase 3 and Phase 4 Can Partially Parallelize

**Category**: Phase Order
**Impact**: Medium

**What**: While Phase 3 (Next.js) and Phase 4 (CLI) both depend on Phase 2 (shared), they do not depend on each other. After Phase 2 is complete, web app structure and CLI structure can be developed in parallel. Integration between them (CLI starting Next.js) is a final step.

**Why It Matters**: Strict sequential execution of all 6 phases is suboptimal. Recognizing parallelization opportunities reduces total implementation time.

**Action Required**: After Phase 2 completion:
- Phase 3a: Create apps/web structure, DI container, sample service
- Phase 4a: Create packages/cli structure, Commander.js setup, basic commands
- Phase 3b + 4b: Wire CLI `cg dev` to start Next.js (integration point)
- Then Phase 5 (MCP) which depends on both

Suggested reordering:
1. Phase 1: Monorepo Foundation (sequential)
2. Phase 2: Shared Package (sequential)
3. Phase 3a + 4a: Web + CLI in parallel (basic structure)
4. Phase 3b + 4b: Integration (CLI starts web)
5. Phase 5: MCP Server
6. Phase 6: Documentation & Polish

**Affects Phases**: 3, 4

---

## Discovery I1-08: Integration Verification Gates Between Phases

**Category**: Integration
**Impact**: Medium

**What**: Each phase completion requires explicit verification commands that prove integration works, not just that individual components exist. Phase boundaries should have "gate" commands.

**Why It Matters**: A phase can appear complete (all files created, tests pass) but fail integration. Phase 2 might have passing unit tests but fail when Phase 3 tries to import from it due to incorrect package.json exports.

**Action Required**: Define verification gates:

| Phase | Verification Gate Command | Success Criteria |
|-------|--------------------------|------------------|
| 1 | `pnpm install && just --list && just typecheck` | No errors, commands listed |
| 2 | `pnpm -F @chainglass/shared build && pnpm -F @chainglass/shared test` | Build succeeds, tests pass |
| 2->3 | `cd apps/web && pnpm add @chainglass/shared && tsc --noEmit` | Import resolves |
| 3 | `just dev` (verify localhost:3000) + `just test` | Server starts, tests pass |
| 4 | `pnpm build && npm link && cg --help` | CLI responds |
| 5 | `cg mcp --help` | MCP command available |
| 6 | `just check` (full quality suite) | All checks pass |

**Affects Phases**: All (1-6)

---

## Summary: Optimized Implementation Order

Based on these discoveries, the recommended implementation sequence:

### Phase 1: Monorepo Foundation (Strict Order)
1. `pnpm init` - root package.json
2. `pnpm-workspace.yaml` - workspace definition
3. `tsconfig.json` - base config with path aliases
4. `biome.json` - linter/formatter (before ANY code)
5. `turbo.json` - build orchestration
6. `justfile` - task runner
7. **GATE**: `pnpm install && just --list && just typecheck`

### Phase 2: Shared Package (Interface-First TDD)
1. `packages/shared/package.json` + `tsconfig.json`
2. `interfaces/logger.interface.ts` - interface first
3. `fakes/fake-logger.ts` - fake second
4. `test/unit/shared/fake-logger.test.ts` - test third
5. `adapters/pino-logger.adapter.ts` - adapter last
6. Export configuration in package.json
7. **GATE**: `pnpm -F @chainglass/shared build && pnpm -F @chainglass/shared test`

### Phase 3a + 4a: Web + CLI Structure (Parallel)
- 3a: apps/web scaffold, DI container, sample service/test
- 4a: packages/cli scaffold, Commander.js setup, help command
- **GATE 3a**: `cd apps/web && pnpm build && pnpm test`
- **GATE 4a**: `pnpm -F @chainglass/cli build`

### Phase 3b + 4b: Integration
- Wire `cg dev` to start Next.js
- Wire DI container to inject real vs fake adapters
- **GATE**: `npm link && cg dev` starts server, `just test` passes

### Phase 5: MCP Server
1. packages/mcp-server structure
2. Basic server implementation
3. Wire to `cg mcp` command
4. **GATE**: `cg mcp --help` shows options

### Phase 6: Documentation & Polish
1. docs/rules/architecture.md
2. README.md updates
3. Full verification suite
4. **GATE**: `just check` passes all quality gates

---

**Discoveries Complete**: 2026-01-18
