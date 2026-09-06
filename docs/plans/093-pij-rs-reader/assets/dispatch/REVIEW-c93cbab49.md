# Cross-model final review — plan 093, sha `c93cbab49`

**Verdict: APPROVE. No findings.**

D1, D2 and D3 are closed — two of them beyond what I asked for. The containment change is sound and
I judged it fully. The gate fix's claim holds by type exhaustion, and I converted its central
evidence from READ to RAN. I also correct one of my own numbers from the previous round.

**Reviewer**: pij-creative-chickadee (github-copilot/claude-opus-5, omp). **Checkout**:
`/Users/jordanknight/substrate/chainglass-093-review`, detached at `c93cbab49`. **Range**:
`f1b79236f..c93cbab49` (3 commits, 21 files). Nothing committed, pushed, or edited; two read-only
symlinks created and removed, main checkout untouched.

`RAN` = executed here, output read. `READ` = someone else's record.

---

## First: a correction to my own D2 number

I reported `identity-unverified` as the dominant rs focus refusal at **753 of 810**. **That number
was wrong**, and the error was mine, not the coder's.

My probe consulted the process table *before* the pane. The route does the opposite —
`resolveRsFocusWindow` runs `inspectPane` first, and only then reads `ps`. A corpse whose tmux pane
is also gone therefore never reaches the process classification at all; it refuses at `no-pane`,
which is a distinct and already-honest observation that predates D2.

RAN at this sha, replicating the route's **actual** order over the live roster:

| refusal | seats |
|---|---|
| would focus | **52** |
| `no-pane` | **763** |
| `process-gone` | **3** |
| `process-reused` | 0 |
| `pane-moved` | 0 |
| invalid recorded `proc_start` | 0 |

So the split D2 asked for is correct and worth having, but its user-facing footprint is far smaller
than I claimed: the dominant corpse refusal was never the ambiguous string. I over-stated the
severity. The fix stands on its own merits below.

---

## D1 — one corrupt parent link blanks the hierarchy. **CLOSED, better than asked.**

I asked for degrade-don't-throw. The fix does that **and** discloses the repair, which is the
Amendment 6 F3 idiom applied correctly rather than a silent fallback.

`rs-pij-records.ts:113-178`: a duplicate id keeps the first descriptor and is displayed as a root; a
cycle promotes its members to roots. Source `parent` fields are never rewritten — the node keeps its
link and only the *projection* changes, which is exactly the distinction the warning text states
("source parents unchanged"). Each repair appends a `structureWarnings[]` entry, plumbed
adapter → `PijTree` → `/api/pij/tree` → `TreeSnapshotData` → `usePijFleet` → the single
`pij-source-limitations` note in the rail. Collection-level, stated once, never per row.

I traced the algorithm by hand rather than trusting the tests:

- **A↔B**: inner `attach(A)` hits `visiting`, promotes both, returns without `attached.add`; each
  outer frame then routes its node to `roots` via `!promoted.has(id)`. Two roots, one warning, no
  recursion, no double-push.
- **Self-parent A→A**: same path, single-member cycle, `roots.push(A)`, no self-child loop.
- **Cycle with a tail (D→C→B→A→B)**: `visiting` is iterated in insertion order and promotion starts
  only at the repeated member, so **B and A** become roots while **C stays under B and D under C**.
  The comment — *"Only the repeated path's suffix is cyclic; descendants before it keep their
  links"* — is accurate, which is worth saying because that is the easy thing to get wrong.

`rs-pij-records.test.ts:337` covers the nastiest interaction (a cycle member that is *also*
duplicated); `:360` pins one-warning-per-duplicate and that unaffected links survive;
`routes.test.ts:311` pins that the route passes warnings through "without rewriting parents or
roles"; `pij-rail-view.test.tsx:198-237` pins that both warnings render in exactly one notice.

RAN, live, whole roster at this sha: **926 seats, 43 nested, 883 roots, `structureWarnings` absent**;
workspace scope 10 roots, no warnings. The repair path is test-covered rather than live-exercised
because the daemon's links are clean — which is the correct outcome, not a gap.

## D2 — one string for three observations. **CLOSED, with two improvements I did not ask for.**

`focus/route.ts` adds `process-gone`, `process-reused` and `pane-moved` with distinct observations
(`:133-150`), and `processBelongsToPane` becomes `processPaneRefusal` returning the reason rather
than a boolean (`:388-425`). `identity-unverified` survives strictly for evidence that could not be
read. The final pane re-check now reports `pane-moved` instead of the catch-all.

The two additions that are better than the request:

1. **`processStart` now validates the *recorded* stamp too** (`:469-471`). A garbage `proc_start`
   from the daemon reports `identity-unverified` — *evidence unreadable* — rather than
   `process-reused`, which would be a false accusation that another program took the pid. Asserting
   reuse now requires **both** stamps to be valid calendar values. That is the plan's own
   "the source cannot know" vs "the seat did not say" discipline applied to a third case, and it is
   the right instinct.
2. **A latent bug fixed in passing**: the old guard was `!month`, which catches `0` (unknown month
   abbreviation) but not `> 12`. Unreachable from the string path; **reachable** from the new numeric
   overload. Now `month < 1 || month > 12` with `year > 9999`. I checked the numeric decomposition
   against a real value: `20260906173412` → 2026-09-06 17:34:12. Correct.

RAN: 0 invalid recorded stamps across the live roster, so the new validation never false-positives
on real data.

## D3 — `maxBuffer` on the process read. **CLOSED.** `(command === 'ps' ? 32 : 1) * 1024 * 1024`,
matching `pij-records.ts`'s 32 MiB precedent, tmux still capped at 1 MiB, 3s deadline unchanged, and
`fence.test.ts` updated to pin the new shape.

---

## Containment (`c93cbab49`) — judged fully. Sound.

**The hole was real.** `workspace` flowed from the query string straight into
`isFolderInWorkspace(detail.cwd, workspace)`. An authenticated caller passing `workspace=/` satisfied
containment for **every seat on the machine** — focus-anything, with `tmux select-window` as the
effect. Correctly identified as pre-existing and correctly fixed here rather than deferred.

**The fix** (`route.ts:262-290`): the parameter must resolve to an **exact** registered workspace
root, or an **exact** worktree root from the owner's authoritative inventory. Anything else refuses
`unregistered-workspace` (400) before any seat or process read; registry failures refuse
`workspace-unreadable` (503).

What I checked, and what makes it hold rather than look like it holds:

- **Exact, not prefix.** `resolve()` is applied to both sides, so normalization is symmetric and a
  stored trailing slash matches a request without one. `/`, `/Users/fixture`, `/unregistered`, a
  prefix-sharing sibling, `${WORKSPACE}/src`, `${WORKSPACE}/..` and `.` all 400 — and the tests
  assert `deps.reads === []` and `deps.focus.calls === []`, so the refusal genuinely precedes every
  read. `${WORKSPACE}/..` covers traversal.
- **`resolveContext` is not trusted on its own.** The comment says it plainly — *"identifies the
  owner, not necessarily the most-specific tree"* — and the code re-verifies by exact path against
  `getInfo(slug).worktrees`. `focus-route.test.ts:757` proves a descendant with a valid owner context
  still 400s. That is the subtle failure this design had to avoid, and it avoided it deliberately.
- **Fail-closed in three places**, each with its own test: `list()` throwing, owner lookup throwing,
  inventory lookup throwing.
- **Re-checked per click**, not cached: `:801` de-registers between two calls and the second 400s.
- **Downstream uses the resolved root, never the raw param** — `:319` containment and `:322` the
  tree rung both read the normalized, authorized value.
- Order is auth → params → authorization → seat read, so an unregistered scope never reaches
  `nodeShow`, `ps` or `tmux`.

Two observations, neither a finding:

- `resolve()` does not canonicalize symlinks, so a symlinked equivalent of a registered root will
  400. That is a false **negative** — over-refusal, never over-permission — so the direction is safe.
  Worth one line in `domain.md` rather than code.
- `POST` now resolves `IWorkspaceService` from the DI container on every request; an unbootstrapped
  container would 500 rather than refuse. Pre-existing pattern (`getPijFlowWatcher` does the same),
  outside this change's blast radius.

---

## Gate fix (`3650a9619`) — the claim holds, and I ran the evidence

**"No production caller relied on `grep`→`auto`" is true by type exhaustion**, which is stronger than
a call-site sweep: `CodeSearchMode = 'grep' | 'semantic'`
(`_platform/panel-layout/types.ts:64`) is a closed two-member union, so
`mode === 'semantic' ? 'semantic' : 'text'` is total and no caller can be silently remapped. `fs2Mode`
is computed in exactly one place (`flowspace-mcp-client.ts:342`) and `auto` no longer appears
anywhere in the client. There is exactly **one** production caller —
`flowspace-search-action.ts:152` — reached from the file-browser panel, whose default mode is
`'grep'` (`use-flowspace-search.ts:63`).

So the honest description of the user-visible change is: **the panel's default search is now literal
text instead of fs2-chooses.** That is the intended correction — a literal grep request silently
becoming an embedding search was the bug — and since `auto ⊇ text` (the old integration comment says
auto "falls through to text matching"), pinning can only narrow, never fail where text would have
worked. The only thing lost is a conceptual phrase typed in grep mode accidentally returning semantic
hits, which is the defect and not a feature.

**RAN, and this is the part worth having.** The real fs2 integration suite skipped in my checkout
because `.fs2/graph.pickle` is an untracked 731 MB build artifact — the same build-state class as the
`apps/cli/dist` skip two rounds ago, not a code problem. I symlinked the main checkout's graph in,
ran it, and removed the links:

```
✓ test/integration/web/flowspace-mcp.integration.test.ts (2 tests) 11148ms
[flowspace-mcp] search ok { query: 'flowspaceMcpSearch', mode: 'text', results: 20, ms: 164 }
```

**2/2 pass**, cold 10.1s and warm 164ms against the coder's 13.8s / 167ms, and the server log proves
the wire mode is `text` for a grep request **against the real fs2 server**, not only the in-memory
fake. The fake pins the argument; this pins the behaviour.

---

## Gates — all RAN at `c93cbab49`

| Check | Result |
|---|---|
| `just typecheck` | exit 0, all 9 workspace tsconfigs |
| `just lint` | clean, 1,803 files |
| `pnpm vitest run test/unit/web/pij` | exit 0 — 35 files / **581 tests** |
| `pnpm vitest run` (full) | **546 passed / 9 skipped (555 files); 7,380 passed / 69 skipped (7,449); zero failures** |
| `test/integration/web/flowspace-mcp` (real fs2) | **2/2 pass** with the graph linked |

The coder's 7,386 vs my 7,380 is the same build-state delta explained in the previous two reviews
(`just fft` builds first and un-skips a file or two). Zero failures either way.

Live probes, read-only, no restarts, no writes, `--watch-pane` not run: rs tree through the
production adapter with a real git worktree resolver (926 seats, 43 nested, 0 structure warnings),
and the click-time identity classifier replicated in the route's true order against live `ps` and
`tmux display-message`.

---

## No findings — stated as one

I have nothing to file at this sha. What I ran to conclude that: the four gates above; the real fs2
integration suite; a live re-derivation of the refusal split in the route's actual order; a live tree
projection through the production adapter; and a hand trace of `parentForest` over three cycle
topologies rather than trusting its tests. The two things I could not do remain the two things this
plan has always been honest about — I did not load the page, and I did not run `--watch-pane`; the
page proof for `f1b79236f` is already on record at `63446a029` and is yours to extend.

Closing note, since this is the last review on 093: the pattern that produced every finding on this
plan, mine and the native reviewer's alike, was the same one each time — a fixture that agreed with
itself. Shared ids between two sources, a fake that yields on demand, a probe ordered differently
from the code it models (that last one was mine). The disjoint-ids rule you made standing is the
durable answer to the first two. The third is just a reminder that a reviewer's instrument needs the
same scrutiny as the code, and I got it wrong once here.
