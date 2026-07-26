# Builder-flow fixtures — hazard ledger

Plan 089 Phase 1, T002. **One ruled hazard per fixture.** Every row's rule comes from
`docs/plans/089-first-class-pij/references/flow-answers-for-chainglass-ui.md` (meadowlark's answers,
measured against the 0.12.0 binary) or from plan 089's C-09.

Documents are committed as `*.fixture.json` and materialized to the real `the-flow.json` name in an
OS temp dir at test time — see the header comment in `index.ts` for why.

| Fixture | Must classify as | Ruled hazard | Rule |
|---|---|---|---|
| `live-088` | `live` | The real 088 shape: **node ids are not a contract** (`ph1…ph6`, not `phase-N`), and **reviews are excursions** (`rv4`/`rv4b`/`rv4c` with `branch_of: ph4`), so a spine-only walk finds zero reviews. Also: `ph4` is entered twice, so activation counting must count re-entry. | Q2 corrections 1–2, Q7 item 8 |
| `no-bag` | `live` | `nav` has **no `bag`** — completion must fall back to the **terminal node's** status, never to the file set. | Q6 row 1, Q8 |
| `orphan-node` | `live` | An orphan node (`z1`, no edges) is placed into the chain **by array order** by both `rail` and `render` — an edge that does not exist. Walk `next[]` yourself. | Q7 item 7 |
| `tombstone` | `live` | A `the-flow.legacy.json` tombstone sits beside the live flow. **Ignore `*.legacy.*` entirely** — do not parse it, do not count its nodes, do not diff it against the live ones. | Q8 item 3 |
| `kitchen-sink` | `live` | The adversarial golden, copied from `harness/cli/test/services/flow/fixtures/render/kitchen-sink.json`: unknown node type (`weird-node-type`), **invalid status** (`mystery-status`) that is on disk because the schema is *not enforced on mutation*, HTML/pipe/brace injection and newlines in labels, multi-line `user_input`, and a **populated `agents[]`** that nothing in the real world populates. | Q7 item 6, Q2 `agents[]` |
| `legacy-e308` | `legacy` | Present but with **no `provenance`** — a genuine pre-CLI hand-cranked flow. Every `harness flow` verb refuses it with `E308`. Render "predates the flow CLI", never as an error and never as "no data". | Q6 row 2, Q8 |
| `corrupt-nav` | `corrupt` | `nav.now` names `phase-99`, which is not in `nodes[]`. `orient` errors `E305` rather than degrading to `node: null`. | Q6 footnote |
| `corrupt-json` | `corrupt` | The document does not parse. A reader must classify, not throw. | Q8 "tolerate any combination without crashing" |
| `untracked-work` | `untracked` | Artifacts (`*-plan.md`, `tasks/<phase>/`) with **no flow**. Two indistinguishable causes (predates the flow / built by direct-jump) and one honest label: *worked, not tracked*. | Q6 case 3a |
| `not-started` | `not-started` | An empty plan folder. A designed state, not an error, not a blank. The `.gitkeep` placeholder must **not** count as an artifact. | Q6 case 3b |

## Deliberately absent

- **No "opted out" fixture.** There is no opt-out marker in the data; it is indistinguishable from
  `not-started` by construction. A fixture would imply a signal that does not exist.
- **No `.the-flow-state.json` fixture used for state.** The file is a legacy resurrection hazard the
  current skill deletes on sight; its presence is a hint about schema era, never about progress.
