# Workshop 001 — sending keys to a coding agent through tmux

**Source**: `pij-continuing-ermine` (o-prime, AI-Substrate/pij), 2026-08-08, on Jordan's direction.
**Status**: AUTHORITATIVE. Every constant below came from `pij`'s live code, and every one was
paid for by a production failure. Do not contradict this document; do not re-derive it from
tmux's manual — none of it is discoverable there.

## Read this first — the part that will not drift

> **Our default test posture is the one configuration in which every bug below is invisible.**
> Focused pane, single-line prompt, agent idle. All four failure modes go green. Then it ships.
> **Test backgrounded, multi-line, busy, and hostile text FIRST.**

This sits above the constants deliberately, at `pij-continuing-ermine`'s own instruction: the
constants *will* drift — see the provenance warning below, where they already have, inside
their own repo — but the test-selection lesson does not.

**Why that posture is fatal here, stated as a rule** (ermine, after this plan shipped a near
miss): **every failure mode below is a property of the ENVIRONMENT, not of the code.** Backgrounded
or focused, multi-line or single, busy or idle, hostile or benign — a test that fixes the
environment at its most convenient value *cannot fail any of them*, no matter how carefully it is
written. Convenience and coverage point in opposite directions, and the default is convenience.

The fifth mode (§ 6) escaped for the neighbouring reason: a single-send test **cannot express**
the assertion. "Two concurrent sends to one pane produce two distinct messages" needs two sends
to be stateable at all.

## The precondition that travels with the settle — READ BEFORE USING § 2

**The settle in § 2 is only safe if sends to one pane are SERIALIZED, and the original guidance
shipped without that condition.** ermine's daemon satisfies it implicitly through a
single-threaded tick, so the code that *depends* on the precondition is not the code that
*establishes* it — and nothing fails when the two are separated. We separated them, correctly
following advice that was incomplete, and shipped an interleaving defect (§ 6). Filed as pij#224
against their own doctrine file `preconditions-travel-with-remedies.md`.

**The exposure scales with the settle.** Every millisecond that buys reliability on the *focus*
axis widens the interleave window on the *concurrency* axis. Both pieces of advice are
individually correct and jointly a hazard. This is not a tradeoff to tune: it is why the queue
must own the **whole** focus → type → settle → Enter sequence rather than just the Enter.

## Provenance — take the constants from THIS FILE, not from a grep

`pij` has **two** send-keys call sites and the per-harness table reached only one of them.
Their daemon (`adapters/daemon-tmux.ts:50`) carries the real numbers; their CLI's
`compact-self` (`cli.ts:532`) settles a hardcoded, harness-blind **300 ms** — so a `grep` of
their repo surfaces 300 and would lead you to conclude the 900 below is wrong. It is not.
Filed as pij#159.

Corollary for us: when we implement, the per-harness table lives in **one** exported constant
with **one** consumer path. Two copies is how theirs drifted.

## Why this is authoritative

Jordan ruled against the raw pty write and sent me to the seat that drives coding agents
through tmux for a living. These are its scars, not its opinions.

## 1. Shape — argv, `-l`, and two separate calls

```
tmux send-keys -t <target> -l <text>     # type
tmux send-keys -t <target> Enter         # submit — SEPARATE call
```

- `-l` is literal mode: no key-name lookup, so `Enter` / `C-c` / `Space` **inside the prompt
  text stay text**.
- **Never `-l "text\n"`.** The newline submits before your Enter — you get a submit plus a
  stray Enter into whatever renders next.
- **The protection that matters is argv, not `--`.** Use `execFile`-style argv; never build a
  shell string. Argv is what makes backticks, `$(…)`, quotes and semicolons inert, because no
  shell ever sees them. `-l` protects against *tmux* interpreting the text; argv protects
  against the *shell*. **Two layers, both required.**
- Leading dashes are safe with argv + `-l`. `--` is harmless but saves nothing — and if you
  are passing a shell string, `--` will not save you and nothing else will.

> **Security, not hygiene.** pij#128: their own documented quoted-body form executes shell
> substitutions in relayed text. A drawer of saved prompts is a **stored-payload surface** —
> a saved prompt containing `$(rm -rf …)` is the attack.

## 2. Timing — it races, and the delay is per-harness

Verbatim from `adapters/daemon-tmux.ts:50`:

```js
const ENTER_SETTLE_BY_HARNESS = { claude: 350, copilot: 900, codex: 350, pi: 350 }  // ms
```

Sleep that long between the `-l` type and the `Enter`. **Copilot needs ~2.6× the others** — it
was 350 for everyone until copilot messages began stranding in the composer.

**Do not trust the sleep alone.** Verify the submit: poll the pane after Enter and re-press
Enter only while the same payload is visibly still pending — 3 attempts, 250 ms apart.

**The payload is NEVER retyped after the first Enter.** An empty composer with inconclusive
telemetry is an ambiguous success, and at-most-once beats speculative replay. Retyping is how
you double-submit a prompt.

## 3. Multi-line — the one that bites

**A real newline in an agent TUI is SUBMIT.** Send a 5-line prompt with `-l` and you submit
five partial prompts.

**Use bracketed paste** — the receiver treats it as one atomic paste:

```
tmux set-buffer   -b <buf> <data>
tmux paste-buffer -p -d -b <buf> -t <target>    # -p = bracketed
```

This is the right answer **for a prompt drawer**, because a multi-line prompt should arrive as
multi-line text in the composer.

The alternative — flattening on `" ⏎ "` — is what pij does for *machine-generated* turns, and
it is **wrong for human-authored prompts**. (Their run-on arrived unreadable on first live use.)

**Do not refuse multi-line.** That pushes users to hand-paste into the terminal, which is the
same hazard with none of the controls.

## 4. Focus — copilot swallows Enter while backgrounded

Copilot **ignores Enter-as-submit while its pane is backgrounded.** With tmux `focus-events on`,
switching away sends copilot a focus-OUT (`CSI O`) and it swallows Return: text types into the
composer and strands. Operator-reported as *"stuck in the input box"*, reproduced live.

```
tmux send-keys -t <target> -H 1b 5b 49    # CSI I = focus-IN, BEFORE typing
```

**A SIGWINCH redraw does NOT fix it** — copilot gates submit on focus state, not render. They
tried; the WINCH survives only as a harmless secondary. Claude and codex do not exhibit it.

> **This is the finding that matters most here.** A browser-driven drawer is *definitionally*
> driving a pane the user is not focused on. Our case is worse than theirs.

## 5. What passes testing and then bites

- **All four failure modes above pass a manual test.** You will test focused, single-line,
  agent idle. **Test backgrounded first.**
- **"Delivered" is not "submitted."** `pty.write` returning true, or send-keys exiting 0,
  proves bytes moved — not that the agent accepted them. pij had to add composer polling
  because exit 0 was a lie. **A success toast on exit 0 will lie the same way.**
- **The agent may be mid-turn.** Typing into a busy agent queues into its composer and submits
  when it finishes — usually fine, occasionally lands the prompt in an unrelated context.
  Consider gating "paste + Enter" on idle.
- **Capture with `-J`** (`capture-pane -p -J`) or wrapped lines break any string match.

## The general warning, verbatim in effect

Every constant here is a defect scar and none is discoverable from tmux's docs — 350 vs 900 ms,
`CSI I` over SIGWINCH, at-most-once over retry, bracketed vs flatten. **Budget for finding one
or two they have not hit**, because a browser-driven pane the user is not looking at is a
harsher case than theirs.

Anything new we hit goes back to `pij-continuing-ermine` — their words: *"your failure is our
defect too."*

## 6. Concurrency — found here, not in pij (added 2026-08-09)

**Two rapid sends to one pane interleave unless the whole sequence is serialized.** A types and
parks on the settle; B arrives and types into the *same composer*; A's Enter then submits A+B as
one message to the agent.

- Unique paste-buffer names do **not** cover this. They stop `set-buffer` clobbering, which is a
  different race.
- The queue must wrap **focus-in → type-or-paste → settle → Enter**, keyed by target. Serializing
  anything smaller leaves the settle hole open, which is the defect verbatim.
- Keyed by **target**, not globally: a global lock also closes the race and additionally makes
  every pane wait ~900 ms behind every other, which no single-pane assertion notices.

Filed upstream as pij#224, which asks for a `sendToPane()` that owns the queue rather than a
constant that callers are trusted to sequence by hand.

**The test that hid it is the cautionary half.** A test named for concurrency, doc-commented as
guarding "a race the single-user manual test can never reproduce", was `await`-then-`await` —
sequential. Proven by mutation: with the queue deleted, the two real concurrency tests go red and
that test **stays green**. It was not merely unable to reproduce the race; it was a green light
pointed at the hazard, and it survived seven mutations, a Dim-0 pass, a cross-model review and an
orchestrator verification pass, because everyone read its name instead of its body.

**A test's name and doc comment are not evidence. Only the body is.**
