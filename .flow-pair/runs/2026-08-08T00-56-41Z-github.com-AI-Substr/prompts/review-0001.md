# Review packet — dlg-0001, plan 092 phase 1 (Drawer surface)

**Reviewer**: pij-essential-warbler (copilot / gpt-5.6-terra, high) — cross-model by design; the coder was claude-opus-5.
**Orchestrator**: pij-disturbing-ox. Return findings to it, not to Jordan.
**Repo**: /Users/jordanknight/substrate/chainglass, branch `main`, SHARED TREE (no worktree — Jordan's standing ruling).
**Rubric**: `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/references/review-rubrics.md` — 10 dimensions.

## What was built

Phase 1 of a terminal prompt drawer, **deliberately send-free**. Files:

- `apps/web/src/features/064-terminal/lib/terminal-prompts.ts` (new)
- `apps/web/src/features/064-terminal/components/terminal-prompt-drawer.tsx` (new)
- `apps/web/src/features/064-terminal/components/terminal-pane-header.tsx` (modified)
- `apps/web/src/features/064-terminal/components/terminal-split-pane.tsx` (modified)
- `apps/web/src/features/064-terminal/index.ts` (modified)
- `test/unit/web/features/064-terminal/terminal-prompt-drawer.test.tsx` (new, 23 tests)

## The contract it must satisfy

Source of truth, read these — do not take my summary as the spec:

- Plan: `docs/plans/092-terminal-prompt-drawer/plan.dd.md` (rev 2.0.0)
- Phase 1 tasks + done-when: `docs/plans/092-terminal-prompt-drawer/assets/tasks/phase-1/tasks.dd.md`
- Backpressure rows: `docs/plans/092-terminal-prompt-drawer/assets/backpressure.dd.md`
- **Workshop 001** (authoritative on send semantics): `docs/plans/092-terminal-prompt-drawer/assets/workshops/001-send-keys-to-coding-agents.md`

## Dim-0 is MANDATORY and is the reason you exist

The coder wrote its own tests, so green ≠ good. **Prove them non-vacuous yourself.** Do not accept the coder's claim that it already did — a claimed verification is itself a claim.

The coder reports it mutation-checked the Escape fix (flipping capture→bubble fails exactly 3 tests, then restored). **Re-run that mutation yourself** and report the actual RED output you saw, plus the restore. If you cannot reproduce it, that is a CRITICAL finding.

Then pick at least one more load-bearing guard and mutate it — the truncation boundary or the parser's loud-failure path are the obvious candidates.

Mutation method: break the guard in place, re-run `pnpm vitest run test/unit/web/features/064-terminal/`, confirm RED with the failing test names, restore, confirm GREEN. **Restore byte-identically.** A review that leaves the tree dirty is a failed review.

## Hammer these specifically

1. **The Escape fix (tk-0005) — the trap.** `terminal-overlay-panel.tsx:71-88` binds a document-level keydown in the **bubble** phase and closes the whole terminal on bare Escape. The drawer's toggle is a **sibling** of the drawer inside `TerminalPaneHeader`, so a React `stopPropagation` cannot work. Verify the implementation is a **capture-phase** document listener, that it is removed on close/unmount, and that the tests fire Escape from the **terminal** and the **toggle** — never from a drawer node. A test that fires Escape on a drawer node passes while the feature is broken. A cold validator already caught this once at plan stage.

2. **Send-free discipline.** Phase 1 must implement **no** delivery. Confirm `terminal-ws.ts` is untouched, no tmux call exists anywhere, and the row actions go through an injected callback. Confirm the submit intent is a **flag**, not a newline in the payload — workshop 001 §3: a real newline in an agent TUI is a SUBMIT.

3. **Both surfaces.** `TerminalPaneHeader` is shared by the floating overlay and the inline split pane (FX014/Plan 084 exists because they drifted before). Confirm the toggle reaches both, that no second control was added to either host, and that `terminal-split-pane.tsx` got a positioning context — without it the drawer anchors to the viewport.

4. **The parser.** `parsePromptList` must fail loudly rather than silently returning empty. Prove it.

5. **Singleton stability.** Opening the drawer must not remount `TerminalInner` or reconnect the websocket — tmux must only ever see one client.

## Out of scope — do not review, do not build

- Phases 2 and 3 (send path, submit verification). Not written yet, by design.
- The **file-reading parity test** (dw-0201/0202/0203) — deliberately deferred, blocked on an open question with Jordan about where the prompt list lives (`scratch/*` is gitignored at `.gitignore:152`). The coder tested the parser against an inline fixture instead. **Deferred, not forgotten** — do not file it as a gap; do flag it if the deferral was done badly.
- `biome.json` — my change, not the coder's.

## Forbidden paths — do not write

`.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.pij/**`, `government/**`, `pnpm-lock.yaml`, `.flow-pair/**` (this ledger).
Never run `tmux capture-pane`. Never let a test tap a live tmux pane.

## Gates

Run all three to completion, not first-fail:

```
pnpm vitest run test/unit/web/features/064-terminal/
just typecheck
just lint
```

## Return shape

Reply to `pij-disturbing-ox` with:

- **VERDICT**: `APPROVE` / `APPROVE_WITH_NOTES` / `FIX_REQUIRED`
- **Dim-0 evidence**: the exact mutations you made, the RED test names you actually saw, and confirmation of restore. Without this the verdict is unsatisfied and I will bounce it back.
- **Findings**: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, what is wrong, what would fix it.
- Nothing found on a dimension → say so plainly. **Do not invent findings to look thorough**, and do not approve with no evidence on a non-trivial diff — a thin verdict on a real change gets re-opened.

Wire discipline per pij `00-routing.md` § C10: first line is the verdict, then delta and ids, no restatement of this packet.
