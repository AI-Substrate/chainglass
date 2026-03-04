# C4 Architecture Diagrams — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-02
**Spec**: [c4-models-spec.md](c4-models-spec.md)
**Research Dossier**: [research-dossier.md](research-dossier.md)
**Workshop**: [workshops/001-c4-design-and-layout.md](workshops/001-c4-design-and-layout.md)
**Status**: COMPLETE
**Mode**: Full
**Complexity**: CS-2 (small)

## Summary

Create a complete multi-layer C4 architecture model of the Chainglass domain system as markdown files in `docs/c4/`. The model uses Mermaid's native C4 syntax (already installed, already rendering) across three zoom levels: L1 System Context, L2 Containers, and L3 Components (one per active domain). Design principles are codified in `.github/instructions/c4-authoring.instructions.md` using the official GitHub Copilot CLI path-specific instructions pattern. The only code change is a reference in `CLAUDE.md`. Domain.md files gain bidirectional links back to their C4 diagrams.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/viewer | existing | consume | MermaidRenderer renders C4 Mermaid diagrams in preview. No changes. |
| file-browser | existing | consume | Browses `docs/c4/` files via existing FileTree. No changes. |

No domains are created or modified. This is a documentation-only feature.

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `docs/c4/README.md` | — (docs) | internal | C4 navigation hub |
| `.github/instructions/c4-authoring.instructions.md` | — (root) | cross-domain | C4 authoring design principles (official GitHub instructions pattern) |
| `docs/c4/system-context.md` | — (docs) | internal | L1 System Context diagram |
| `docs/c4/containers/overview.md` | — (docs) | internal | L2 Container overview diagram |
| `docs/c4/containers/web-app.md` | — (docs) | internal | L2 Web Application detail |
| `docs/c4/containers/cli.md` | — (docs) | internal | L2 CLI Tool detail |
| `docs/c4/containers/shared-packages.md` | — (docs) | internal | L2 Shared Packages detail |
| `docs/c4/components/_platform/file-ops.md` | — (docs) | internal | L3 File Operations domain |
| `docs/c4/components/_platform/workspace-url.md` | — (docs) | internal | L3 Workspace URL domain |
| `docs/c4/components/_platform/viewer.md` | — (docs) | internal | L3 Viewer domain |
| `docs/c4/components/_platform/events.md` | — (docs) | internal | L3 Events domain |
| `docs/c4/components/_platform/panel-layout.md` | — (docs) | internal | L3 Panel Layout domain |
| `docs/c4/components/_platform/sdk.md` | — (docs) | internal | L3 SDK domain |
| `docs/c4/components/_platform/settings.md` | — (docs) | internal | L3 Settings domain |
| `docs/c4/components/_platform/positional-graph.md` | — (docs) | internal | L3 Positional Graph domain |
| `docs/c4/components/_platform/state.md` | — (docs) | internal | L3 State domain |
| `docs/c4/components/_platform/dev-tools.md` | — (docs) | internal | L3 Dev Tools domain |
| `docs/c4/components/file-browser.md` | — (docs) | internal | L3 File Browser domain |
| `docs/c4/components/workflow-ui.md` | — (docs) | internal | L3 Workflow UI domain |
| `docs/c4/components/workunit-editor.md` | — (docs) | internal | L3 Work Unit Editor domain |
| `.github/instructions/c4-authoring.instructions.md` | — (root) | cross-domain | C4 authoring design principles (official GitHub instructions pattern) |
| `CLAUDE.md` | — (root) | cross-domain | Add C4 Architecture Diagrams section referencing instructions file |
| `docs/domains/*/domain.md` (13 files) | various | cross-domain | Add C4 Diagram link to each active domain.md (bidirectional cross-reference) |

**Totals**: 20 new markdown files + 1 new instructions file + 14 modified files (CLAUDE.md + 13 domain.md) = 35 file operations. All files are documentation — zero application code changes.

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | All 13 active domains have complete `domain.md` files with Purpose, Boundary, Contracts, Composition, and Source Location sections. No content gaps. | Proceed with mechanical translation to C4 Component diagrams. |
| 02 | High | `docs/c4/` directory does not exist yet. No existing C4 content anywhere in the codebase. | Create full directory structure in Phase 1. |
| 03 | High | No `.github/instructions/` directory or instruction files exist in the codebase. Using the official GitHub Copilot CLI path-specific instructions pattern guarantees native discovery by Copilot CLI, coding agent, and code review. | Create `.github/instructions/c4-authoring.instructions.md` with `applyTo: "docs/c4/**"` frontmatter in Phase 1. Reference from CLAUDE.md for non-Copilot tools. |
| 04 | High | MermaidRenderer uses `securityLevel: 'strict'` which disables Mermaid `click` directives. | Document as Phase 1 known limitation. Click navigation is deferred (NG1). Standard C4 diagrams render fine — `strict` only blocks JS execution in SVG. |
| 05 | High | Relative markdown links in MarkdownViewer preview may not navigate within the web app. Links like `../../domains/viewer/domain.md` render as text but may not resolve to file browser paths. | Not a blocker — cross-reference links serve AI agents reading files directly and humans browsing the repo. Navigation between C4 files uses the file browser tree. |
| 06 | High | CLAUDE.md has no section for documentation architecture or C4. Need to add a dedicated section referencing `.github/instructions/c4-authoring.instructions.md`. | Create "C4 Architecture Diagrams" section in CLAUDE.md after the Architecture section. |
| 07 | High | Cross-references are one-directional (C4 → domain.md). Domain.md files don't link to their C4 diagrams, making C4 undiscoverable from the most-read documentation. | Add a "C4 Diagram" link to each domain.md header block in Phase 4 (bidirectional linkage). |
| 08 | Medium | 13 L3 component diagrams created sequentially risk consistency drift (node naming, relationship labels, boundary styles). | Create a literal copy-paste template with TODO placeholders before Phase 3 starts. |

## Constitution Compliance

This plan is **documentation-only** — no application code, services, interfaces, or tests are created. Constitution principles that don't apply:

| Principle | Applicability | Notes |
|-----------|--------------|-------|
| P1: Clean Architecture | N/A | No code dependencies created |
| P2: Interface-First | N/A | No interfaces created |
| P3: TDD | N/A | No testable code; manual verification per spec |
| P4: Fakes Over Mocks | N/A | No tests |
| P5: Fast Feedback | N/A | No build/test cycle |
| P6: Developer Experience | **Applies** | `docs/c4/README.md` hub makes C4 discoverable |
| P7: Shared by Default | N/A | No code to share |

No constitution deviations required.

---

## Phases

### Phase 1: Foundation & Design Principles

**Objective**: Create the `docs/c4/` directory structure, design principles, navigation hub, and CLAUDE.md reference.
**Domain**: None (documentation infrastructure)
**Complexity**: CS-1
**Delivers**: AC-01, AC-02, AC-08, AC-11, AC-12
**Depends on**: None
**Key risks**: `.instruction.md` pattern is new — ensure format is clear and self-documenting.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `.github/instructions/c4-authoring.instructions.md` with 10 design principles from Workshop 001 Part 6 | — | File exists at `.github/instructions/c4-authoring.instructions.md` with `applyTo: "docs/c4/**"` YAML frontmatter and principles covering: domain boundary mirroring, contracts on edges, progressive detail, actionable descriptions, one diagram per file, cross-reference requirement, navigation footer, sync strategy, infrastructure-before-business, `<br/>` for newlines | Official GitHub Copilot CLI path-specific instructions pattern. Per Workshop 001. |
| 1.2 | Create `docs/c4/README.md` navigation hub | — | File contains: navigation table (L1, L2, L3), quick links for all 10 infrastructure domains and 3 business domains, links to instructions file and domain registry | Per Workshop 001 Part 7 |
| 1.3 | Add "C4 Architecture Diagrams" section to `CLAUDE.md` | — | CLAUDE.md contains a new section referencing `.github/instructions/c4-authoring.instructions.md` for AI agent discovery of C4 authoring rules | Per Finding 06. Add after "Architecture" section (line 68), before "Critical Patterns" (line 70). |
| 1.4 | Create directory structure: `docs/c4/containers/`, `docs/c4/components/_platform/` | — | Directories exist for subsequent phases | Prerequisite for Phase 2-4 |

### Phase 2: L1 System Context & L2 Containers

**Objective**: Create the top two C4 levels — system overview and container decomposition.
**Domain**: None (documentation content)
**Complexity**: CS-1
**Delivers**: AC-03, AC-04, AC-07 (partial), AC-13, AC-14
**Depends on**: Phase 1
**Key risks**: None — exemplar diagrams already designed in Workshop 001 Part 5.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `docs/c4/system-context.md` with L1 `C4Context` diagram | — | Diagram includes: Developer (person), AI Agent (person), Web Application (system), CLI Tool (system), Git (external), Filesystem (external). Relationships labeled with interaction descriptions. Navigation footer present. | Per Workshop 001 exemplar |
| 2.2 | Create `docs/c4/containers/overview.md` with L2 `C4Container` diagram | — | Diagram includes: apps/web (Next.js 16, React 19), apps/cli (Node.js, Commander.js), packages/shared (TypeScript). Technology labels and relationship descriptions present. Navigation footer present. | Per Workshop 001 exemplar |
| 2.3 | Create `docs/c4/containers/web-app.md` with L2 detail for Web Application | — | Shows Web Application container with domain groupings (Infrastructure Boundary, Business Boundary) as overview bridge to L3. Links to each domain's L3 component file. Navigation footer present. | Zoom bridge between L2 and L3 |
| 2.4 | Create `docs/c4/containers/cli.md` with L2 detail for CLI Tool | — | Shows CLI container with command groups (workflow, template, agent, etc.). Navigation footer present. | |
| 2.5 | Create `docs/c4/containers/shared-packages.md` with L2 detail for Shared Packages | — | Shows shared package exports (interfaces, fakes, adapters). Navigation footer present. | |

### Phase 3: L3 Component Diagrams — Infrastructure Domains

**Objective**: Create C4 Component diagrams for all 10 infrastructure (_platform/*) domains.
**Domain**: None (documentation content)
**Complexity**: CS-2
**Delivers**: AC-05 (partial — 10 of 13), AC-06 (partial), AC-07 (partial), AC-15, AC-16
**Depends on**: Phase 2
**Key risks**: Largest phase by file count (10 files). Each is mechanical translation from domain.md. Per Finding 01, all domain.md files have complete content.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.0 | Create L3 component file template with TODO placeholders | — | A literal copy-paste template file exists (in plan tasks dir or inline in dossier) with `{DOMAIN_NAME}`, `{DOMAIN_SLUG}`, `{RELATIVE_PATH}`, `{SOURCE_PATH}` placeholders for the cross-reference block, C4Component diagram skeleton, and navigation footer | Per Finding 08. Ensures consistency across 13 files. Based on Workshop 001 Viewer exemplar. |
| 3.1 | Create `docs/c4/components/_platform/file-ops.md` | — | `C4Component` diagram showing IFileSystem, IPathResolver. Cross-reference to `docs/domains/_platform/file-ops/domain.md`. Navigation footer. | Read domain.md for content |
| 3.2 | Create `docs/c4/components/_platform/workspace-url.md` | — | `C4Component` diagram showing workspaceHref, paramsCaches. Cross-reference + nav footer. | |
| 3.3 | Create `docs/c4/components/_platform/viewer.md` | — | `C4Component` diagram showing FileViewer, MarkdownViewer, DiffViewer, CodeBlock, MermaidRenderer, ShikiProcessor, detectLanguage, detectContentType. Cross-reference + nav footer. | Per Workshop 001 exemplar |
| 3.4 | Create `docs/c4/components/_platform/events.md` | — | `C4Component` diagram showing ICentralEventNotifier, ISSEBroadcaster, useSSE, FileChangeHub, toast(), Toaster. Cross-reference + nav footer. | |
| 3.5 | Create `docs/c4/components/_platform/panel-layout.md` | — | `C4Component` diagram showing PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader, BarHandler. Cross-reference + nav footer. | |
| 3.6 | Create `docs/c4/components/_platform/sdk.md` | — | `C4Component` diagram showing IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService, IKeybindingService. Cross-reference + nav footer. | |
| 3.7 | Create `docs/c4/components/_platform/settings.md` | — | `C4Component` diagram showing Settings Page, SettingControl, SettingsSearch. Cross-reference + nav footer. | |
| 3.8 | Create `docs/c4/components/_platform/positional-graph.md` | — | `C4Component` diagram showing IPositionalGraphService, IOrchestrationService, IEventHandlerService, IWorkUnitService, ITemplateService, IInstanceService. Cross-reference + nav footer. | |
| 3.9 | Create `docs/c4/components/_platform/state.md` | — | `C4Component` diagram showing IStateService, useGlobalState, useGlobalStateList, GlobalStateProvider, StateChangeLog. Cross-reference + nav footer. | |
| 3.10 | Create `docs/c4/components/_platform/dev-tools.md` | — | `C4Component` diagram showing StateInspector, useStateInspector, useStateChangeLog. Cross-reference + nav footer. | |

### Phase 4: L3 Business Domains & Navigation Polish

**Objective**: Create C4 Component diagrams for 3 business domains and ensure all navigation links are complete and consistent.
**Domain**: None (documentation content)
**Complexity**: CS-1
**Delivers**: AC-05 (complete — 13 of 13), AC-06 (complete), AC-07 (complete), AC-08 (verify), AC-17
**Depends on**: Phase 3
**Key risks**: None.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Create `docs/c4/components/file-browser.md` | — | `C4Component` diagram showing Browser page, FileTree, FileViewerPanel, WorkspaceContext, code editor, file actions. Cross-reference to `docs/domains/file-browser/domain.md`. Navigation footer. | |
| 4.2 | Create `docs/c4/components/workflow-ui.md` | — | `C4Component` diagram showing Workflow editor, Canvas, Toolbox, Properties, Doping system. Cross-reference + nav footer. | |
| 4.3 | Create `docs/c4/components/workunit-editor.md` | — | `C4Component` diagram showing Unit list page, Editor page, Agent/Code/Input editors, Creation modal, Auto-save. Cross-reference + nav footer. | |
| 4.4 | Add "C4 Diagram" link to all 13 active domain.md files | various | Each domain.md has a line in its header block: `**C4 Diagram**: [components/{slug}.md](relative/path)` linking to its corresponding C4 component file. Bidirectional cross-reference with AC-06. | 10 infrastructure domain.md + 3 business domain.md = 13 edits |
| 4.5 | Verify all navigation footers across all C4 files | — | Every C4 file (20 files) ends with Navigation section: Zoom Out, Zoom In (if applicable), Domain (if L3), Hub link. All links resolve correctly. | Walk every file, verify footer format and link targets |
| 4.6 | Verify `docs/c4/README.md` quick links | — | All 13 domain links in README.md point to existing component files. All container links work. No broken relative paths. | |

### Phase 5: Rendering Verification

**Objective**: Manually verify all C4 Mermaid diagrams render correctly in MarkdownViewer preview.
**Domain**: _platform/viewer (consume — manual verification only)
**Complexity**: CS-1
**Delivers**: AC-09, AC-10
**Depends on**: Phase 4
**Key risks**: Mermaid C4 theme styling in dark mode (low risk per Finding 04).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Start dev server (`just dev`) and open file browser | _platform/viewer | Dev server running, file browser navigable to `docs/c4/` | |
| 5.2 | Verify L1 `C4Context` diagram renders in light + dark themes | _platform/viewer | `docs/c4/system-context.md` preview shows visible SVG with readable labels in both themes. All persons, systems, and relationships visible. | |
| 5.3 | Verify L2 `C4Container` diagram renders in light + dark themes | _platform/viewer | `docs/c4/containers/overview.md` preview shows visible SVG with readable labels in both themes. Container boundaries, technology labels, and relationships visible. | |
| 5.4 | Verify L3 `C4Component` diagrams render (spot check 3 domains) | _platform/viewer | Check viewer, file-browser, and positional-graph component files. All show visible C4Component SVG with component boxes, relationships, and labels in both themes. | Spot check 3 of 13 — if these work, the others will too (same Mermaid C4 syntax) |
| 5.5 | Document any rendering issues and workarounds | — | If issues found: document in plan as discoveries. If theme tuning needed: note specific changes required. If no issues: mark AC-09 and AC-10 as passed. | |

---

## Acceptance Criteria

- [x] **AC-01**: `docs/c4/README.md` exists with navigation table (L1, L2, L3) — Phase 1
- [x] **AC-02**: `.github/instructions/c4-authoring.instructions.md` exists with `applyTo: "docs/c4/**"` and 8+ principles — Phase 1
- [x] **AC-03**: `docs/c4/system-context.md` exists with `C4Context` diagram — Phase 2
- [x] **AC-04**: `docs/c4/containers/overview.md` exists with `C4Container` diagram — Phase 2
- [x] **AC-05**: 13 `docs/c4/components/*.md` files exist (one per active domain) with `C4Component` diagrams — Phase 3+4
- [x] **AC-06**: Every L3 file has cross-reference block to `domain.md` — Phase 3+4
- [x] **AC-07**: Every C4 file has Navigation footer (Zoom Out, Zoom In, Domain, Hub) — Phase 4
- [x] **AC-08**: README.md quick links list all domains with working links — Phase 1+4
- [x] **AC-09**: All C4 diagram types render as SVG in MarkdownViewer preview — Phase 5
- [x] **AC-10**: C4 diagrams render in both light and dark themes — Phase 5
- [x] **AC-11**: `.github/instructions/c4-authoring.instructions.md` covers all 8 required principle areas — Phase 1
- [x] **AC-12**: `CLAUDE.md` references `.github/instructions/c4-authoring.instructions.md` — Phase 1
- [x] **AC-13**: L1 includes Developer, AI Agent, Web App, CLI, Git, Filesystem — Phase 2
- [x] **AC-14**: L2 includes apps/web, apps/cli, packages/shared with tech labels — Phase 2
- [x] **AC-15**: L3 diagrams show owned components, exposed contracts, relationships — Phase 3+4
- [x] **AC-16**: L3 diagrams use consistent naming (slug ID, display name label, technology) — Phase 3+4
- [x] **AC-17**: Every active domain.md has a "C4 Diagram" link to its component file — Phase 4

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mermaid C4 dark theme rendering quirks | Low | Low | Test in Phase 5; MermaidRenderer already handles theme switching |
| C4 diagrams drift from domain.md over time | Medium | Medium | Principle 8 in .instruction.md: update in same PR |
| `.instructions.md` not auto-discovered by all AI tools | Low | Low | Uses official GitHub `.github/instructions/` format — natively discovered by Copilot CLI, coding agent, code review. CLAUDE.md reference as fallback. |
| 13 L3 files drift in consistency | Medium | Medium | Template with TODO placeholders created in Phase 3 task 3.0 before any L3 files |
| 35 file operations across 5 phases | Low | Low | Mechanical translation from domain.md; template ensures consistency; phased delivery |
| Relative links in MarkdownViewer preview don't navigate | Medium | Low | Fix FX001 addresses this — adds link interception to MarkdownServer |

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX001 | 2026-03-02 | Intercept relative `.md` links in markdown preview to navigate file browser | _platform/viewer | Complete | User testing of C4 inter-level navigation |
| MermaidRenderer `securityLevel: 'strict'` blocks click directives | Low | Low | Deferred (NG1); standard C4 renders fine; only JS execution blocked |
| 21 file operations across 5 phases | Low | Low | Mechanical translation from domain.md; phased delivery reduces risk |
