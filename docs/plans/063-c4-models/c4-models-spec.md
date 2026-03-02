# C4 Architecture Diagrams — First-Class Support

**Mode**: Full

📚 This specification incorporates findings from [research-dossier.md](research-dossier.md)
🔬 Design decisions informed by [Workshop 001: C4 Design and Layout](workshops/001-c4-design-and-layout.md)

## Research Context

Research (8 subagents + external deep research) confirmed:
- **Mermaid v11.12.2** already installed with native C4 syntax (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`)
- **MermaidRenderer** handles C4 diagrams without modification — zero new rendering libraries needed for basic support
- **14 active domains** with contracts, boundaries, and composition provide all content needed for a complete C4 model
- **Rendering pipeline** (remark-mermaid → CodeBlock → MermaidRenderer) is extensible by design
- **15 prior learnings** from Plans 006, 041, 046, 055, 058 inform implementation approach
- **No `.github/instructions/` pattern** exists yet — this is a greenfield design opportunity using the official GitHub Copilot CLI instructions format

## Summary

Introduce first-class C4 architecture diagram support to Chainglass. This means:

1. **A complete multi-layer C4 model** of the Chainglass domain system (L1 System Context → L2 Containers → L3 Components per domain), stored as markdown files in `docs/c4/` with Mermaid C4 diagrams rendered in the existing viewer.

2. **Best-practice C4 design principles** codified in `.github/instructions/c4-authoring.instructions.md` with `applyTo` scoping, using the official GitHub Copilot CLI instructions pattern for automatic agent discovery.

3. **Navigable layer drill-down** via cross-referenced markdown links, allowing developers and AI agents to zoom from system overview down to individual domain internals.

4. **C4 diagram rendering in the preview system** — leveraging Mermaid's native C4 support through the existing MermaidRenderer with no code changes for basic functionality.

The C4 model serves as the **architecture alignment tool** for both humans and AI agents navigating the codebase. It provides a standard, layered decomposition that complements the existing `domain-map.md` (contract wiring diagram) with proper C4 notation (architectural decomposition).

## Goals

- **G1**: Developers and AI agents can discover system architecture by navigating C4 diagrams at four zoom levels (Context → Container → Component → Code)
- **G2**: Every domain in the registry has a corresponding C4 Component diagram that links back to its `domain.md`
- **G3**: C4 design principles are documented and machine-discoverable via `.github/instructions/c4-authoring.instructions.md` so AI agents authoring diagrams follow consistent conventions
- **G4**: C4 Mermaid diagrams render correctly in the MarkdownViewer preview (dark and light themes)
- **G5**: The file layout mirrors the domain structure (`docs/c4/components/_platform/viewer.md` ↔ `docs/domains/_platform/viewer/domain.md`) for intuitive navigation
- **G6**: Cross-reference navigation links at the bottom of each C4 file enable layer-by-layer zoom in/out
- **G7**: The C4 model demonstrates that the domain system can be systematically decomposed for both human understanding and agent discovery

## Non-Goals

- **NG1**: Interactive click-to-zoom between C4 layers (this is a future Phase 3 feature using @xyflow/react; Phase 1 uses linked markdown)
- **NG2**: Auto-generation of C4 diagrams from source code or FlowSpace graph data
- **NG3**: Custom Shiki syntax highlighting grammar for C4/Structurizr DSL (standard Mermaid highlighting is sufficient)
- **NG4**: New rendering components or viewer types (the existing MermaidRenderer handles C4 natively)
- **NG5**: Structurizr DSL support (Mermaid C4 syntax is the chosen notation)
- **NG6**: L4 Code-level diagrams for every domain (on-demand only; domain.md Source Location tables are sufficient for most)
- **NG7**: Changes to the domain registry format or domain.md template (only adding a single C4 Diagram link line to each domain.md)
- **NG8**: Replacing `domain-map.md` — it coexists as the contract wiring view alongside C4's architectural decomposition view

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/viewer | existing | **consume** | MermaidRenderer renders C4 diagrams; MarkdownViewer provides preview mode. No changes needed. |
| file-browser | existing | **consume** | Browses `docs/c4/` files using existing file tree. No changes needed. |

### Notes

This feature is primarily a **documentation/content** effort. The C4 diagrams are standard Mermaid in markdown files — no new domains are created, no existing domains are modified. The viewer and file-browser consume C4 content through their existing contracts (MarkdownViewer, FileViewer).

The only code change is adding a reference to `.instruction.md` in `CLAUDE.md` for agent discoverability.

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=1, F=0, T=0 → Total P=2
- **Confidence**: 0.85
- **Assumptions**:
  - Mermaid C4 syntax renders correctly with the existing MermaidRenderer (high confidence — it's the same Mermaid library)
  - The `.instruction.md` + `applyTo` pattern is convention-only (no runtime enforcement)
  - All 14 domains have sufficient information in their domain.md for C4 Component diagrams
- **Dependencies**: None external. All rendering infrastructure exists.
- **Risks**:
  - Mermaid C4 theme styling may need tuning for dark mode (low — MermaidRenderer already handles themes)
  - Maintaining C4 diagrams in sync with domain changes requires discipline (medium — mitigated by Principle 8: "update in same PR")
- **Phases**:
  - Phase 1: Design principles + .instruction.md + file structure
  - Phase 2: L1 System Context + L2 Container diagrams
  - Phase 3: L3 Component diagrams (all 14 domains)
  - Phase 4: Cross-references, navigation, README hub, CLAUDE.md reference
  - Phase 5: Verification — render all diagrams in viewer, validate links

## Acceptance Criteria

### C4 File Structure

- **AC-01**: `docs/c4/README.md` exists and contains a navigation table linking to all C4 levels (L1, L2, L3, L4)
- **AC-02**: `.github/instructions/c4-authoring.instructions.md` exists with `applyTo: "docs/c4/**"` frontmatter and at least 8 design principles
- **AC-03**: `docs/c4/system-context.md` exists with a Mermaid `C4Context` diagram showing the Chainglass platform, developers, AI agents, and external systems (Git, filesystem)
- **AC-04**: `docs/c4/containers/overview.md` exists with a Mermaid `C4Container` diagram showing apps/web, apps/cli, and packages/shared
- **AC-05**: A `docs/c4/components/*.md` file exists for every active (non-deprecated) domain in `docs/domains/registry.md` (13 files, excluding `_platform/workgraph`), each containing a Mermaid `C4Component` diagram

### Cross-References and Navigation

- **AC-06**: Every L3 component file includes a cross-reference block linking to its corresponding `docs/domains/<slug>/domain.md`
- **AC-07**: Every C4 file ends with a Navigation section containing Zoom Out, Zoom In (if applicable), Domain, and Hub links
- **AC-08**: `docs/c4/README.md` quick links section lists all infrastructure domains and all business domains with working relative links

### Rendering

- **AC-09**: All Mermaid C4 diagrams (`C4Context`, `C4Container`, `C4Component`) render as visible SVG diagrams in MarkdownViewer preview mode (manual verification)
- **AC-10**: C4 diagrams render acceptably in both light and dark themes (no invisible elements, readable labels)

### Design Principles

- **AC-11**: `.github/instructions/c4-authoring.instructions.md` includes principles for: domain boundary mirroring, contracts on edges, progressive detail, actionable descriptions, one diagram per file, cross-reference requirement, navigation footer requirement, and sync strategy
- **AC-12**: `CLAUDE.md` contains a reference to `.github/instructions/c4-authoring.instructions.md` so AI agents discover C4 authoring rules
- **AC-17**: Every active domain.md file includes a "C4 Diagram" link pointing to its corresponding `docs/c4/components/` file (bidirectional cross-reference)

### Content Quality

- **AC-13**: L1 diagram includes at least: Developer (person), AI Agent (person), Web Application (system), CLI Tool (system), Git (external), Filesystem (external)
- **AC-14**: L2 diagram includes at least: apps/web, apps/cli, packages/shared with technology labels and relationship descriptions
- **AC-15**: Each L3 domain component diagram shows: components the domain owns (from domain.md Boundary), contracts exposed, and key internal relationships
- **AC-16**: L3 component diagrams use consistent node naming (domain slug as ID, display name as label, "React Client Component" / "Server Module" / etc. as technology)

## Testing Strategy

- **Approach**: Manual Only
- **Rationale**: Feature creates documentation files (markdown + Mermaid C4 diagrams) with no new application code. Visual verification of rendered diagrams is the appropriate quality gate.
- **Focus Areas**:
  - All Mermaid C4 diagram types (`C4Context`, `C4Container`, `C4Component`) render as visible SVG in MarkdownViewer preview
  - Diagrams render acceptably in both light and dark themes
  - Cross-reference links resolve correctly between C4 files and domain.md files
  - Navigation footer links work across all C4 files
- **Excluded**: Automated tests — no new code to test
- **Mock Usage**: N/A

## Documentation Strategy

- **Location**: `docs/c4/README.md` (navigation hub) + `.github/instructions/c4-authoring.instructions.md` (authoring principles)
- **Rationale**: The C4 file structure is self-documenting — README.md serves as both the entry point and the usage guide. The `.instructions.md` file uses GitHub's official path-specific instructions pattern (`applyTo` frontmatter) for automatic agent discovery by Copilot CLI, coding agent, and code review. No additional docs/how/ guide needed.

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mermaid C4 diagrams have rendering quirks in dark theme | Low | Low | Test early; tune MermaidRenderer theme config if needed |
| C4 diagrams drift from domain.md over time | Medium | Medium | Principle 8 requires same-PR updates; code review enforcement |
| `.instructions.md` pattern not picked up by all AI tools | Low | Low | Uses official GitHub `.github/instructions/` format — natively supported by Copilot CLI, coding agent, code review. CLAUDE.md reference as fallback for other tools. |
| 14 L3 diagrams are tedious to create manually | Low | Low | Domain.md provides all content; diagrams are mechanical translation. 13 active domains (deprecated workgraph excluded). |
| Mermaid C4 labels with `<br/>` don't render correctly | Low | Low | Already tested in domain-map.md; known working pattern |

**Assumptions**:
- Mermaid's C4 diagram types are stable in v11+ (they are — documented at mermaid.js.org/syntax/c4.html)
- The domain registry is current and complete (it is — maintained by plan commands)
- AI agents reading `.instruction.md` will follow YAML frontmatter conventions (progressive adoption)

## Open Questions

All open questions have been resolved during clarification:

- ~~**OQ-1**: Should L4 (Code) diagrams be auto-generated from FlowSpace graph data, hand-authored, or skipped entirely?~~ **RESOLVED**: Skip L4 entirely for now. Domain.md Source Location tables provide sufficient code-level documentation. Revisit if a domain's internals need visual documentation.
- ~~**OQ-2**: Can Mermaid C4 diagrams support `click` directives for in-diagram navigation to domain.md files?~~ **RESOLVED**: Deferred — test during implementation. If click directives work, add them as an enhancement. Navigation footer links are the primary mechanism.
- ~~**OQ-3**: Should container-level diagrams show individual domain boxes, or just the container boundary?~~ **RESOLVED**: Show domain boxes — this is the zoom bridge between L2 and L3.

## Workshop Opportunities

Workshops have already been completed for this feature:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| C4 Design Process and Layout | Storage Design + Integration Pattern | **Completed** | [workshops/001-c4-design-and-layout.md](workshops/001-c4-design-and-layout.md) |

Workshop 001 resolved: file layout, layer mapping, .instruction.md format, rendering approach (Mermaid Phase 1 / React Flow Phase 3), 10 design principles, exemplar diagrams, navigation pattern, and phasing strategy.

No additional workshops are needed before architecture.

## Clarifications

### Session 2026-03-02

| # | Question | Answer | Spec Updates |
|---|----------|--------|-------------|
| Q1 | Workflow Mode: Simple or Full? | **Full** — multi-phase plan with dossiers and all gates | Added `**Mode**: Full` to spec header |
| Q2 | Testing Strategy? | **Manual Only** — visually verify C4 Mermaid renders in MarkdownViewer preview | Added `## Testing Strategy` section |
| Q3 | Documentation Strategy? | `docs/c4/README.md` is sufficient — the C4 hub IS the documentation | Added `## Documentation Strategy` section |
| Q4 | Domain Review — consume-only correct? | **Confirmed** — no domain changes needed | No changes needed |
| Q5 | Include deprecated domains in L3? | **Skip deprecated** — 13 active domains only, excluding `_platform/workgraph` | Updated AC-05 count (14→13), updated risk table |
| Q6 | L4 Code-level diagrams? | **Skip entirely** — domain.md Source Location tables are sufficient | Resolved OQ-1, updated Open Questions |
