---
record_kind: "retro"
harness_version: "0.13.0"
branch: "main"
repo: "git@github.com:AI-Substrate/chainglass.git"
created_at: "2026-08-08T01:32:44.748Z"
agent: "pij-disturbing-ox"
plan_id: "092-terminal-prompt-drawer"
schema_version: "1.2"
retro_id: "2026-08-08T01:32:44Z-pij-disturbing-ox-ph1"
started_at: "2026-08-08T00:43:00Z"
ended_at: "2026-08-08T01:32:00Z"
summary: "Phase 1 (drawer surface) of plan 092, run as a dd-builder dogfood with a copilot claude-opus-5 coder and a copilot gpt-5.6-terra cross-model reviewer. The phase itself landed clean — 231/231 tests, typecheck and lint green, approved after a mutation-verified Dim-0 pass. The environment signal was larger than the feature signal: two frictions blocked or reddened the run before a line of product code existed, both in the dd adoption path, and both are now confirmed in AI-Substrate/dd's own ledger after the dd o-prime independently re-derived them. A third, non-dd finding is the one worth carrying furthest: a cold validator caught a prescribed fix that could not work and a test that would have passed anyway, at plan stage, for the price of one subagent."
entries:
  - id: DL-003
    kind: difficulty
    description: "harness plan new in a consuming repo writes plan.dd.json and its task files, then cannot render or validate either: the builder/{plan,backpressure,execution-log,fence,review} schema packages ship only in harness-engineering's own .dd/schemas, not with the global harness CLI. All four documented discovery roots come back empty. Every dd-native /builder plan outside that one repo hits this on its first command."
    target: tooling
    severity: blocking
    workaround: "cp -R ~/substrate/harness-engineering/.dd/schemas/builder ./.dd/schemas/ — after which plan render, dd set and dd validate all work normally."
    suggested_encoding: "Seed the schema packages on `harness plan new` (stays inside the documented four-root precedence) rather than bundling a fifth root, which would change resolution order for every consumer."
    fp: "b9d68b8b782e"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-08-08T00:46:33.926Z"
  - id: DL-004
    kind: difficulty
    description: "Authoring a dd-native plan turns `just lint` RED and it cannot be fixed by formatting. biome format-checks docs/plans/**/*.dd.json, .dd/schemas/**, and the .flow-pair and .pij ledgers — 13 errors, none from product code. Hand-formatting loses to the generator: harness dd build rewrites the file its own way on the next mutation, so a formatted file is re-broken by the next legitimate dd write, and `dd build --check` would then fail instead. Two generators, one file, mutually exclusive outputs."
    target: tooling
    severity: degrading
    workaround: "Added docs/plans/**/*.dd.json, .dd/schemas/**, .flow-pair/**, .pij/** to biome.json ignores. Green across 1772 files."
    suggested_encoding: "The per-instance fix is an ignore glob; the CLASS fix is different and is the real finding. biome.json ALREADY ignored docs/plans/**/the-flow*.json — the class was hit, understood well enough to fix, then patched for one file pattern. dd's artifacts landed later in the same folder under the same generator discipline and were not covered. Encode the category, not the instance: a declared generator-artifact root or an in-file marker, so the ignore is ONE glob forever instead of every new generator rediscovering this on its first red gate."
    fp: "4e7219c73d0a"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-08T01:25:17.822Z"
  - id: WIN-001
    kind: win
    description: "A cold /validate-v2 subagent, given the plan and five load-bearing source claims to check rather than trust, confirmed all five to the exact line AND returned 2 HIGH findings that would each have cost a build-review cycle. The sharpest: the plan's prescribed Escape fix (React stopPropagation) could not work, because the overlay's listener is document-level bubble-phase and the toggle is a SIBLING of the drawer — and the test the plan specified would have passed anyway, since it fired Escape on a drawer node. A green that lies, caught before a line was written. The second: the parity test's source file is gitignored, so the check would have been red on every CI run from the moment it landed."
    target: plan
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T01:05:00Z"
  - id: WIN-002
    kind: win
    description: "The packet contract held under pressure. The coder hit 13 lint errors at its final gate, correctly identified that only 4 were its own, noticed one sat inside a path its packet marked FORBIDDEN, fixed its 4, and escalated the other 9 rather than either waving them off or reaching outside its fence to fix them. It also refused to trust its own green: it mutation-verified the Escape guard (capture -> bubble, 3 tests RED, restored) without being asked. A worker that stops at its boundary under pressure is worth more than one that fixes more."
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T01:22:00Z"
  - id: INS-001
    kind: insight
    description: "Asking a specialist fleet for hot tips returned five production constants that no amount of reading tmux's documentation would have produced — and the most valuable one inverted our test plan rather than adding to it: copilot swallows Enter while its pane is BACKGROUNDED, which is definitionally the state a browser-driven drawer operates in. Our default test posture (focused pane, single-line prompt, idle agent) is the one configuration in which every one of those failure modes is invisible. We would have tested it, gone green on all four, and shipped it broken."
    target: project
    disposition: plan
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-08T01:00:00Z"
  - id: COORD-001
    kind: coordination
    description: "The exchange with the pij o-prime paid in both directions and neither payment was planned. Their constants shaped our design; our question about one of them ('your daemon can afford a synchronous settle; a UI-attached sender cannot') exposed a defect they did not know they had, and chasing it surfaced a second one underneath — a harness-blind 300ms settle on their non-daemon path, where the per-harness table never reached. Filed as pij#159. The general lesson: a specialist's constants are true where they were measured, and the boundary they were measured at is worth asking about explicitly."
    target: coordination
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T01:15:00Z"
---

# Retro — plan 092 phase 1 (drawer surface), dd-builder dogfood

Phase 1 was the cheap part. The drawer, its rows, the shared-header toggle and capture-phase
Escape ownership landed in one delegation, 231/231 green, approved on a mutation-verified
Dim-0 pass by a different model than wrote it.

Everything expensive happened before the code.

**Two dd frictions blocked or reddened the run before any product code existed** (DL-003,
DL-004). Both are now confirmed in `AI-Substrate/dd`'s own friction ledger — not because they
were relayed, but because the dd o-prime independently re-derived each one and hit the same
walls in its own repo. Two fleets, two repos, identical failures.

**The narrow-patch shape in DL-004 is the finding worth keeping.** The ignore list already
held the evidence that this class recurs: someone hit it for the-flow's JSON and patched one
file pattern. dd's artifacts arrived later, in the same folder, under the same generator
discipline, and were not covered. The lesson had been learned about a *path* instead of about
the *category*. The next generator to land in `docs/plans/` hits it a third time.

**The validator earned its cost twice over** (WIN-001), and the thing it caught was not a bug
in the code — there was no code — but a bug in the *proof*: a prescribed fix that could not
work, paired with a test that would have passed regardless.

**The constants we were given only hold where they were measured** (COORD-001). Asking where
that boundary sat turned a borrowed number into a defect report, and the defect report turned
up a second defect underneath it. Our own response was structural rather than documentary:
one exported settle table, one consumer path, a second copy is a test failure — because their
two copies are exactly what drifted.
