# Phase 2 Fix Tasks

**Review**: [./review.phase-2.md](./review.phase-2.md)
**Created**: 2026-02-01
**Status**: REQUEST_CHANGES

---

## Fix Tasks (Priority Order)

### FIX-001: ID Generation Collision Bug (HIGH — Blocking)

**File**: `packages/positional-graph/src/services/id-generation.ts`
**Lines**: 8-20 (generateLineId) and 22-34 (generateNodeId)

**Issue**: Random sampling with 5000 attempts cannot reliably find a free ID when the hex3 space (4096 IDs) is nearly exhausted. The test fills 4090 IDs and expects to find one of the remaining 6, but pure random sampling may not find them.

**Test to Pass**:
```
generateLineId > avoids collision with existing ids
```

**Fix Strategy**: Add deterministic fallback after N random attempts.

**Patch**:
```diff
--- a/packages/positional-graph/src/services/id-generation.ts
+++ b/packages/positional-graph/src/services/id-generation.ts
@@ -1,20 +1,33 @@
-const MAX_GENERATION_ATTEMPTS = 5000;
+const MAX_RANDOM_ATTEMPTS = 100;
+const ID_SPACE_SIZE = 4096; // 0x000 to 0xFFF
 
 function generateHex3(): string {
-  const randomValue = Math.floor(Math.random() * 4096);
+  const randomValue = Math.floor(Math.random() * ID_SPACE_SIZE);
   return randomValue.toString(16).padStart(3, '0');
 }
 
 export function generateLineId(existingIds: string[]): string {
   const existingSet = new Set(existingIds);
-  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
+  
+  // Fast path: try random sampling
+  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
     const hex = generateHex3();
     const lineId = `line-${hex}`;
     if (!existingSet.has(lineId)) {
       return lineId;
     }
   }
+  
+  // Slow path: deterministic enumeration to find any remaining free ID
+  for (let i = 0; i < ID_SPACE_SIZE; i++) {
+    const hex = i.toString(16).padStart(3, '0');
+    const lineId = `line-${hex}`;
+    if (!existingSet.has(lineId)) {
+      return lineId;
+    }
+  }
+  
   throw new Error(
-    `Cannot generate unique line ID after ${MAX_GENERATION_ATTEMPTS} attempts — ID space exhausted`
+    'Cannot generate unique line ID — ID space exhausted (all 4096 IDs in use)'
   );
 }
 
 export function generateNodeId(unitSlug: string, existingIds: string[]): string {
   const existingSet = new Set(existingIds);
-  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
+  
+  // Fast path: try random sampling
+  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
     const hex = generateHex3();
     const nodeId = `${unitSlug}-${hex}`;
     if (!existingSet.has(nodeId)) {
       return nodeId;
     }
   }
+  
+  // Slow path: deterministic enumeration
+  for (let i = 0; i < ID_SPACE_SIZE; i++) {
+    const hex = i.toString(16).padStart(3, '0');
+    const nodeId = `${unitSlug}-${hex}`;
+    if (!existingSet.has(nodeId)) {
+      return nodeId;
+    }
+  }
+  
   throw new Error(
-    `Cannot generate unique node ID for '${unitSlug}' after ${MAX_GENERATION_ATTEMPTS} attempts — ID space exhausted`
+    `Cannot generate unique node ID for '${unitSlug}' — ID space exhausted (all 4096 IDs for this slug in use)`
   );
 }
```

**Validation**:
```bash
pnpm test -- --run test/unit/positional-graph/id-generation.test.ts
# Expected: 10 passed (10)
```

---

### FIX-002: Path Traversal Defense (MEDIUM — Recommended)

**File**: `packages/positional-graph/src/adapter/positional-graph.adapter.ts`
**Lines**: 23-25

**Issue**: `getGraphDir` accepts `slug` without validation. While the schema validates slugs at the API boundary, defense-in-depth at the adapter layer prevents path traversal if the adapter is called with unvalidated input.

**Fix**:
```diff
--- a/packages/positional-graph/src/adapter/positional-graph.adapter.ts
+++ b/packages/positional-graph/src/adapter/positional-graph.adapter.ts
@@ -20,6 +20,11 @@ export class PositionalGraphAdapter extends WorkspaceDataAdapterBase {
    * Service uses known offsets from here: graph.yaml, state.json, nodes/<id>/node.yaml
    */
   getGraphDir(ctx: WorkspaceContext, slug: string): string {
+    // Validate slug format to prevent path traversal
+    if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
+      throw new Error(`Invalid graph slug '${slug}': must match /^[a-z][a-z0-9-]*$/`);
+    }
     return this.pathResolver.join(this.getDomainPath(ctx), slug);
   }
```

**Validation**: Add test case to `adapter.test.ts`:
```typescript
it('rejects invalid slug with path traversal attempt', () => {
  expect(() => adapter.getGraphDir(ctx, '../../../etc')).toThrow(/Invalid graph slug/);
});
```

---

### FIX-003: Atomic Write Cleanup (MEDIUM — Recommended)

**File**: `packages/positional-graph/src/services/atomic-file.ts`
**Lines**: 10-18

**Issue**: If `fs.rename` fails after `fs.writeFile` succeeds, the `.tmp` file remains orphaned.

**Fix**:
```diff
--- a/packages/positional-graph/src/services/atomic-file.ts
+++ b/packages/positional-graph/src/services/atomic-file.ts
@@ -10,6 +10,12 @@ export async function atomicWriteFile(
   content: string
 ): Promise<void> {
   const tempPath = `${path}.tmp`;
   await fs.writeFile(tempPath, content);
-  await fs.rename(tempPath, path);
+  try {
+    await fs.rename(tempPath, path);
+  } catch (err) {
+    // Best-effort cleanup of temp file on rename failure
+    await fs.unlink(tempPath).catch(() => {});
+    throw err;
+  }
 }
```

---

## Verification Commands

After applying fixes:

```bash
# Run all Phase 2 tests
pnpm test -- --run test/unit/positional-graph/
# Expected: 93 passed (93)

# Full quality gate
just check
# Expected: lint ✅, typecheck ✅, test ✅, build ✅
```

---

## Post-Fix Checklist

- [ ] FIX-001 applied (ID generation deterministic fallback)
- [ ] All 93 tests pass
- [ ] FIX-002 applied (slug validation) — optional but recommended
- [ ] FIX-003 applied (atomic write cleanup) — optional but recommended
- [ ] `just check` passes
- [ ] Commit with message: `fix(positional-graph): ID generation collision avoidance with deterministic fallback`
- [ ] Re-run `plan-7-code-review` for APPROVE verdict

---

**End of Fix Tasks**
