# Fix Tasks: Phase 1 — Event Types, Schemas, and Registry

**Review**: [review.phase-1-event-types-schemas-and-registry.md](./review.phase-1-event-types-schemas-and-registry.md)
**Date**: 2026-02-07

---

## Blocking Fixes (must complete before merge)

### FIX-001: Add per-test Test Doc blocks [HIGH × 4]

**Files**:
- `/home/jak/substrate/030-positional-orchestrator/test/unit/positional-graph/features/032-node-event-system/event-payloads.test.ts`
- `/home/jak/substrate/030-positional-orchestrator/test/unit/positional-graph/features/032-node-event-system/node-event-registry.test.ts`
- `/home/jak/substrate/030-positional-orchestrator/test/unit/positional-graph/features/032-node-event-system/event-id.test.ts`
- `/home/jak/substrate/030-positional-orchestrator/test/unit/positional-graph/features/032-node-event-system/event-errors.test.ts`

**Rule**: R-TEST-002, R-TEST-003

**What to do**: Add a 5-field Test Doc comment block inside each `it()` block (or per `describe()` for highly uniform schema validation tests in event-payloads.test.ts).

**Template**:
```typescript
it('description', () => {
  /*
  Test Doc:
  - Why: <business/regression reason>
  - Contract: <invariant this test asserts>
  - Usage Notes: <how to call the API; gotchas>
  - Quality Contribution: <what failure this catches>
  - Worked Example: <concrete inputs/outputs>
  */
  // test body
});
```

**Pragmatic guidance**: For `event-payloads.test.ts` (38 uniform schema tests), per-`describe()` Test Doc blocks are acceptable — each describe covers one schema with positive/negative variants. That reduces the work to ~8 blocks instead of 38.

**Estimated scope**: ~15-20 Test Doc blocks total across 4 files.

### FIX-002: Rename interface file [MEDIUM]

**File**: `/home/jak/substrate/030-positional-orchestrator/packages/positional-graph/src/features/032-node-event-system/event-type-registration.ts`

**Rule**: R-CODE-003 — files containing only interfaces must use `.interface.ts` suffix.

**Steps**:
1. `git mv event-type-registration.ts event-type-registration.interface.ts`
2. Update imports in 6 files:
   - `core-event-types.ts` — `./event-type-registration.js` → `./event-type-registration.interface.js`
   - `node-event-registry.interface.ts` — same
   - `node-event-registry.ts` — same
   - `fake-node-event-registry.ts` — same
   - `index.ts` — same
   - `test/.../node-event-registry.test.ts` — same
3. Run `pnpm typecheck` to verify

---

## Advisory Fixes (recommended before Phase 3)

### FIX-003: Add cross-field validation to QuestionAskPayloadSchema [MEDIUM]

**File**: `/home/jak/substrate/030-positional-orchestrator/packages/positional-graph/src/features/032-node-event-system/event-payloads.schema.ts`

**Lines**: 27-35

**What to do**: Add `.superRefine()` to enforce `options` is required when `type` is `'single'` or `'multi'`.

**Patch**:
```diff
 export const QuestionAskPayloadSchema = z
   .object({
     type: z.enum(['text', 'single', 'multi', 'confirm']),
     text: z.string().min(1),
-    options: z.array(z.string()).optional(),
+    options: z.array(z.string().min(1)).min(1).optional(),
     default: z.union([z.string(), z.boolean()]).optional(),
   })
-  .strict();
+  .strict()
+  .superRefine((data, ctx) => {
+    if ((data.type === 'single' || data.type === 'multi') && !data.options) {
+      ctx.addIssue({
+        code: z.ZodIssueCode.custom,
+        message: "Field 'options' is required when type is 'single' or 'multi'",
+        path: ['options'],
+      });
+    }
+  });
```

**Also add tests**: Add negative test case in `event-payloads.test.ts` for `type:'single'` without `options`.

### FIX-004: Populate Phase Footnote Stubs table [MEDIUM]

**File**: `/home/jak/substrate/030-positional-orchestrator/docs/plans/032-node-event-system/tasks/phase-1-event-types-schemas-and-registry/tasks.md`

**Lines**: 414-416

**What to do**: Replace the empty placeholder row with:

```markdown
| [^1] | Phase 1 | T001-T012 | Phase 1 complete — 12 source files, 1 modified, 4 test files, 94 tests |
```

---

## Verification

After all fixes, run:

```bash
just fft
```

Expected: all tests pass, no lint errors. Then re-run `/plan-7-code-review` to verify APPROVE.
