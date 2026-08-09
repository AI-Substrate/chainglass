# Review packet — dlg-0002, plan 092 phase 2 (Send path)

**Reviewer**: pij-essential-warbler (copilot / gpt-5.6-terra) — cross-model; the coder was claude-opus-5.
**Return to**: pij-disturbing-ox.
**Repo**: /Users/jordanknight/substrate/chainglass, `main`, shared tree.
**Rubric**: `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/references/review-rubrics.md`.

## What this phase does

Delivers a saved prompt to the **coding agent** running in the tmux pane, via `tmux send-keys`.
Ruled by Jordan over a raw pty write, because the target is an agent TUI, not a shell.

Files: `server/send-prompt-keys.ts` (new), `server/terminal-ws.ts`, `hooks/use-terminal-socket.ts`,
`components/terminal-inner.tsx`, `components/terminal-singleton-provider.tsx`,
`components/terminal-pane-header.tsx`, `types.ts`, `index.ts` + 3 test files.

## The contract — READ THE WORKSHOP FIRST, IT IS LAW

`docs/plans/092-terminal-prompt-drawer/assets/workshops/001-send-keys-to-coding-agents.md`

Every constant in it was paid for by a production failure in the pij repo and **none of it is
discoverable from tmux's documentation**. Do not re-derive it, do not "improve" it, and **do NOT
grep the pij repo to check the numbers** — its CLI carries a stale harness-blind 300ms that would
convince you the workshop is wrong (pij#159).

Task rows + done-when: `assets/tasks/phase-2/tasks.dd.md`.
Backpressure rows: `assets/backpressure.dd.md` (bp-0005/0006/0008/0012/0013/0014/0015).

## Dim-0 is mandatory — and the coder set a high bar, so clear it

It reports **7 mutations**, each restored and diff-confirmed. **Re-run at least three yourself**,
including these two, and report the RED you actually saw:

- **drop the focus-in call** — should redden ~4 tests. This is the one that would ship broken:
  copilot swallows Enter while its pane is backgrounded, and a browser drawer is *by definition*
  driving an unfocused pane.
- **fold the Enter into the `-l` call** — should redden ~4 including a settle-ordering test.

A claimed verification is itself a claim. If you cannot reproduce one, that is CRITICAL.

## Hammer these specifically

1. **Two protection layers, both required.** argv (`execFileSync`, never a shell string) makes
   backticks / `$(…)` inert; tmux `-l` stops tmux key-name-parsing an embedded `Enter`. Different
   parsers. Verify BOTH exist and that a hostile payload — backticks, `$(…)`, quotes, semicolon,
   **leading dash**, the literal word `Enter` — arrives byte-identical. Saved prompts are a
   **stored-payload** surface: they are authored once and replayed later.
2. **Type and Enter are separate calls**, with the settle between, and **no trailing newline is
   ever typed**. A newline in an agent TUI is a submit.
3. **One settle constant.** `ENTER_SETTLE_MS` must be derived (`Math.max`) from the single
   exported table, not a restated literal. A second numeric settle literal anywhere in the feature
   is the defect — pij drifted exactly there. There is a source-scan test; check it actually scans.
4. **The settle must not block.** `execCommand` is `execFileSync` and the handler is async — the
   wait must be an awaited timer, not a busy-wait. The coder reports a synchronous variant **hung
   the test runner outright** under fake timers. Confirm the shipped path awaits.
5. **Multi-line uses bracketed paste** (`set-buffer` → `paste-buffer -p -d`), payload as ONE
   unflattened argv element, and buffer names must not collide between concurrent sends.
6. **No success signal.** Exit 0 is a lie (workshop §5). Verify the UI toasts on **failure only** and
   that nothing builds a success claim from a zero exit.
7. **`CONTROL_TYPES` in `use-terminal-socket.ts`** — a server control frame not in that whitelist is
   written into xterm as terminal data, i.e. raw JSON printed into the user's terminal. Verify
   `send-keys` is in it, and that an escaping throw inside the JSON.parse try cannot fall through
   to `pty.write`.

## Four coder decisions to adjudicate (it flagged these itself — say if any is wrong)

1. **No `--` before the payload** — workshop says argv + `-l` already covers a leading dash and `--`
   saves nothing.
2. **Trailing newlines stripped, not typed.**
3. **Success field named `delivered`, not `ok`** — so no UI can accidentally build a success claim.
4. **The sender does NOT steal focus** — unlike `handleSendText` (terminal-inner.tsx:508), because
   focusing xterm on every row click would hand the user's next Escape back to the terminal and
   break the drawer's capture-phase Escape (tk-0005).

## Out of scope

- Phase 3 (submit verification) — not written, by design. Absence of verification is NOT a gap.
- `terminal-prompt-drawer.tsx` — Jordan's design pass, untouched by phase 2.
- Two known pre-existing reds in `just test`, neither in 064-terminal: ENOTEMPTY from an
  `afterEach` `rmSync` (intermittent, ~47 files) and a latency-sensitive `flowspace-mcp` timeout.
  Anything of a **different** shape is ours.

## Forbidden

`the-flow.json` / `.md`, `.pij/**`, `government/**`, `pnpm-lock.yaml`, `.flow-pair/**`.
Never run `tmux capture-pane`. Never let a test tap a live tmux pane.

## Gates

Run all three to completion. **Redirect to files — never pipe**; a pipeline returns the last
command's exit code and that failure mode is always a false green. Report each exit code.

## Return shape

`VERDICT` (APPROVE / APPROVE_WITH_NOTES / FIX_REQUIRED) · Dim-0 evidence (the mutations you ran,
the RED test names you saw, confirmation of restore) · findings with severity + file:line.
Nothing found on a dimension → say so plainly. Do not invent findings; do not approve thin.

Wire discipline per pij `00-routing.md` § C10.
