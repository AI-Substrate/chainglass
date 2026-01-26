# Next.js 16 Upgrade

**Mode**: Simple

---

## Research Context

This specification incorporates findings from in-session research conducted 2026-01-25.

**Components Affected:**
- `apps/web/` - Next.js application (primary target)
- `apps/web/app/api/events/[channel]/route.ts` - SSE route handler with async params
- `apps/web/next.config.ts` - Configuration file requiring updates
- `package.json` - Engine requirements and scripts

**Critical Dependencies:**
- Node.js 20.19+ (currently 18+)
- React 19.0.0 (already compatible)
- All UI dependencies (Radix, dnd-kit, ReactFlow) verified compatible

**Modification Risks:**
- Async API changes for `params`, `searchParams`, `cookies()`, `headers()`
- ESLint configuration migration from `next lint` to CLI
- Bundle isolation verification for Shiki (905KB must stay server-side)
- SSR hydration patterns may need adjustment

**Key Finding:** This is a LOW-RISK upgrade. The codebase is exceptionally well-positioned with React 19 already in use, App Router fully adopted, and all dependencies compatible.

---

## Summary

**WHAT:** Upgrade the Next.js framework from version 15.1.6 to version 16.x across the web application, enabling modern features and improved development tooling. Additionally, formulate and validate optimal AI coding agent workflows to ensure future contributors have the best possible development experience.

**WHY:**
1. Enable MCP (Model Context Protocol) integration for AI-assisted development - Next.js 16 includes built-in MCP server support at `/_next/mcp`
2. Access Cache Components for explicit, opt-in caching with `'use cache'` directive
3. Benefit from Turbopack as default bundler (2-5x faster builds, 10x faster HMR)
4. Stay current with framework security updates and ecosystem compatibility
5. Unlock improved developer experience with better error messages and debugging
6. Establish and document best practices for AI agent development loops so future generations working on this codebase get the absolute best experience

---

## Goals

1. **G1: Framework Currency** - Update to Next.js 16.x stable release with all breaking changes addressed
2. **G2: MCP Integration Ready** - Enable the `next-devtools-mcp` server to provide AI agents with real-time application state access
3. **G3: Zero Regression** - All existing functionality continues to work (tests pass, UI renders correctly, SSE streams function)
4. **G4: Bundle Integrity** - Shiki syntax highlighting remains server-side only (client bundle increase ≤50KB)
5. **G5: Development Parity** - Local development workflow remains smooth with Turbopack as default bundler
6. **G6: CI/CD Compatibility** - Build and deployment pipelines work without modification
7. **G7: Optimal AI Agent Workflow** - Document and validate the best development loop strategies for AI coding agents (Claude Code, Copilot CLI, Cursor) so future contributors get the absolute best experience working on this codebase

---

## Non-Goals

1. **NG1: Feature Development** - No new features added during upgrade (pure framework migration)
2. **NG2: Cache Components Adoption** - Not implementing `'use cache'` directive in existing code (deferred to future work)
3. **NG3: Middleware Rename** - Not renaming `middleware.ts` to `proxy.ts` (deprecation warning acceptable)
4. **NG4: React Compiler** - Not enabling React Compiler optimization (can be added later)
5. **NG5: Plan 006 Changes** - Not modifying web-extras plan components during upgrade

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | Multiple files: next.config.ts, package.json, route handlers, ESLint config, agent rules/docs |
| Integration (I) | 1 | One major external dependency (Next.js), plus MCP server integration |
| Data/State (D) | 0 | No schema or data migrations required |
| Novelty (N) | 1 | Upgrade well-specified, but AI workflow optimization requires experimentation and discovery |
| Non-Functional (F) | 1 | Must verify bundle size, SSR hydration, and agent workflow effectiveness |
| Testing/Rollout (T) | 2 | Integration testing + manual validation of AI agent workflows with real tools |

**Total**: P = 6 → CS-3 (medium)

**Confidence**: 0.80

**Assumptions**:
- Node.js 20.19+ can be installed in development environments
- Codemods handle majority of async API migrations automatically
- No custom Webpack plugins incompatible with Turbopack
- CI/CD environments support Node.js 20+

**Dependencies**:
- Node.js runtime upgrade to 20.19+
- Network access for `npx @next/codemod` execution
- Access to AI tools for manual validation (Claude Code subscription, Copilot CLI, etc.)
- Next.js 16 upgrade completed before agent workflow testing (Phase 5 depends on Phases 1-4)

**Risks**:
- Turbopack may have edge cases with Shiki WASM loading (mitigated by webpack fallback option)
- SSR hydration strictness could surface latent bugs (mitigated by existing suppressHydrationWarning usage)

**Phases**:
1. Environment preparation (Node.js upgrade)
2. Automated codemod execution
3. Manual configuration updates
4. Verification and testing
5. AI Agent Workflow Optimization (formulate strategies, test with real agents, document best practices)

---

## Acceptance Criteria

### Environment Requirements
- **AC-01**: Node.js version 20.19 or higher is required and enforced in `package.json` engines field
- **AC-02**: TypeScript 5.1+ requirement is met (currently 5.7.3, no change needed)

### Framework Upgrade
- **AC-03**: Next.js dependency updated to ^16.0.0 in `apps/web/package.json`
- **AC-04**: `next.config.ts` uses supported configuration options (no deprecated fields)
- **AC-05**: Turbopack configuration moved from `experimental.turbo` to top-level `turbopack` if present

### Async API Migration
- **AC-06**: All route handlers using `params` properly await the Promise
- **AC-07**: Any usage of `cookies()`, `headers()`, or `draftMode()` is properly awaited
- **AC-08**: Type signatures updated to reflect async nature of request APIs

### ESLint Configuration
- **AC-09**: `next lint` command replaced with direct ESLint CLI invocation
- **AC-10**: ESLint configuration works with flat config format if applicable

### Build & Runtime
- **AC-11**: `pnpm build` completes successfully with no errors
- **AC-12**: `pnpm dev` starts development server without errors
- **AC-13**: Client bundle size increase is ≤50KB compared to pre-upgrade baseline
- **AC-14**: Shiki imports do not appear in client bundle (verified via bundle analysis)

### Functionality Verification
- **AC-15**: All existing unit tests pass (`pnpm test`)
- **AC-16**: Theme toggle functions correctly (light/dark/system)
- **AC-17**: SSE streaming works (`/api/events/[channel]` endpoint)
- **AC-18**: Kanban drag-and-drop operates normally
- **AC-19**: Workflow visualization renders correctly
- **AC-20**: FileViewer syntax highlighting works with all supported languages

### MCP Integration
- **AC-21**: `next-devtools-mcp` can connect to running Next.js dev server
- **AC-22**: MCP tools (`get_routes`, `get_errors`) return valid responses
- **AC-23**: `.mcp.json` configuration is valid and servers connect on session start

### AI Agent Workflow Optimization
- **AC-24**: Best practices added to existing `docs/how/nextjs-mcp-llm-agent-guide.md` documenting diagnosis and validation workflows
- **AC-25**: MCP-enhanced workflow tested with Claude Code - agent can query routes, detect errors, and validate application state
- **AC-26**: MCP-enhanced workflow tested with GitHub Copilot CLI - diagnosis and validation capabilities documented
- **AC-27**: Project-level rules/instructions created for AI agents (`.claude/` settings or equivalent)
- **AC-28**: Core development scenarios documented: error diagnosis, route validation, codebase understanding, build/test verification
- **AC-29**: "Getting started with AI agents" section enhanced in existing guide
- **AC-30**: Manual validation confirms AI agents can diagnose issues and validate expected behavior

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Turbopack incompatibility with Shiki WASM | Low | Medium | Use `--webpack` flag as fallback; Shiki already in serverExternalPackages |
| SSR hydration warnings become errors | Low | Low | Existing suppressHydrationWarning pattern is defensive |
| Third-party package React 19 issues | Very Low | Medium | All deps verified compatible in research |
| CI/CD Node.js version mismatch | Medium | High | Update CI configuration before merge |
| Codemods miss edge cases | Low | Low | Manual review of changes; tests catch regressions |
| AI agent workflow strategies become stale | Medium | Low | Document principles, not just commands; version lock examples |
| MCP tools behave differently across AI clients | Medium | Medium | Test with multiple tools; document client-specific quirks |
| Agent-generated code doesn't follow patterns | Medium | Medium | Create explicit project rules; include pattern examples in docs |

### Assumptions

1. Development machines can run Node.js 20.19+
2. CI/CD pipelines can be updated to Node.js 20+
3. No private npm packages with Next.js 16 incompatibilities
4. Turbopack supports all current webpack customizations
5. React 19 concurrent rendering doesn't affect existing patterns
6. AI tools (Claude Code, Copilot CLI) remain stable during testing period
7. MCP protocol implementation is consistent across supported tools
8. Manual validation of agent workflows is sufficient (no automated agent testing framework needed)

---

## Open Questions

All questions resolved in Session 2026-01-25 - see Clarifications section below.

---

## Testing Strategy

**Approach**: Lightweight

**Rationale**: Low-risk framework upgrade with comprehensive existing test suite. Focus on verifying nothing breaks rather than adding new tests.

**Focus Areas**:
- Build verification (`pnpm build` succeeds)
- Existing test suite passes (`pnpm test`)
- Manual verification of key UI features (theme toggle, SSE, drag-and-drop, syntax highlighting)
- Bundle size validation (Shiki stays server-side)
- MCP integration verification

**Excluded**:
- New unit tests for upgrade paths
- E2E test additions
- Performance benchmarking (beyond bundle size)

**Mock Usage**: Avoid mocks entirely
- Real data/fixtures only
- Framework upgrades should test real behavior to catch actual regressions

---

## Documentation Strategy

**Location**: Expand existing guide (`docs/how/nextjs-mcp-llm-agent-guide.md`)

**Rationale**: Guide already exists and covers MCP fundamentals. Phase 5 findings should enhance this document rather than create fragmentation.

**Content Updates**:
- Add validated workflow examples from Phase 5 testing
- Document Claude Code and Copilot CLI as primary tools
- Include core development scenarios with example prompts
- Add project-specific patterns section

**Target Audience**: Future contributors using AI coding agents

**Maintenance**: Update when MCP tools or project patterns change significantly

---

## Clarifications

### Session 2026-01-25

**Q1: Cache Components enablement**
- **Answer**: Defer to separate task
- **Resolution**: Already documented in NG2 (Non-Goal). No change needed.

**Q2: CI/CD environment**
- **Answer**: No CI/CD exists in this project
- **Resolution**: Q2 is moot. Removed from active concerns.

**Q3: Middleware rename**
- **Answer**: No middleware.ts exists in codebase
- **Resolution**: Q3 is moot. Removed from active concerns.

**Q4: AI tools focus**
- **Answer**: Claude Code and Copilot CLI as primaries
- **Resolution**: Updated AC-25, AC-26 and ADR-003 to reflect dual-tool focus. Cursor becomes optional/secondary.

**Q5: Development scenarios**
- **Answer**: Core workflow scenarios - mainly diagnosis and validation
- **Resolution**: Scenarios to test and document:
  1. Diagnose errors via MCP (`get_errors` tool)
  2. Validate routes and structure (`get_routes`, `get_page_metadata`)
  3. Verify things are working as expected (build status, test results)
  4. Understand codebase structure for context

---

## ADRs

- ADR-0005: Next.js MCP Developer Experience Loop (2026-01-25) – status: Accepted

---

## ADR Seeds (Optional)

### ADR-001: Turbopack vs Webpack Default

**Decision Drivers:**
- Build performance (Turbopack 2-5x faster)
- Development HMR speed (Turbopack 10x faster)
- Compatibility with existing Shiki/WASM configuration

**Candidate Alternatives:**
- A: Accept Turbopack as default (recommended by Next.js 16)
- B: Explicitly configure Webpack via `--webpack` flag
- C: Conditional based on presence of unsupported features

**Stakeholders:** Development team

### ADR-002: Cache Components Adoption Timing

**Decision Drivers:**
- Complexity of retrofit vs greenfield adoption
- Plan 006 in-progress status
- Learning curve for explicit caching

**Candidate Alternatives:**
- A: Enable but don't use (future-ready)
- B: Defer entirely to post-Plan 006
- C: Adopt incrementally starting with new components

**Stakeholders:** Development team

### ADR-003: AI Agent Workflow Strategy

**Decision Drivers:**
- MCP enables real-time application state access for agents
- Multiple AI tools available (Claude Code, Copilot CLI, Cursor)
- Need consistent patterns across tools for team collaboration
- Future contributors should have optimal experience out-of-the-box

**Decision (from clarification):**
- **Primary tools**: Claude Code and GitHub Copilot CLI
- **Shared config**: `.mcp.json` for MCP servers (already configured)
- **Focus**: Diagnosis and validation workflows

**Candidate Alternatives (evaluated):**
- A: Claude Code primary with `.mcp.json` + project rules (comprehensive MCP support)
- B: Multi-tool support with shared `.mcp.json` and tool-specific rules ← **SELECTED**
- C: Cursor-first with `.cursor/rules/` and manual doc curling fallback
- D: Minimal setup - rely on MCP auto-discovery and agent defaults

**Stakeholders:** Development team, future contributors

### ADR-004: Agent Workflow Documentation Location

**Decision Drivers:**
- Discoverability for new contributors
- Proximity to related configuration files
- Maintainability alongside codebase evolution

**Decision (from clarification):**
- **Location**: Expand existing `docs/how/nextjs-mcp-llm-agent-guide.md`
- **Rationale**: Guide already exists with MCP fundamentals. Avoids fragmentation.

**Candidate Alternatives (evaluated):**
- A: `docs/how/ai-agent-development.md` (central how-to location)
- B: `apps/web/AGENTS.md` (co-located with web app)
- C: `.claude/README.md` + `.cursor/README.md` (tool-specific locations)
- D: Existing `docs/how/nextjs-mcp-llm-agent-guide.md` (already created, expand it) ← **SELECTED**

**Stakeholders:** Development team, future contributors

---

## Unresolved Research

**Topics:** None - comprehensive research conducted in-session

**Impact:** N/A

**Recommendation:** Proceed to clarification phase

---

*Specification Version: 1.2*
*Created: 2026-01-25*
*Updated: 2026-01-25 - Clarification session complete*
*Status: Ready for Architecture*
