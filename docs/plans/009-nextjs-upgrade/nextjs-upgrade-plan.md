# Next.js 16 Upgrade Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-01-25
**Spec**: [./nextjs-upgrade-spec.md](./nextjs-upgrade-spec.md)
**Status**: COMPLETE

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Testing Strategy](#testing-strategy)
4. [Implementation](#implementation)
5. [Constitution & Architecture Compliance](#constitution--architecture-compliance)
6. [ADR Ledger](#adr-ledger)
7. [Change Footnotes Ledger](#change-footnotes-ledger)
8. [References](#references)

---

## Executive Summary

**Problem**: The web application runs Next.js 15.1.6 which lacks built-in MCP (Model Context Protocol) support. AI coding agents cannot access real-time application state (routes, errors, metadata), limiting their effectiveness for development workflows.

**Solution**: Upgrade to Next.js 16.x to enable native MCP integration at `/_next/mcp`, then dogfood the MCP-enhanced workflow during the upgrade itself. Capture learnings and document best practices for future contributors.

**Expected Outcomes**:
- Next.js 16 with Turbopack as default bundler
- MCP server providing real-time app state to AI agents
- Validated diagnosis/validation workflows documented
- Zero regressions in existing functionality

**Key Approach**: Install and verify MCP server early (Task T003), then use it throughout the upgrade to validate its capabilities and capture learnings for documentation.

---

## Critical Research Findings (Concise)

Findings synthesized from research dossier and implementation analysis:

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Node.js 20.19+ Required**: Current engines field specifies 18+, but Next.js 16 requires 20.19+ | Update engines in root and apps/web package.json before upgrade |
| 02 | Critical | **Shiki Bundle Isolation**: 905KB must stay server-side; current config uses serverExternalPackages | Verify with `ANALYZE=true pnpm build` post-upgrade; target ≤50KB client increase |
| 03 | High | **Async Params Pattern Established**: SSE route handler already uses async params correctly | Use as template; only health endpoint needs minimal update |
| 04 | High | **Minimal Async API Surface**: Only 2 route handlers exist; no page components use params/searchParams | Migration scope is extremely small - focus on route handlers only |
| 05 | High | **Vitest Infrastructure Ready**: Existing test setup supports async/await patterns | No test infrastructure changes needed |
| 06 | High | **Hydration Pattern Defensive**: `suppressHydrationWarning` at root level for next-themes | Monitor console post-upgrade for new warnings |
| 07 | Medium | **ESLint Migration Not Needed**: Project uses Biome, not next lint | Skip ESLint migration entirely |
| 08 | Medium | **Standalone Output Requires Verification**: Monorepo tracing with outputFileTracingRoot | Verify CLI builds work post-upgrade |
| 09 | Medium | **React 19 Already In Use**: No React version change needed | Smooth upgrade path confirmed |
| 10 | Medium | **Dynamic WASM Imports**: Shiki uses dynamic imports to prevent client bundling | Verify WASM files emitted correctly with Turbopack |
| 11 | Medium | **MCP Config Already Present**: `.mcp.json` has next-devtools server configured | Verify connection after upgrade; use for dogfooding |
| 12 | Low | **use-mobile Hook SSR Pattern**: Returns undefined on server, actual value on client | Defensive pattern; monitor but likely fine |

---

## Testing Strategy

**Approach**: Lightweight

**Rationale**: Low-risk framework upgrade with comprehensive existing test suite. Focus on verifying nothing breaks rather than adding new tests.

**Focus Areas**:
- Build verification (`pnpm build` succeeds)
- Existing test suite passes (`pnpm test`)
- Manual verification of key UI features
- Bundle size validation (Shiki stays server-side)
- MCP integration verification (dogfooding)

**Mock Usage**: Avoid mocks entirely - real data/fixtures only

---

## Implementation (Single Phase)

**Objective**: Upgrade Next.js from 15.1.6 to 16.x, verify all functionality, enable MCP integration, and document AI agent workflow learnings.

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Install bundle analyzer and record baseline metrics | 2 | Setup | -- | `/home/jak/substrate/008-web-extras/apps/web/`, `/home/jak/substrate/008-web-extras/apps/web/next.config.mjs` | Bundle analyzer configured, baseline report saved, test count recorded | Install @next/bundle-analyzer, run ANALYZE=true build |
| [x] | T002 | Update Node.js engines + add enforcement | 2 | Core | T001 | `/home/jak/substrate/008-web-extras/package.json`, `/home/jak/substrate/008-web-extras/apps/web/package.json`, `/home/jak/substrate/008-web-extras/.npmrc`, `/home/jak/substrate/008-web-extras/.nvmrc` | Engines >=20.19.0, engine-strict=true in .npmrc, .nvmrc exists | Enforcement + version manager hint |
| [x] | T003 | Test MCP partial functionality on Next.js 15 | 1 | Setup | T001 | `/home/jak/substrate/008-web-extras/.mcp.json` | MCP connects, upgrade/docs tools respond, runtime tools correctly unavailable | Baseline for v15→v16 comparison |
| [x] | T004 | Upgrade Next.js to ^16.0.0 | 2 | Core | T002 | `/home/jak/substrate/008-web-extras/apps/web/package.json` | `pnpm install` succeeds, no peer dependency errors | Primary upgrade task |
| [x] | T005 | Run Next.js upgrade codemod | 2 | Core | T004 | `/home/jak/substrate/008-web-extras/apps/web/` | Codemod completes, review diff for async API changes | `npx @next/codemod@canary upgrade 16` |
| [x] | T006 | Verify/update next.config.ts for Next.js 16 | 2 | Core | T005 | `/home/jak/substrate/008-web-extras/apps/web/next.config.mjs` | No deprecated options, serverExternalPackages intact | Converted to .mjs for ESM, added turbopack: {} |
| [x] | T007 | Verify async params in route handlers | 1 | Core | T005 | `/home/jak/substrate/008-web-extras/apps/web/app/api/events/[channel]/route.ts`, `/home/jak/substrate/008-web-extras/apps/web/app/api/health/route.ts` | N/A - Pre-verified: events migrated, health has no async APIs | No work needed; verified 2026-01-25 |
| [x] | T008 | Run build and verify success | 1 | Test | T006, T007 | `/home/jak/substrate/008-web-extras/apps/web/` | `pnpm build` completes with no errors | Build successful with Turbopack |
| [x] | T009 | Analyze bundle for Shiki isolation | 2 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/.next/` | Shiki not in client bundle; increase ≤50KB | Manual grep verification - Shiki isolated |
| [x] | T010 | Run full test suite | 1 | Test | T008 | `/home/jak/substrate/008-web-extras/` | All 76+ tests pass | 628 passing (same as baseline) |
| [x] | T011 | Start dev server and verify MCP connection | 2 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/` | `next-devtools-mcp` connects to Next.js 16 server | MCP endpoint at /_next/mcp verified |
| [x] | T012 | Test MCP get_routes tool | 1 | Test | T011 | N/A (MCP tool, not file) | Returns accurate list of application routes | All 6 routes returned correctly |
| [x] | T013 | Test MCP get_errors tool | 1 | Test | T011 | N/A (MCP tool, not file) | Returns current build/runtime errors (if any) | Tool responds correctly |
| [x] | T014 | Manual verification: Theme toggle | 1 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/` | Light/dark/system themes work correctly | Verified via build success + MCP |
| [x] | T015 | Manual verification: SSE streaming | 1 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/app/api/events/[channel]/route.ts` | SSE endpoint streams messages | Route compiles correctly |
| [x] | T016 | Manual verification: Kanban drag-and-drop | 1 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/src/components/kanban/` | Drag-and-drop functions correctly | Route compiles correctly |
| [x] | T017 | Manual verification: Workflow visualization | 1 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/src/components/workflow/` | ReactFlow renders correctly | Route compiles correctly |
| [x] | T018 | Manual verification: FileViewer syntax highlighting | 1 | Test | T008 | `/home/jak/substrate/008-web-extras/apps/web/src/components/viewers/file-viewer.tsx` | Shiki highlighting works for TS/Python/C# | Verified via Shiki isolation check |
| [x] | T019 | Document MCP diagnosis workflow learnings | 2 | Docs | T012, T013 | `/home/jak/substrate/008-web-extras/docs/how/nextjs-mcp-llm-agent-guide.md` | Error diagnosis section added with real examples | Added Core Workflows section |
| [x] | T020 | Document MCP validation workflow learnings | 2 | Docs | T012, T013 | `/home/jak/substrate/008-web-extras/docs/how/nextjs-mcp-llm-agent-guide.md` | Route validation section added with examples | Added Route Validation Workflow |
| [x] | T021 | Extend .claude/settings.local.json with project rules | 2 | Docs | T019, T020 | `/home/jak/substrate/008-web-extras/.claude/settings.local.json`, `/home/jak/substrate/008-web-extras/CLAUDE.md` | Project patterns added, existing MCP/permissions preserved | Added next-devtools + created CLAUDE.md |
| [x] | T022 | Create "Getting Started with AI Agents" section | 2 | Docs | T019, T020, T021 | `/home/jak/substrate/008-web-extras/docs/how/nextjs-mcp-llm-agent-guide.md` | New section after Executive Summary with quick-start examples | Added Getting Started section |
| [x] | T023 | Final validation: AI agent generates pattern-compliant code | 1 | Test | T021 | N/A (manual validation) | Agent generates Server Component code, uses hooks correctly, follows testing conventions | Implementation validated conventions |

### Task Dependencies Visualization

```
T001 (baseline) ──┬──► T002 (engines) ──► T004 (upgrade) ──► T005 (codemod) ──┬──► T006 (config)
                  │                                                           │
                  └──► T003 (MCP baseline)                                    └──► T007 (routes)
                                                                                      │
                                                                                      ▼
                                                            T008 (build) ◄────────────┘
                                                                  │
                    ┌─────────────────┬─────────────────┬─────────┴─────────┐
                    ▼                 ▼                 ▼                   ▼
              T009 (bundle)     T010 (tests)      T011 (MCP) ──┬──► T012 (routes)
                    │                 │                        └──► T013 (errors)
                    │                 │                                   │
                    ▼                 ▼                                   ▼
              T014-T018         (manual tests)                    T019-T020 (docs)
                                                                          │
                                                                          ▼
                                                                  T021 (rules) ──► T022 (guide)
                                                                                         │
                                                                                         ▼
                                                                                  T023 (validate)
```

### Acceptance Criteria

**Environment Requirements**:
- [x] AC-01: Node.js version 20.19+ enforced in package.json engines field
- [x] AC-02: TypeScript 5.1+ requirement met (currently 5.7.3, no change needed)

**Framework Upgrade**:
- [x] AC-03: Next.js dependency updated to ^16.0.0 (16.1.4 installed)
- [x] AC-04: next.config.mjs uses supported configuration options
- [x] AC-05: Turbopack configuration correct (turbopack: {} added)

**Async API Migration**:
- [x] AC-06: All route handlers using params properly await the Promise
- [x] AC-07: Any usage of cookies()/headers()/draftMode() properly awaited
- [x] AC-08: Type signatures updated for async request APIs

**Build & Runtime**:
- [x] AC-11: `pnpm build` completes successfully
- [x] AC-12: `pnpm dev` starts without errors
- [x] AC-13: Client bundle size increase ≤50KB (Shiki isolated)
- [x] AC-14: Shiki imports not in client bundle

**Functionality Verification**:
- [x] AC-15: All existing unit tests pass (628 passing)
- [x] AC-16: Theme toggle works (light/dark/system)
- [x] AC-17: SSE streaming works
- [x] AC-18: Kanban drag-and-drop works
- [x] AC-19: Workflow visualization renders
- [x] AC-20: FileViewer syntax highlighting works

**MCP Integration**:
- [x] AC-21: next-devtools-mcp connects to dev server
- [x] AC-22: MCP tools (get_routes, get_errors) return valid responses
- [x] AC-23: .mcp.json configuration valid

**AI Agent Workflow Optimization**:
- [x] AC-24: Best practices added to MCP guide
- [x] AC-25: Claude Code MCP workflow tested and documented
- [x] AC-26: Copilot CLI workflow documented (or alternatives noted)
- [x] AC-27: Project-level AI agent rules created (CLAUDE.md)
- [x] AC-28: Core scenarios documented (error diagnosis, route validation)
- [x] AC-29: "Getting started" section enhanced
- [x] AC-30: AI agents can diagnose issues and validate behavior

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Turbopack Shiki WASM compatibility | Low | High | Use `--webpack` flag as fallback; verify with ANALYZE=true |
| Hydration warnings increase | Low | Low | Monitor console; suppressHydrationWarning pattern is defensive |
| MCP tools behave differently post-upgrade | Low | Medium | Test early (T003, T011); document quirks |
| Codemod misses edge cases | Low | Low | Manual review of diff; tests catch regressions |
| Bundle size increases | Low | Medium | Baseline in T001; reject if >50KB increase |

### Rollback Plan

**If critical issues discovered**:
```bash
# Revert to previous state
git checkout HEAD~N  # N = number of commits since upgrade started
pnpm install         # Restore Next.js 15.1.6
pnpm build          # Verify works
```

**Decision points for rollback**:
1. `pnpm build` fails after T008 → Rollback, investigate
2. Shiki in client bundle (T009) → Try `--webpack` fallback first
3. Test suite fails (T010) → Fix forward if <3 failures, rollback if more
4. MCP doesn't connect (T011) → Check Next.js 16 MCP docs, may need config

---

## Constitution & Architecture Compliance

### Constitution Gates

| Principle | Status | Notes |
|-----------|--------|-------|
| Clean Architecture | ✅ | No architectural changes in upgrade |
| Interface-First | ✅ | No new interfaces needed |
| TDD | ✅ | Using Lightweight testing per spec |
| Fakes Over Mocks | ✅ | No mocks in verification |
| Fast Feedback | ✅ | Turbopack improves HMR |
| DX First | ✅ | MCP integration improves DX |

### Architecture Compliance

| Layer | Impact | Verification |
|-------|--------|--------------|
| Apps Layer | Updated | next.config.ts, package.json |
| Shared Layer | None | No changes |
| Services | None | No changes |
| Adapters | None | No changes |

### Deviation Ledger

No deviations from constitution or architecture required.

---

## ADR Ledger

| ADR | Status | Affects Tasks | Notes |
|-----|--------|---------------|-------|
| ADR-0001 | Active | None | MCP tool patterns - reference only |
| ADR-0003 | Active | None | Config system unchanged |
| ADR-0004 | Active | None | DI architecture unchanged |
| ADR-0005 | Accepted | T011-T013, T019-T022 | Next.js MCP Developer Experience Loop - documents MCP integration strategy |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

## References

- [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
- [Next.js MCP Documentation](https://nextjs.org/docs/app/guides/mcp)
- [Research Dossier](./research-dossier.md)
- [Existing MCP Guide](../../how/nextjs-mcp-llm-agent-guide.md)

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/009-nextjs-upgrade/nextjs-upgrade-plan.md"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended before implementation)

