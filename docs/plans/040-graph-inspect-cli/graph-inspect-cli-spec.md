# Graph Inspect CLI Command

**Mode**: Full
**File Management**: PlanPak

📚 This specification incorporates findings from Workshop 06 (`workshops/06-graph-inspect-cli-command.md`), created during Plan 039 E2E shakedown.

## Research Context

- **Components affected**: `positional-graph.command.ts` (CLI registration), `positional-graph.service.ts` (new `inspectGraph` method), new formatter module
- **Critical dependencies**: Composes existing service methods — `getStatus()`, `getNodeStatus()`, `canEnd()`, `getOutputData()`, `loadGraphState()`
- **Modification risks**: `positional-graph.command.ts` is the CLI command hub (~2200 lines) — additive only. `positional-graph.service.ts` (~2500 lines) — new method, no changes to existing.
- **Link**: See `workshops/06-graph-inspect-cli-command.md` for full design with sample output

## Summary

The Chainglass workflow CLI has `cg wf status` for a compact dashboard and `cg wf node collate` for agent-facing input resolution, but no command that shows **everything**: node states, timing, input wiring, saved output values (data + files), and event history. During Plan 039 E2E testing, debugging required manually reading `state.json`, `data.json`, and `node.yaml` files across the workspace. A `cg wf inspect` command would replace this with a single command that dumps the complete graph state in human-readable or JSON format.

## Goals

1. **Full graph dump in one command** — `cg wf inspect <slug>` shows every node with status, timing, inputs, outputs (values + files), and event counts
2. **Output value visibility** — data values shown inline (truncated for long strings), file outputs shown with filename, size, and a 2-line text extract
3. **Multiple detail levels** — default (full dump), `--node <id>` (deep dive with full values + events), `--outputs` (data only), `--compact` (one line per node)
4. **Machine-readable output** — `--json` returns the complete inspection as structured JSON with full untruncated values
5. **Works for in-progress and completed graphs** — running nodes show elapsed time, pending nodes show what gate they're waiting on, failed nodes show the error

## Non-Goals

- **Real-time streaming** — this is a snapshot command, not a live watcher (use `cg wf run --verbose` for live output)
- **Modifying graph state** — inspect is strictly read-only
- **Session ID display** — session IDs are an ODS/PodManager concern (ADR-0012), not a graph-domain concept; may add to `--node` mode later
- **Output value search/filtering** — no `--grep` or value queries; pipe `--json` to `jq` for that
- **Web UI** — this is CLI-only; web inspect is a separate concern

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=2
  - S=1: Multiple files (service method, CLI command, formatter) but all additive
  - I=0: Internal only, composes existing service methods
  - D=0: No schema changes, reads existing data structures
  - N=0: Well-specified via Workshop 06 with complete sample output
  - F=0: Standard CLI output, no perf/security concerns
  - T=2: Full TDD with fakes, plus E2E validation against real advanced pipeline
- **Confidence**: 0.90
- **Assumptions**: Existing service methods provide all needed data; no new data access patterns required
- **Dependencies**: None — all building blocks exist
- **Risks**: Long output formatting could be tedious but is well-defined in workshop
- **Phases**: Multiple (Full mode, Full TDD, E2E validation)

## Acceptance Criteria

1. `cg wf inspect <slug>` outputs the graph topology header (reuses `formatGraphStatus`) followed by a per-node section showing unit, status, timing, inputs, and outputs
2. Output data values (from `save-output-data`) display inline: short values in full, strings > 60 chars truncated with `…` and char count
3. Output file values (from `save-output-file`) display with `→` arrow, filename, file size, and 2-line text extract (or `[binary]` for non-text)
4. `--node <id>` shows a single node with full (untruncated) output values, the complete event log with timestamps and stamp status, and the on-disk file listing
5. `--outputs` shows only output data grouped by node — truncated to 40 chars for scannability
6. `--compact` shows one line per node: glyph, nodeId, unit type, duration, output count, and context notes
7. `--json` returns the full inspection as JSON matching the `InspectResult` schema (all values untruncated, all events included)
8. In-progress graphs show running nodes with elapsed time and pending nodes with a waiting reason
9. Failed nodes show the error code and message
10. `cg wf inspect <slug>` with `--json` is parseable by `jq` (valid JSON, single root object)
11. Command registered as `cg wf inspect <slug>` with options `--node`, `--outputs`, `--compact` — consistent with existing `cg wf` command patterns

## Risks & Assumptions

- **Risk**: Large graphs with many outputs could produce very long default output — mitigated by truncation in default mode and `--compact` for quick overview
- **Risk**: File outputs referencing deleted files — display `(missing)` gracefully instead of crashing
- **Assumption**: `save-output-file` stores relative path `data/outputs/<filename>` as the value in `data.json` — verified in `positional-graph.service.ts:1624`
- **Assumption**: Events are stored in `state.json` per node — verified in E2E test state analysis

## Clarifications

**Q1 — Mode**: Full
**Q2 — Testing**: Full TDD
**Q3 — Mocks**: Fakes only, no mocks
**Q4 — Documentation**: `docs/how/` CLI usage guide with examples
**Q5 — node.yaml in --node mode**: Include raw node.yaml dump at the bottom for full transparency
**Q6 — E2E validation**: Run `just test-advanced-pipeline`, then `cg wf inspect` on the result workspace. Capture inspect output at multiple lifecycle stages: before Q&A, during parallel execution, and after completion.
**Q7 — Where inspect calls go**: In the E2E test script (`scripts/test-advanced-pipeline.ts`) only — NOT in production drive loop code. The test script's onEvent handler calls `cg wf inspect` at key moments to validate output at different pipeline stages.

## ADR Seeds (Optional)

None — this is an additive CLI command with no architectural decisions. Follows existing CLI patterns (Commander.js, `wrapAction`, `createOutputAdapter`).

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Graph Inspect CLI Command | CLI Flow | **Already workshopped** — see `workshops/06-graph-inspect-cli-command.md` | Output format, truncation rules, file vs data display, mode flags |

Workshop 06 provides complete sample output for all 5 modes (default, `--node`, `--outputs`, `--compact`, `--json`), implementation sketch with TypeScript interfaces, and formatter design.
