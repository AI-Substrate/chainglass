# Phase 1: Types and Schemas — Review Report

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Graph integrity is broken: plan↔dossier status mismatch, missing task↔log backlinks, and missing footnote linkage.
- Full TDD evidence is incomplete: lint failed and required checks did not complete; execution log claims tests passed when they did not.
- PlanPak compliance flagged shared root export of feature module and missing plan symlink manifest.
- Scope traceability is unclear due to plan/spec/workshop docs included in diff outside Phase 1 target paths.

## C) Checklist (Full TDD)
**Testing Approach: Full TDD**
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [ ] Mock usage matches spec: Avoid mocks
- [ ] Negative/edge cases covered

**Universal**
- [ ] BridgeContext patterns followed (Uri, RelativePattern, module: 'pytest')
- [ ] Only in-scope files changed
- [ ] Linters/type checks are clean
- [ ] Absolute paths used (no hidden context)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | agentic-work-units-plan.md:846 | Plan task statuses [ ] vs dossier [x] | Run plan-6a to sync plan↔dossier statuses |
| V2 | HIGH | tasks.md:207-217 | Missing task↔log anchors | Add log anchors in Notes column and backlinks in execution.log |
| V3 | CRITICAL | tasks.md:446-455 | Footnote stubs empty while plan ledger has [^1]-[^3] | Run plan-6a to sync footnotes |
| V4 | HIGH | execution.log.md:9-270 | Log entries missing Dossier/Plan task backlinks | Add **Dossier Task** and **Plan Task** metadata |
| V5 | HIGH | docs/plans/.../ | Scope creep: plan/spec/workshop docs in diff | Justify in execution log or move to planning scope |
| V6 | MEDIUM | execution.log.md:305-340 | TDD evidence missing (tests not run) | Run tests and record RED/GREEN/REFACTOR evidence |
| V7 | HIGH | packages/positional-graph/src/index.ts:6-11 | PlanPak dependency direction violated | Remove shared root export of feature module |
| V8 | LOW | docs/plans/... | Missing PlanPak symlink manifest | Add files/otherfiles symlinks for changed files |
| V9 | HIGH | test/unit/.../*.test.ts | Rule R-CODE-004: relative imports | Use package aliases instead of relative paths |
| V10 | HIGH | execution.log.md | Rule R-TOOL-002: quality gates not run | Run just test/typecheck/lint/build and record |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
Not executed (Phase 1 only). If Phase 0 exists, rerun previous phase tests when available.

### E.1 Doctrine & Testing Compliance
**Graph Integrity (Step 3a)**
- Task↔Log: Missing anchors in tasks table and missing backlinks in execution log (HIGH)
- Task↔Footnote: Notes column lacks [^N] tags (HIGH)
- Footnote↔File: Plan ledger entries reference files not in diff / invalid node ID format (HIGH)
- Plan↔Dossier: Status mismatch for 1.1–1.9 (CRITICAL)
- Parent↔Subtask: Subtasks registry missing (HIGH)

**Authority Conflicts (Step 3c)**
- Plan ledger has [^1]-[^3], dossier stubs empty → **CRITICAL** (plan is authority)

**Testing Strategy Compliance (Step 4)**
- Full TDD evidence missing; execution log indicates tests not run (MEDIUM)
- Mock policy (Avoid mocks): compliant (no mocks found)
- Rule compliance: tests use relative imports (R-CODE-004 violation)

**Testing Evidence & Coverage (Step 5)**
- Coverage mapping not documented in dossier; no acceptance-criteria↔test linkage recorded.
- Overall confidence: **Low** (no explicit mappings)

### E.2 Semantic Analysis
No semantic defects detected in diff.

### E.3 Quality & Safety Analysis
No correctness/security/performance/observability defects detected in diff.

### E.4 Doctrine Evolution Recommendations (Advisory)
None identified from this phase diff.

## F) Coverage Map
| AC | Criterion | Test(s) | Confidence |
|----|----------|---------|------------|
| AC-6 | WorkUnit satisfies NarrowWorkUnit | workunit.types.test.ts | 75% (behavioral match, no explicit AC tag) |
| AC-7 | Zod schema validation returns E182 | workunit.schema.test.ts, workunit-errors.test.ts | 75% (behavioral match) |

**Overall Coverage Confidence**: 75% (needs explicit AC references in test names or comments)

## G) Commands Executed
```
just fft
```

## H) Decision & Next Steps
**Decision**: REQUEST_CHANGES

**Next Steps**:
1. Run plan-6a to sync plan↔dossier statuses, footnotes, and log links.
2. Add missing backlinks/anchors in tasks.md and execution.log.md.
3. Resolve lint failure (biome import order in workunit-errors.test.ts) and rerun `just fft`.
4. Fix rule violations (use path aliases in tests; remove shared root export of feature module) or document exceptions.
5. Update execution log with RED/GREEN/REFACTOR evidence and test outputs.

## I) Footnotes Audit
Footnote ledger entries are placeholders; no phase footnote stubs or task notes reference [^N].
Update plan §12 and dossier stubs, then map each diff-touched file to a footnote tag.
