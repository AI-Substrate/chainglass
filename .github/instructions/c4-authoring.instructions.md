---
applyTo: "docs/c4/**"
---

# C4 Diagram Authoring Principles

These principles govern creation and maintenance of C4 architecture diagrams in `docs/c4/`.
All diagrams use Mermaid's native C4 syntax and render in the existing MarkdownViewer preview.

## Principles

1. **Mirror Domain Boundaries** — C4 component boundaries MUST match domain boundaries from `docs/domains/<slug>/domain.md`. If a domain owns something, its C4 diagram shows it inside that domain's boundary. No reorganizing for aesthetics.

2. **Contracts on Edges** — Relationship labels reference actual contract names from the domain's Contracts table. Use what the code exposes: `Rel(fileBrowser, viewer, "Uses", "FileViewer, MarkdownViewer")` not `Rel(fileBrowser, viewer, "Displays files with")`.

3. **Progressive Detail** — Each C4 level adds detail without repeating the parent. L2 shows containers; L3 shows what's INSIDE a container. Don't redraw external systems at L3.

4. **Internal Relationships Only at L3** — L3 Component diagrams show relationships BETWEEN components within the same domain boundary. Cross-domain dependencies (e.g., viewer → file-ops) belong at L2 in `web-app.md` where the full domain topology is visible. **Why**: If every L3 diagram includes external arrows, each becomes a mini domain-map duplicating what L2 already shows. The value of L3 is understanding a single domain's internal structure — how its pieces fit together. External dependencies are documented in prose ("Depends on _platform/file-ops for IFileSystem") and in the domain.md's Dependencies section, not as diagram arrows. This keeps L3 diagrams focused and readable.

5. **Show Implementation Detail at L3** — L3 diagrams are signposts for our future selves. They MUST show internal implementation components (adapters, engines, managers, stores), not just the public contract surface. Include: internal classes, state machines, orchestration layers, factory patterns, internal data flow. **Why**: The domain.md Contracts table already shows the public API. L3's unique value is revealing HOW the domain works internally — the moving parts that someone debugging or extending the domain needs to understand. A viewer L3 shows MarkdownServer → CodeBlock → MermaidRenderer chain. A positional-graph L3 shows OrchestrationService → GraphOrchestration → ODS → ONBAS → PodManager orchestration flow. Sparse diagrams that only show interfaces are useless — show the guts.

5. **Actionable Descriptions** — Component descriptions state what it DOES (verb phrase), not what it IS. Good: "Renders syntax-highlighted code with line numbers". Bad: "A file viewer component".

6. **One Primary Diagram Per File** — Each `.md` file has exactly one primary Mermaid C4 diagram at a single level. Supplementary diagrams (sequence, state) are allowed for interaction detail.

7. **Cross-Reference Block Required** — Every L3 component file MUST include a reference block linking back to the domain definition:
   ```
   > **Domain Definition**: [domain.md](relative/path)
   > **Source**: `path/to/source/`
   > **Registry**: [registry.md](relative/path) — Row: Domain Name
   ```

8. **Navigation Footer Required** — Every C4 file ends with a Navigation section:
   ```
   ---
   ## Navigation
   - **Zoom Out**: [Parent Level](link)
   - **Zoom In**: [Child Level](link) _(if exists)_
   - **Domain**: [domain.md](link)
   - **Hub**: [C4 Overview](../README.md)
   ```

9. **Keep In Sync** — When a domain's contracts change, the corresponding C4 component diagram MUST be updated in the same PR.

10. **Infrastructure Before Business** — In diagrams showing both domain types, infrastructure domains appear in a labeled `Boundary(infra, "Infrastructure Domains")` before business domains in `Boundary(biz, "Business Domains")`.

11. **Use `<br/>` for Newlines** — Mermaid requires `<br/>` for multi-line labels. `\n` renders literally.
    ```
    Component(viewer, "Viewer", "Component", "Renders code,<br/>markdown, and diffs")
    ```

## C4 Levels

| Level | Mermaid Type | Shows | File Location |
|-------|-------------|-------|---------------|
| L1 | `C4Context` | System + external actors | `docs/c4/system-context.md` |
| L2 | `C4Container` | Deployable units | `docs/c4/containers/*.md` |
| L3 | `C4Component` | Domain internals | `docs/c4/components/**/*.md` |

## Node Naming Convention

- **ID**: Domain slug as Mermaid node ID (`viewer`, `fileBrowser`, `sdk`)
- **Label**: Domain display name (`"Viewer"`, `"File Browser"`, `"SDK"`)
- **Technology**: Component type (`"React Client Component"`, `"Server Module"`, `"Infrastructure Service"`)
- **External systems**: Use `_Ext` suffix (`System_Ext`, `Container_Ext`)
