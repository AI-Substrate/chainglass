# Retrospective — Plan 086 In-browser Image Editor

**Date**: 2026-06-08 · **Mode**: Simple (single phase, 19 tasks) · **Flow**: `/plan-6-v2-implement-phase-companion`
**Companion**: `code-review-companion` (minih run `2026-06-08T07-32-46-663Z-5da5`) — 16 findings (8 HIGH, 8 MEDIUM)

---

## Companion Retrospective (code-review-companion)

**Summary**: Reviewed every Plan 086 commit boundary live, fired focused findings during implementation, ran a final drain sweep, and stopped on `idle_budget`. 16 findings centred on server-action save validation, worktree targeting, editor state isolation, conflict-reload semantics, test-evidence soundness, bundle-guard coverage, commit-message policy, and completion-status accuracy.

- **Worked well**: the inbox task protocol made commit-by-commit review straightforward; `ackOf` correlation tied each finding to its review request; the drain request enabled a final contract + worktree-status sweep.
- **Confusing / friction**: `state_transition` repeatedly failed with a generic schema error; `state_set` rejected the `stopping` status; `MINIH_PROJECT_ROOT`/`MINIH_OUTPUT_PATH` were not visible in the companion's shell (used literal paths from the prompt).
- **🪄 magicWand** (target: coordination): "Add a minih coordination command that prints the allowed state schema and current output path in one place, and make control:stop optional by letting the outside actor set an explicit idle budget visible to the inside agent."
- **Difficulties**: MH-001 (state_transition schema mismatch, degrading) · MH-002 (MINIH_* env vars absent, annoying) · MH-003 (promised control:stop didn't arrive within budget, degrading).

**Disposition**: 9 findings fixed in code (+tests), 2 addressed by honest scoping/ordering, 1 mitigated-by-gate, 4 acknowledged as process/handoff items for the squash-merge. Full table in `docs/plans/086-image-editor/execution.log.md`.

---

## Orchestrator Retrospective (plan-6 companion run)

**What surprised me**
- **OH-001** — The companion earned its keep. It caught two genuine **security** issues at the server-action boundary that the unit tests + the green browser smoke all missed: invalid `mode` falling through as an unconditional overwrite (F003), and an unknown/tampered `worktreePath` silently falling back to the main workspace root (F004). The happy-path smoke can't surface "fail-open on bad input" — adversarial review can.
- **OH-002** — My biggest real bug was **stale React state across files** (F005/F008): because the editor is inline and the file browser stays mounted, selecting another image while editing reused the component and could save the previous image's strokes onto the new file. Fixed by keying `BinaryFileView` on `filePath` + resetting on `imageSrc` change. A whole class of inline-editor bugs lives here.

**What broke / cost time**
- **OH-003** — The harness container uses a **named `cg_node_modules` volume** separate from the host. A host `pnpm add perfect-freehand` left the container 500-ing with `Module not found` until `docker exec … pnpm install`. *Lesson*: any plan that adds a dependency must re-install inside the container before the browser sensor will pass. (Worth a `just` recipe.)
- **OH-004** — OrbStack host↔container **filesystem sync lag**: after a burst of edits, turbopack in the container parsed half-written files and 500'd with phantom "Expected eof" errors on files that were complete on disk. `touch` + a short wait forced a clean re-read. *Lesson*: don't trust an immediate post-edit request against the container; settle first.

**What I'd change about my own process**
- **OH-005** — I flipped the flight-plan + ACs to "complete" **before** the companion's HIGH findings were resolved (the companion rightly flagged this, F015). Completion markers should trail the close of the review loop, not lead it. Next time: hold "complete" until findings are reconciled.
- **OH-006** — A git-add race (`git add docs/`) swept unrelated Plan 085 docs into a Plan 086 commit (F013). Stage explicit paths, never a directory, when a worktree carries multiple plans' WIP.

**Policy conflict surfaced (needs a human decision)**
- **OH-007** — My harness default says to append a `Co-Authored-By: Claude` trailer to commits; this repo's `AGENTS.md:167` **forbids** AI attribution (F007/F014). I deferred to the project rule and dropped the trailer from the fix commit (`c9c2acdf`) onward, but the 9 earlier Plan 086 commits still carry it. **Recommend normalizing at the squash-merge** (`/plan-8`), and aligning the harness default with the repo rule.

**Difficulty IDs**: OH-003 (config/harness), OH-004 (infra/sync), OH-005 (process), OH-006 (process/scope), OH-007 (policy conflict).
