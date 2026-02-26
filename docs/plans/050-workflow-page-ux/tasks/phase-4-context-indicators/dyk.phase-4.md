# DYK: Phase 4 — Context Indicators + Select-to-Reveal

**Generated**: 2026-02-26
**Context**: Phase 4 tasks dossier review

---

## Insights

### 1. computeRelatedNodes Pure Function for All Consumers (DECISION)

Build `computeRelatedNodes(selectedNodeId, allLines)` that returns structured relationships:
- `NodeRelationship { nodeId, relation: 'upstream'|'downstream', inputName, status }` 
- `relatedNodeIds: Set<string>` for quick lookup
- Handles all three InputEntry variants (available/waiting/error)
- **Consumers filter as needed**: dimming checks the Set, properties panel uses full array grouped by relation, future traces filter by status for color

### 2. Context Badge Needs Line Index (DECISION)

"Green for first on line 0" requires knowing the line index, not just node position within the line. Function signature: `computeContextBadge(node: NodeStatusResult, lineIndex: number)`. Canvas already knows line index from `lines.map()`.

### 3. Properties Panel Swap Is CSS Toggle, Not Unmount (DECISION)

Both toolbox and properties panel stay mounted. Toggle visibility with `display: none` / `display: flex` + brief opacity transition. Toolbox preserves search/scroll state when hidden. Back button or deselect shows toolbox again.

### 4. Zero New Server Actions — Pure Client Phase (AWARENESS)

Phase 4 needs no server calls. Everything renders from the already-loaded `GraphStatusResult`. Context badges, gate chips, related nodes, properties panel — all pure computation. Fastest phase to implement. Exception: T007 manual gate trigger deferred to Phase 5.

### 5. Gate Chip: Single Chip + Expandable Inline Gate List (DECISION)

Card shows first blocking gate as a chip. Click chip → inline accordion expands showing all 5 gates with pass/fail status (green checks for passing, colored icons for blocking). Only one card expanded at a time. Card grows taller in place, line container grows with it (flexbox items-stretch). Full gate list also always visible in properties panel.

If inline expansion feels too fiddly during implementation, fall back to "just show it in properties panel" and keep the card chip as single-gate only.
