# Feature 2 Specification Consistency Validation Report

Date: 2026-02-26  
Scope: `spec.md` + workshops `001/002/003` + `plan.md` + `tasks/tasks.md` + `tasks/tasks.fltplan.md` + `research-dossier.md`

---

## 1) Internal Spec Consistency

| Check | Status | Evidence | Findings |
|---|---|---|---|
| Acceptance Criteria numbering is sequential (no gaps/dupes) | **PASS** | `spec.md` L107-157 | ACs run 1→32 continuously, no duplicates. |
| Every Goal is covered by at least one AC | **PASS** | Goals: `spec.md` L33-47; ACs: L107-157 | Goal set maps to AC clusters (integration, results, matching, sorting, cache, hidden toggle, edge cases). |
| Non-Goals do not contradict Goals | **PASS** | Non-Goals: `spec.md` L52-60; Goals: L33-47 | Goals are filename search + cache + UX; Non-Goals exclude content search/fuzzy/URL persistence/LeftPanel changes without conflict. |
| Target Domains are internally consistent | **PASS** | `spec.md` L66-70, L227-229 | `file-browser` + `_platform/panel-layout` modified, `_platform/events` consumed; clarification table confirms same domain ownership. |
| Complexity assumptions are consistent with design | **WARNING** | `spec.md` L76-83, L95-99, L162-166 | Complexity marks Non-Functional as F=0 (L82) but risks explicitly include performance/bundle concerns (L96, L98, L162). This is manageable but internally mixed messaging. |
| Workshop references match existing docs | **PASS** | `spec.md` L5-8, L183-185; files `001/002/003` exist | All referenced workshops exist and statuses are declared. |

---

## 2) Spec vs Workshop 003 (UX Pivot) Alignment

| Check | Status | Evidence | Findings |
|---|---|---|---|
| Spec reflects ExplorerPanel integration pivot | **PASS** | Workshop 003: L22, L70-74; Spec: L25-27, L107-110 | Spec correctly moves search to ExplorerPanel + dropdown search mode. |
| Old LeftPanel/FilterInput/FilteredFileList remnants in spec | **PASS** | Workshop 003 removals: L184-189; Spec non-goal: L60; summary: L27 | No spec requirement for `filterSlot`, `FilterInput`, `FilteredFileList`, Portal overlay. |
| “Removed” items from Workshop 003 are removed from spec | **PASS** | Workshop 003 L184-189; Spec L57-60, L211-213 | `filter` URL persistence and LeftPanel changes are removed in spec; docs strategy also avoids extra artifacts. |
| “Added/modified” items from Workshop 003 are present in spec | **PASS** | Workshop 003 L108-141, L223-237; Spec L114-123, L132-143, L199-201 | Dropdown file rendering, toggles in dropdown header, keyboard delegation, and fallback handler-chain behavior are all represented. |

---

## 3) Spec vs Workshop 001 (Cache Architecture) Alignment

| Check | Status | Evidence | Findings |
|---|---|---|---|
| Spec references cache architecture correctly | **PASS** | Workshop 001 L33-36, L86-127; Spec L40-42, L138-143 | Spec correctly carries client-side cache + SSE-driven freshness model. |
| `CachedFileEntry { path, mtime, modified, lastChanged }` consistency | **WARNING** | Workshop 001 type: L67-75; delta add snippet: L151-152 / L345-347; Spec L138, L140-142 | Canonical type is consistent, but add-delta pseudo-code in Workshop 001 omits `mtime` on inserts; spec AC-22 also does not state how `mtime` is set for new files. |
| Delta strategy threshold consistency (≤50 delta, >50 full fetch) | **PASS** | Workshop 001 L170-174, L424-427; Spec L141 | Threshold behavior is consistent. |
| `fs.stat()` (not shell stat) reflected | **PASS** | Workshop 001 L208-210, L238-244, L263; Spec L138-139, L230 | Spec accurately requires fs.stat-derived mtime and avoids shell `stat`. |

---

## 4) Plan/Tasks vs Updated Spec Alignment (Gap Analysis)

| Check | Status | Evidence | Findings |
|---|---|---|---|
| Obsolete tasks still present (per Workshop 003 remediation) | **FAIL** | Workshop 003 remove list: L204-212; Plan tasks: T005/T006/T008/T009 at `plan.md` L66-71; Tasks dossier: L107-112 | Obsolete tasks remain: URL `filter` param, LeftPanel `filterSlot`, `FilterInput`, `FilteredFileList`/Portal path. |
| New pivot tasks missing | **FAIL** | Workshop 003 add list: L223-227; Plan/tasks currently omit these specific items | Missing explicit tasks to: (1) extend CommandPaletteDropdown search mode for live file results, (2) extend ExplorerPanel prop contract for file-search payload/callbacks, (3) update ExplorerPanel key delegation for search mode. |
| Plan acceptance criteria mismatch updated spec | **FAIL** | Plan ACs: `plan.md` L75-88; Spec ACs: `spec.md` L107-157 | Plan/flight/tasks AC set is old (14 ACs, LeftPanel/Portal/URL param model) and does not match updated 32-AC ExplorerPanel model. |
| Domain manifest needs pivot update | **FAIL** | Plan domain manifest `plan.md` L25-34; Spec domains L66-70 | Manifest still includes old artifacts (`filter-input.tsx`, `filtered-file-list.tsx`, `file-browser.params.ts` filter param, `left-panel.tsx` contract change). It should pivot toward ExplorerPanel/CommandPaletteDropdown-centric files. |

---

## 5) Cross-Document Contradictions

| Check | Status | Evidence | Findings |
|---|---|---|---|
| Workshop 001 vs Workshop 003 on URL-persisted filter | **FAIL** | Workshop 001 Q4 resolved “Yes URL param”: L505-507; Workshop 003 removed URL param: L187, L208-209 | Direct contradiction; spec follows Workshop 003. Workshop 001 should be amended/supersession-noted for this point. |
| Workshop 002 vs Workshop 003 UX model | **WARNING** | Workshop 002 LeftPanel/filter bar model: L21, L49-57, L447-452; Workshop 003 superseded note: L11 | Expected historical divergence, but still high confusion risk because 002 contains concrete implementation directives now invalid. |
| Workshop 001 includes manual refresh trigger not present in spec | **WARNING** | Workshop 001 L172, L427; Spec AC-20..24 (`spec.md` L138-143) | Architecture doc references manual refresh full re-fetch path; spec does not mention user/system trigger for manual refresh. Clarify whether removed or deferred. |
| Research dossier vs updated spec (major pivot mismatch) | **FAIL** | Research recommends LeftPanel + URL filter + overlay: `research-dossier.md` L110-119, L133, L215; spec says no LeftPanel mods / transient search: `spec.md` L27, L59-60 | Research is materially outdated relative to pivoted spec and should be marked superseded for UX/control-surface decisions. |
| Workshop 001 performance numbers internally inconsistent | **WARNING** | Workshop 001 L260-263 vs L468-469 | Benchmarks conflict (`~95ms` associated with different file counts). Not spec-breaking but weakens confidence in performance assumptions. |

---

## 6) Completeness Check

| Check | Status | Evidence | Findings |
|---|---|---|---|
| ACs have enough implementation detail | **WARNING** | `spec.md` L138-143, L153-156 | Gaps: no explicit rule for `mtime` on SSE `add`; non-git fallback says “depth-limited” but no depth value; context menu AC lists actions but not expected outcomes/error handling. |
| Risks sufficiently identified | **WARNING** | `spec.md` L162-166 | Good baseline risks exist, but missing explicit risk for large result-list rendering without virtualization and keyboard/interaction regressions in shared dropdown behavior. |
| Assumptions sufficiently identified | **WARNING** | `spec.md` L85-90, L166-167 | Missing assumptions around non-git recursion scale/depth, status-source consistency (`workingChanges` vs cache), and behavior when SSE reconnect is delayed/partial. |
| Testing strategy complete for pivoted design | **WARNING** | `spec.md` L191-205 | Strong unit focus is present, but add explicit integration coverage for Enter-fallback handler chain and accessibility/keyboard behavior across modes (`commands`, `symbols`, `search`). |

---

## Recommended Updates (Priority Order)

1. **Update plan.md, tasks.md, tasks.fltplan.md to match pivoted spec immediately**  
   - Remove obsolete tasks: `T005`, `T006`, `T008`, `T009` (Workshop 003 L204-212).  
   - Add new pivot tasks from Workshop 003 L223-227.  
   - Replace old AC list (14 items) with current spec AC set (32 items).

2. **Patch cross-doc contradictions to reduce implementation risk**  
   - In `001-file-scanner-cache-events.md`, annotate URL-persistence decision as superseded by Workshop 003.  
   - In `research-dossier.md`, add “superseded by UX pivot” note for LeftPanel/URL/Portal recommendations.

3. **Tighten spec completeness in three targeted clarifications**  
   - Define `mtime` handling for SSE `add` entries.  
   - Define explicit non-git recursion depth/default behavior.  
   - Define expected behaviors for context menu actions (success/failure handling).

4. **Harden testing plan for pivot-specific regressions**  
   - Add explicit integration test cases for search-mode key delegation and Enter fallback path.  
   - Add cross-mode non-regression checks ensuring `>` and `#` behavior remains unchanged.

---

## Summary Table

| Metric | Count |
|---|---:|
| total_checks | 27 |
| passed | 12 |
| failed | 6 |
| warnings | 9 |

