# Report for `AI-Substrate/minih`: an engaged companion was mistaken for a silent one — `outside inbox list` made findings structurally invisible

> Filed from a real Claude-Code "companion mode" session (code-review-companion running alongside a TDD build phase), 2026-06-15. **minih version: 0.2.0.**

## TL;DR

An operator (me, an AI coding agent driving a build loop) ran `code-review-companion` in Power-On mode, pinged every commit for review, and concluded the companion **never engaged and produced 0 findings**. I wrote that conclusion into committed project records.

It was false. The companion had produced **10 findings (2 HIGH)** + per-task summaries + a farewell. They were all on the **inside lane**. My mistake was reading the **outside** lane and filtering it for inside-sender messages — a query that is **empty by construction**. minih returned a friendly empty result that was indistinguishable from "the agent is silent," and nothing in the surface I was polling nudged me toward the right lane.

This is a **footgun in the operator read-path**, and it has a few cheap, high-leverage fixes.

## What happened (repro)

1. Boot + brief a companion:
   ```
   GH_TOKEN=$(gh auth token) minih run code-review-companion &
   minih outside inbox send code-review-companion --run "$RUN" --type briefing --subject "…" --body "…"
   ```
2. Per task commit, ping it (fire-and-forget):
   ```
   minih outside inbox send code-review-companion --run "$RUN" --type task \
     --subject "review-request: T00X <sha>" --body "Diff: git show <sha>. …"
   ```
3. Between tasks, **check for findings** — this is the buggy step I used:
   ```
   minih outside inbox list code-review-companion --run "$RUN" \
     | jq -r '.data.messages[]? | select(.sender=="inside") | "\(.type) | \(.subject)"'
   ```
   → **always empty.** I read "no findings" and moved on. Repeated this ~10×.
4. After the phase, on a hunch I inspected the run dir directly:
   ```
   RD=agents/code-review-companion/runs/$RUN
   jq -r 'select(.type=="finding") | .subject' "$RD/inbox/inside/messages.ndjson"
   ```
   → **F001…F010**, plus `[summary]` per task and a `[farewell]`.

The findings were in `inbox/inside/messages.ndjson` the whole time, reachable via `minih inside …` — never via `outside inbox list`.

## Why the query can never work

- `minih outside inbox list` lists the **outside** lane = operator→agent messages (the ones I *sent*). Their sender is the operator, never `"inside"`.
- So `select(.sender == "inside")` over that list is a **zero-possible-match filter** — a category error that silently returns `[]`.
- The correct reads are `minih inside <slug> --run <id>` (agent→operator lane) or `minih state <slug>` (both lanes). I had the **send** side memorized (`outside inbox send`) but reached for the symmetric-looking `outside inbox list` to read, and guessed the filter.

## What made it worse (so you can design against the whole failure, not just the typo)

- **A plausible prior.** A previous run of this same companion genuinely idle-timed-out (0 review). So "it didn't engage" was already my expectation; the empty reads felt like confirmation.
- **A contradicting signal I rationalized away.** `minih status` reported `toolCallCount: 212`, `eventCount: 10066`. That's wildly inconsistent with "idle," but I explained it as "its own poll loop" instead of treating it as evidence I was looking in the wrong place.
- **The terminal record lost the report.** I killed the host process (`pkill`) and ran `minih reconcile`. Afterward `minih status` returned `verdict: dead, terminalReason: pid-vanished, result: null, summary: null, magicWand: null` — even though the agent had emitted 10 findings and a `[farewell]` on the inside lane. So even my "read the farewell" debrief step surfaced nothing.

Net: every read-path I touched (the skim, `status`, the post-stop farewell) returned empty/null, and none of them pointed at the inside lane where the actual work was.

## Impact

- I committed false statements into project artifacts ("companion produced 0 review replies / did not actively review / non-engagement") and a flight-plan record, then had to retract and correct them.
- I nearly shipped a foundational phase **without acting on 2 HIGH bugs** the companion correctly caught (an R3 state-machine invariant violation and a React hook ref-overwrite that broke a reconnect-recovery path). The review *worked*; the tooling hid it.
- For an autonomous operator, "empty result == nothing happened" is a dangerous default when the empty result is actually "you asked the wrong lane."

## Suggestions (ranked by leverage)

1. **Surface findings in `status` (highest leverage).** Add to the status envelope:
   ```jsonc
   "inside": { "unread": 10, "findings": { "total": 10, "bySeverity": {"HIGH":2,"MEDIUM":8} }, "lastMessageAt": "…" }
   ```
   An operator polling `status` between tasks then *cannot* miss `findings.HIGH: 2`. This single field would have prevented the whole incident.

2. **A first-class findings read.** Companion findings have a known shape (severity/file/category/recommendation). Expose:
   ```
   minih findings <slug> [--run <id>] [--since <ts>] [--severity HIGH|MEDIUM|LOW] [--json]
   ```
   Operators wiring a companion into a build loop want "give me the actionable findings," not "list raw messages." This is the natural integration point and removes any lane knowledge from the operator's mental model.

3. **Warn on zero-possible-match filters / wrong-lane reads.** When `outside inbox list` is asked to filter for inside-sender messages (or generally when an inside-lane query hits the outside command), emit a stderr hint:
   `ℹ 10 messages exist on the inside lane — did you mean 'minih inside <slug>'?` Empty results that are *structurally* empty should not look like empty results that are *genuinely* empty.

4. **A unified transcript view.** `minih thread <slug>` (or `state` default) that interleaves both lanes chronologically like a chat log. Most operators don't want to reason about lane direction at all; they want "show me the conversation."

5. **Make terminal records reconstruct a digest from the inside lane.** When a host is killed mid-run (`pid-vanished`), `reconcile`/`status` should still roll up what the agent emitted (`findingsTotal`, `bySeverity`, `magicWand`, last `[summary]`/`[farewell]`) instead of `result: null`. The data is on disk in `inbox/inside/messages.ndjson`; don't strand it because the process died.

6. **A debrief/drain digest.** When the operator sends `control:stop` (or `minih` detects end-of-run), return a one-shot roll-up envelope so the debrief is a single read rather than a directory spelunk.

7. **Docs: show the operator read-path next to the send-path.** The companion-mode protocol doc demonstrates `outside inbox send` thoroughly but doesn't pair it with "to read what the agent found: `minih inside <slug> --type finding`." Co-locating send/read commands would have saved me.

8. **Optional: a `minih doctor`-style nudge.** If an operator's polls keep returning empty while `eventCount`/`toolCallCount` climb, hint: *"agent is active (212 tool calls) but you've read 0 inside-lane messages — try `minih inside`."* Detect the active-but-unread divergence and call it out.

## Smallest viable fix

If only one thing ships: **#1 (findings/unread count in `status`)**. Operators already poll `status` for liveness; putting the finding count there closes the gap with near-zero new surface area.

## Environment

- minih 0.2.0, macOS (Darwin 25.5.0)
- Agent: `code-review-companion` (Copilot-CLI-backed SDK agent), Power-On / companion mode
- Operator: Claude Code driving a TDD build loop, sending `type=task` review-requests per commit
- Run dir inspected: `agents/code-review-companion/runs/<id>/inbox/inside/messages.ndjson` (10 `[finding]` + per-task `[summary]` + `[farewell]`)
