# Fix Tasks — Phase 2: Formatters (Human-Readable + JSON)

Order: **CRITICAL/HIGH first**. Full TDD policy applies (RED → GREEN → REFACTOR per task).

## 1) Graph integrity metadata sync (blocking)
1. **Task↔Log anchors**
   - Files:
     - `/home/jak/substrate/033-real-agent-pods/docs/plans/040-graph-inspect-cli/tasks/phase-2-formatters-human-readable-json/tasks.md`
     - `/home/jak/substrate/033-real-agent-pods/docs/plans/040-graph-inspect-cli/tasks/phase-2-formatters-human-readable-json/execution.log.md`
   - Fix:
     - Add `execution.log.md#...` anchor in Notes for T001-T008.
     - Add `Dossier Task:` and `Plan Task:` backlink metadata inside each execution entry.

2. **Plan↔Dossier sync + footnotes**
   - Files:
     - `/home/jak/substrate/033-real-agent-pods/docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md`
     - `/home/jak/substrate/033-real-agent-pods/docs/plans/040-graph-inspect-cli/tasks/phase-2-formatters-human-readable-json/tasks.md`
   - Fix:
     - Sync phase status/checklists/log links.
     - Populate Phase Footnote Stubs and task `[^N]` notes to match plan ledger.

## 2) TDD-first behavioral fixes (blocking)
3. **Compact progress contract regression**
   - RED test first in:
     - `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/features/040-graph-inspect/inspect-format.test.ts`
   - Assert compact header uses `completedNodes/totalNodes` for in-progress graph.
   - GREEN in:
     - `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/040-graph-inspect/inspect.format.ts`

4. **`formatInspectNode()` raw node.yaml section**
   - RED tests:
     - Add explicit assertion for `Raw node.yaml` section and expected content.
   - GREEN implementation:
     - Render raw node config/yaml section at bottom of deep dive output.

5. **Running/Waiting required semantics**
   - RED tests:
     - Assert `Running: <duration>` for active nodes.
     - Assert `Waiting: <reason>` for pending/waiting nodes.
   - GREEN implementation:
     - Add those lines in formatter logic.

6. **File output detection/fallback completeness**
   - RED tests:
     - Case: `data/outputs/...` with no metadata should render `→ ... (missing)`.
     - Case: binary marker and bounded extract expectations.
   - GREEN implementation:
     - Use `isFileOutput()` in detection flow and implement `(missing)` fallback.

## 3) Non-blocking hardening (recommended)
7. **Bound deep-dive extract lines**
   - Limit lines rendered from `fileMeta.extract` in `--node` mode.

8. **Test Doc policy consistency**
   - Add full 5-field Test Doc blocks per test OR document accepted file-level pattern in project rules.

## Revalidation commands
- `pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/`
- `just fft`
- Re-run `/plan-7-code-review --phase "Phase 2: Formatters (Human-Readable + JSON)" --plan "/home/jak/substrate/033-real-agent-pods/docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md"`
