---
record_kind: "retro"
harness_version: "0.13.0"
branch: "main"
repo: "git@github.com:AI-Substrate/chainglass.git"
created_at: "2026-08-09T00:20:00.000Z"
agent: "pij-disturbing-ox"
plan_id: "092-terminal-prompt-drawer"
schema_version: "1.2"
retro_id: "2026-08-09T00:20:00Z-pij-disturbing-ox-ph2"
started_at: "2026-08-08T01:33:00Z"
ended_at: "2026-08-09T00:20:00Z"
summary: "Phase 2 (send path) of plan 092. The feature work landed clean after one HIGH review finding. The dominant signal was again environmental, and this phase produced the sharpest instance of the whole plan's theme: a test that was GREEN IN THE PRESENCE OF THE DEFECT IT NAMED. Twelve observations drained. This drain was also fired LATE, after its node had already been flipped to done — recorded below as CONF-003 rather than quietly corrected."
entries:
  - id: CONF-003
    kind: confusion
    description: "I flipped observe-2 and retro-2 to `done` in the same command batch that departed phase-2, WITHOUT firing the drain and WITHOUT writing either receipt comment. The doctrine is explicit that a `done` harness chore with no receipt comment is treated as unsatisfied, and that terminalizing `observe` requires at least one real capture recorded on the node. I did the captures (twelve of them) but never receipted them, and I never ran the drain at all until I caught it one turn later. D5 forbids un-terminalizing, so the repair is this record plus append-only receipts — the ordering breach stays visible in the history rather than being tidied away."
    target: skill
    severity: degrading
    workaround: "Fired the drain immediately on noticing, wrote this record, and appended receipt comments to both nodes naming the out-of-order execution."
    suggested_encoding: "The status flip and the receipt want to be ONE operation, not two conventions an agent is asked to remember in the right order. A `harness flow receipt --node <id> --kind validation --text <...> --to done` that refuses to flip without a receipt would make this unrepresentable. Today the two calls are independent and only prose binds them, which is the same shape as every other finding in this plan: the discipline is real and the mechanism does not enforce it."
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-08-09T00:18:00Z"
  - id: DL-006
    kind: difficulty
    description: "A test that was GREEN IN THE PRESENCE OF THE DEFECT IT NAMED. `send.paste-buffers-do-not-collide` carried a concurrency name and a doc comment claiming it guarded 'a race the single-user manual test can never reproduce'; its body was await-then-await, i.e. sequential. Proven by mutation, by the coder and independently by me: with the per-session queue deleted — the exact defect — the two real concurrency tests go red and that test stays green. Its green is why the defect survived seven mutations, a full Dim-0 pass, a cross-model review and my own verification pass."
    target: project
    severity: degrading
    workaround: "Cross-model reviewer read the body rather than the name and found the underlying concurrency defect. Test renamed and re-documented rather than deleted; the real contract now lives in four new tests, one of which fails when the queue is removed."
    suggested_encoding: "Greppable structural guard, proposed by the coder and not built (out of task scope): any test whose NAME or DOC COMMENT matches race|concurrent|interleav* and whose BODY contains no Promise.all and no deferred promise is structurally incapable of what it claims. The general form is that a test's name and doc comment are not evidence; only the body is."
    fp: "dl006-green-at-hazard"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-08-09T00:05:00Z"
  - id: DL-005
    kind: difficulty
    description: "A whitelist that silently downgrades unknown control frames into terminal output. `use-terminal-socket.ts` carries CONTROL_TYPES; a server frame whose type is not in that Set falls through and is written into xterm AS TERMINAL DATA, so a new control frame nobody remembered to whitelist does not error — it prints raw JSON into the user's terminal. Silent, and visible only to the user, so the developer adding the frame never sees it."
    target: project
    severity: degrading
    workaround: "Coder added send-keys to the Set, documented why, and wrote a ws test asserting nothing reaches pty.write even when the runner throws — the send-keys branch sits inside the JSON.parse try and an escaping throw would fall through to pty.write(data)."
    suggested_encoding: "Fold the finding into phase 3's task notes so its verification frame inherits it rather than rediscovering it. Longer term the whitelist wants to fail loudly on an unknown control-shaped frame instead of treating it as pty data."
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-09T00:10:00Z"
  - id: DL-004
    kind: difficulty
    description: "`harness flow apply` set/upsert ops return status:ok while writing junk keys straight onto the node — no field allowlist (mergeInto). Twelve nodes in this flow carry stray `path`/`value` keys and one carries a whole `node` object. Consequence: phases 2-3 and review-3 had NO dd_link gate for hours while I believed they did, because the CLI said ok. The malformed op shape came from the upstream doc's own worked example."
    target: tooling
    severity: blocking
    workaround: "Correct op shape puts dd_link at the TOP LEVEL of the op. Repaired phase-2/3 and review-3, then PROVED the repair by departure refusal. Upstream as harness-engineering#135; the uncleaanble-dd_link half is #137."
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-08-08T23:50:00Z"
  - id: DL-003
    kind: difficulty
    description: "ENOTEMPTY teardown failures across ~47 test files are a RETRYABLE RACE, proven by controlled A/B: baseline fs.rmSync(tmp,{recursive,force}) failed 6/10; adding maxRetries:3,retryDelay:50 failed 0/10, Fisher p~0.011. Node's rm retries ENOTEMPTY only when maxRetries>0 and the default is 0."
    target: tooling
    severity: degrading
    workaround: "None applied here — 47 files is repo-wide and outside this stream's fence. Owned by pij-chief-roadrunner."
    suggested_encoding: "One shared tmpdir helper carrying the retry policy, rather than 47 option-literals — a declared boundary instead of 47 instances."
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-08-08T01:45:00Z"
  - id: DL-002
    kind: difficulty
    description: "A piped gate does not report the gate's exit code, and the substitute status is usually 0 — so the failure mode of that mistake is ALWAYS a false green and it cannot fail toward caution. I ran `just test 2>&1 | tail -25` and the harness recorded exit 0 for a run that exited 1."
    target: skill
    severity: degrading
    workaround: "Redirect gates to files and read the exit code directly. Instructed both peers; both adopted it."
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-08T12:10:00Z"
  - id: DL-001
    kind: difficulty
    description: "The repo test gate's colour is a property of build leftovers and load, not of the code. Five full runs on verified-unchanged teardown code produced 1, 2, 5, 2 and 0 failures — a range of 0 to 5 with nothing changing. The 0 is the most valuable entry because it is the one that would have ended the enquiry."
    target: tooling
    severity: degrading
    workaround: "Treat any single green from this suite as uninformative rather than reassuring; require a matched A/B in one session for any claim about it."
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T11:50:00Z"
  - id: INS-002
    kind: insight
    description: "Verification against the WRONG ARTIFACT can manufacture agreement, which is worse than not verifying. A peer checked my gate audit with jq against plan.dd.json; dd_link lives in the-flow.json. The clean zero would have read as a contradiction of a true claim — and the one dd_link string in plan.dd.json is my own warning text, so one step earlier it would have relayed my own words back as independent corroboration. Independent verification is only independent if the ARTIFACT is independent too."
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T23:30:00Z"
  - id: INS-003
    kind: insight
    description: "None of this plan's instrument failures was caught by care; every one was caught by an external disagreement nobody engineered. 'Be more careful' is therefore not a remedy. But the CATCH mechanism generalises: two actors computing the same claim from different artifacts or vantage points. That is engineerable, and the cross-model reviewer, the cold validator and the independent edge check are already it — not redundancy but MANUFACTURED DISAGREEMENT, whose value sits entirely in the runs where the answers differ. Corollary: a reviewer sharing the first actor's artifact, context or path buys cost and no disagreement channel."
    target: skill
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T23:45:00Z"
  - id: INS-004
    kind: insight
    description: "One confidence label covered two claims with different evidence. My friction report carried an OBSERVATION measured twice across two repos and a DIAGNOSIS resting on one probe; both went out as confirmed, so the diagnosis wore the observation's evidence. The asymmetry is what makes it dangerous: the cheap claim got verified repeatedly, the expensive one once."
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-09T00:00:00Z"
  - id: CONF-001
    kind: confusion
    description: "I treated a SCOPED test run as the repo gate and reported all gates green while `just test` was red the whole time. My own backpressure survey had inventoried both sensors and I selected the narrower one for the wider question."
    target: skill
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-08T12:00:00Z"
  - id: CONF-002
    kind: confusion
    description: "I called an intermittent failure deterministic from a SINGLE isolated run. Five runs gave 1/5; a later matched block gave 6/10. One observation cannot distinguish deterministic from ~50% flaky, and a single PASS would equally have licensed 'fixed'."
    target: skill
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-08T12:30:00Z"
  - id: WIN-003
    kind: win
    description: "The cross-model reviewer earned its seat. It found a HIGH concurrency defect — an unserialized send path where a 900ms settle leaves nearly a full second for a second submit to type into the same composer, so A's Enter submits A+B into a coding agent. Neither the coder's seven mutations nor my own verification pass found it, because the test that should have caught it was green."
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-09T00:05:00Z"
  - id: WIN-004
    kind: win
    description: "The independent phase-edge check found a defect no gate could see: bp-0007 still named the pre-ruling gitignored path after Jordan moved the file. The row was legitimately UNCHECKED, a valid state, so nothing could flag that its TEXT had gone stale. It also corrected my evidence upward on two acceptance criteria — citing shipped source lines rather than my hanging mutation, and a repo-wide scan plus the Math.max derivation property rather than my feature-scoped grep."
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-09T00:15:00Z"
---

# Retro — plan 092 phase 2 (send path)

The feature work was the smaller half. One HIGH review finding, fixed and mutation-proven twice.

**The headline is DL-006**, and it is the sharpest instance of this plan's whole theme. A test
named for a race, doc-commented as guarding a race, was `await`-then-`await` — and stayed
**green with the defect present**. It did not merely fail to catch the bug; it actively retired
the suspicion, and it survived seven mutations, a Dim-0 pass, a cross-model review and my own
verification because everyone read its name instead of its body.

**CONF-003 is mine and is recorded rather than tidied.** I flipped this very drain's node to
`done` before running it. The doctrine says a `done` chore without a receipt is unsatisfied; I
had done the captures and skipped the receipts. D5 forbids un-terminalizing, so the ordering
breach stays in the history. The encodable form is that a status flip and its receipt want to
be one operation — today they are two calls bound only by prose, which is the same shape as
every other finding here: the discipline is real and the mechanism does not enforce it.

**The through-line across both phases**, and the honest limit: every instrument failure in this
plan ended an enquiry rather than raising one, and not one was caught by care. They were caught
by disagreements nobody arranged. The remedy is not attention — it is arranging the
disagreements deliberately (INS-003), which this fleet was already doing before it had a name
for it.
