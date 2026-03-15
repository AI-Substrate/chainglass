# Execution Log: Fix FX001 — Combine window + copilot badges

## FX001-1: Merge badge rendering into combined cards
**Status**: Done

Rewrote `terminal-overlay-panel.tsx`:
- Removed `CopilotSessionBadges` import
- Added `useMemo` import, moved `formatTokens`, `getPctColorClass`, `formatModel` helpers inline
- Left-joined `windowBadges` + `copilotBadges` by `windowIndex` into `combinedBadges` via `useMemo`
- Replaced flat inline window badges with stacked `flex-col` cards:
  - Line 1: window index + name + label (11px, same as before)
  - Line 2: copilot details — model, effort, tokens, color-coded %, time ago (10px, only when present)
- Changed badge container from `items-center` to `items-start` for proper card alignment
- Removed the separate `<CopilotSessionBadges>` row with its `border-t`

## FX001-2: Delete CopilotSessionBadges component
**Status**: Done

Deleted `copilot-session-badges.tsx`. Confirmed no other files import it (only `terminal-overlay-panel.tsx` did, which was updated in FX001-1). The `use-copilot-session-badges` hook is still imported — it provides data to the merged rendering.

## FX001-3: Quality gates
**Status**: Done

- `pnpm biome check terminal-overlay-panel.tsx` — passes (fixed 2 formatting issues: whitespace consolidation, ternary simplification)
- `pnpm vitest run test/unit/web/features/064-terminal/` — 48/48 tests pass (6 files, including 5 copilot detector tests)
- `pnpm test` — 5549/5553 pass, 4 pre-existing failures in unrelated `positional-graph/inspect-format` tests
