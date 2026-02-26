# Flight Plan: Feature 2 — File Tree Quick Filter (v2 — ExplorerPanel)

**Plan**: [plan.md](../plan.md) (v2.0.0)
**Generated**: 2026-02-26
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: ExplorerPanel has a "Search coming soon" stub for blank-input mode. No file search exists. Users must expand directories manually or type exact paths.

**Where we're going**: Typing in the ExplorerPanel shows live file search results in the CommandPaletteDropdown — with git status badges, sort by mtime, and hidden file toggle. Powered by a cached file list with SSE delta updates.

---

## Stages

- [ ] **Stage 1: Services** — Install micromatch, create getFileList + fs.stat, create file-filter utilities, add server action (`T001-T004`)
- [ ] **Stage 2: Hook** — Create useFileFilter with cache + deltas + debounce + sort (`T005`)
- [ ] **Stage 3: UI + Wiring** — Extend ExplorerPanel props + keyboard, extend dropdown search mode, wire in BrowserClient (`T006-T008`)

---

## Checklist

- [ ] T001: Install micromatch
- [ ] T002: getFileList service + tests
- [ ] T003: fetchFileList server action
- [ ] T004: file-filter utilities + tests
- [ ] T005: useFileFilter hook
- [ ] T006: ExplorerPanel extension + tests
- [ ] T007: CommandPaletteDropdown extension + tests
- [ ] T008: BrowserClient wiring

---

## Acceptance Criteria

- [ ] AC-1 through AC-18 (see plan.md)
