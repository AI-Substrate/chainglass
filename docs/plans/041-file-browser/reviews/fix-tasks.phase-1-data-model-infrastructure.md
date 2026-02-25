# Fix Tasks — phase-1-data-model-infrastructure

Ordered for **Full TDD**: test/traceability evidence first, then implementation/doc sync.

## 1) Restore traceability graph (CRITICAL)
1. Add `execution.log.md#...` anchors in tasks.md Notes for each completed task T001-T017.
2. Populate `## Phase Footnote Stubs` in tasks.md and add `[^^N]` tags to task notes for changed files.
3. Replace placeholder entries in plan `## Change Footnotes Ledger` with concrete entries (node IDs or explicit file-level provenance format in use by this plan).
4. Sync Phase 1 plan task statuses/log links with dossier statuses.

## 2) Resolve authority conflict: migration requirement (CRITICAL)
1. **Test-first**: add/restore explicit tests for planned migration semantics (v1->v2 behavior) OR update plan/spec acceptance criteria to formalize defaults-merge strategy.
2. Implement whichever authority path is approved:
   - Path A: implement migration behavior in adapter and persist migrated registry atomically.
   - Path B: amend plan/spec/acceptance/deviation ledgers so migration is explicitly not required.
3. Record decision and evidence in execution log.

## 3) Close T014/T015 TDD gap (HIGH)
1. **Preferred**: add `test/unit/web/app/actions/workspace-actions.test.ts` with no-mock-compatible strategy (integration-style with test container/fakes).
2. If tests remain intentionally omitted, mark T014 as waived/deferred (not `[x]`) and document approved exception + compensating controls.
3. Update T015 validation text to avoid claiming T014 GREEN pass without evidence.

## 4) Harden action input contract (HIGH)
1. **RED**: add tests that reject invalid `sortOrder` (`'', 'abc', NaN, negative if disallowed`).
2. **GREEN**: enforce schema-level numeric validation in `updateWorkspacePreferences` (zod coercion/int/bounds).
3. Add defensive service-layer guard for non-finite values.

## 5) Complete TDD cycle documentation (HIGH)
1. For each RED/GREEN group in execution.log, add `### REFACTOR` subsection.
2. Include minimal failing assertion snippets for RED evidence.
3. Keep evidence concise and deterministic.

## 6) Remove/split scope creep docs (HIGH)
1. Move non-Phase-1 workshop/spec/research edits out of phase-1 implementation diff, or
2. Add explicit task/scope justification in phase dossier for each non-task file.

## 7) Medium follow-ups
1. Add try/catch + structured logging in `updateWorkspacePreferences` action.
2. Narrow cache invalidation to affected route/tag where possible.
