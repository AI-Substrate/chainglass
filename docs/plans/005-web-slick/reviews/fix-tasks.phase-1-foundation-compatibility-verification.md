# Phase 1: Fix Tasks

**Generated**: 2026-01-22
**Review**: [review.phase-1-foundation-compatibility-verification.md](./review.phase-1-foundation-compatibility-verification.md)
**Status**: 5 MUST/SHOULD FIX, 7 RECOMMENDED

---

## Priority: MUST FIX (Before Phase 2)

### FIX-001: Normalize Feature Flag Parsing [SEC-001]

**Severity**: MEDIUM
**File**: `apps/web/src/lib/feature-flags.ts`
**Lines**: 17-26

**Issue**: Feature flag environment variable parsing is case-sensitive. Only exact lowercase 'true' will enable features. Alternate truthy values ('True', 'TRUE', '1', 'yes') will silently disable features, creating deployment inconsistencies.

**Fix**:
```typescript
// Add normalization utility
const isTruthy = (val: string | undefined): boolean => 
  val ? ['true', '1', 'yes'].includes(val.toLowerCase()) : false;

// Update FEATURES object
export const FEATURES = {
  WORKFLOW_VISUALIZATION: isTruthy(process.env.NEXT_PUBLIC_ENABLE_WORKFLOW),
  KANBAN_BOARD: isTruthy(process.env.NEXT_PUBLIC_ENABLE_KANBAN),
  SSE_UPDATES: isTruthy(process.env.NEXT_PUBLIC_ENABLE_SSE),
} as const;
```

**Testing**: Verify with different env values:
```bash
NEXT_PUBLIC_ENABLE_WORKFLOW=true node -e "console.log(require('./dist/lib/feature-flags').FEATURES.WORKFLOW_VISUALIZATION)"
NEXT_PUBLIC_ENABLE_WORKFLOW=True node -e "console.log(require('./dist/lib/feature-flags').FEATURES.WORKFLOW_VISUALIZATION)"
NEXT_PUBLIC_ENABLE_WORKFLOW=1 node -e "console.log(require('./dist/lib/feature-flags').FEATURES.WORKFLOW_VISUALIZATION)"
```

---

### FIX-002: Add CSS Import Order Validator [OBS-001]

**Severity**: HIGH
**File**: `apps/web/app/layout.tsx`
**Lines**: 2-4 (comment only, no programmatic validation)

**Issue**: Critical CSS import order (ReactFlow before globals.css) is only documented as comments. No CI/CD validation to prevent regression.

**Fix Option A - ESLint Rule** (recommended):

Create `apps/web/.eslintrc.js`:
```javascript
module.exports = {
  rules: {
    'import/order': ['error', {
      'groups': [
        ['builtin', 'external'],
        ['internal'],
        ['parent', 'sibling', 'index']
      ],
      'pathGroups': [
        {
          pattern: '@xyflow/react/dist/style.css',
          group: 'external',
          position: 'before'
        },
        {
          pattern: './globals.css',
          group: 'internal',
          position: 'after'
        }
      ],
      'pathGroupsExcludedImportTypes': ['builtin'],
      'alphabetize': {
        'order': 'asc'
      }
    }]
  }
};
```

**Fix Option B - CI Validator Script**:

Create `scripts/validate-css-order.sh`:
```bash
#!/bin/bash
# Validate ReactFlow CSS imports before globals.css in layout.tsx

LAYOUT_FILE="apps/web/app/layout.tsx"

# Extract import lines
REACTFLOW_LINE=$(grep -n "@xyflow/react/dist/style.css" "$LAYOUT_FILE" | cut -d: -f1)
GLOBALS_LINE=$(grep -n "import.*globals.css" "$LAYOUT_FILE" | cut -d: -f1)

if [ -z "$REACTFLOW_LINE" ] || [ -z "$GLOBALS_LINE" ]; then
  echo "ERROR: Missing CSS imports in layout.tsx"
  exit 1
fi

if [ "$REACTFLOW_LINE" -gt "$GLOBALS_LINE" ]; then
  echo "ERROR: CSS import order violation - ReactFlow CSS must be imported BEFORE globals.css"
  echo "  ReactFlow: line $REACTFLOW_LINE"
  echo "  globals.css: line $GLOBALS_LINE"
  exit 1
fi

echo "✅ CSS import order validated: ReactFlow (line $REACTFLOW_LINE) → globals.css (line $GLOBALS_LINE)"
```

Add to CI (`.github/workflows/ci.yml`):
```yaml
- name: Validate CSS Import Order
  run: bash scripts/validate-css-order.sh
```

**Testing**: Run validator locally:
```bash
chmod +x scripts/validate-css-order.sh
./scripts/validate-css-order.sh
```

---

## Priority: SHOULD FIX (Before Merge)

### FIX-003: Add Type Guard to dnd-kit Verification [CORR-001]

**Severity**: MEDIUM
**File**: `apps/web/test/verification/test-dndkit.tsx`
**Lines**: 76-80

**Issue**: Unsafe type assertion `active.id as string` without validation. If active.id is a number, indexOf() returns -1, causing silent failure.

**Fix**:
```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;

  if (active.id !== over?.id) {
    setItems((items) => {
      // Type guard: ensure IDs are strings
      const activeId = String(active.id);
      const overId = String(over!.id);
      
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(overId);

      return arrayMove(items, oldIndex, newIndex);
    });
  }
}
```

**Testing**: Verification component compiles and renders without TypeScript errors.

---

### FIX-004: Create CHANGELOG [OBS-002]

**Severity**: MEDIUM
**File**: New file `CHANGELOG.md`

**Issue**: 11 new dependencies added with no CHANGELOG or documentation.

**Fix**:

Create `apps/web/CHANGELOG.md`:
```markdown
# Changelog

## [Unreleased]

### Added - Phase 1: Foundation & Compatibility Verification (2026-01-22)

**UI Framework**
- Tailwind CSS v4.1.18 with @tailwindcss/postcss plugin
- shadcn/ui components (Button, Card) with new-york style
- CSS Custom Properties theming with OKLCH colors

**Visualization Libraries**
- @xyflow/react v12.10.0 (ReactFlow) - workflow visualization
- @dnd-kit/core v6.3.1, @dnd-kit/sortable v10.0.0 - drag-and-drop

**Dependencies**
- lucide-react v0.562.0 - icon library
- class-variance-authority v0.7.1 - component variants
- tailwind-merge v3.4.0 - className merging
- tw-animate-css v1.4.0 - CSS animations (auto-added by shadcn)

**Dev Dependencies**
- autoprefixer v10.4.23 - PostCSS plugin
- postcss v8.5.6 - CSS processor

**Infrastructure**
- Feature flags with NEXT_PUBLIC_* env vars
- Verification components in test/verification/
- TypeScript path aliases (@/ prefix for src/)

### Verified
- React 19 compatibility (ReactFlow v12.10.0 + dnd-kit v6.3.1)
- CSS import order (ReactFlow before globals.css)
- Quality gates (238 tests, lint, typecheck, build)
```

Add security audit to CI:
```bash
pnpm audit --prod
```

---

### FIX-005: Establish Bundle Size Baseline [PERF-001]

**Severity**: HIGH
**File**: CI/CD configuration

**Issue**: No bundle size baseline established. Tailwind v4 adds ~15-20MB uncompressed binaries.

**Fix**:

Add to `package.json` scripts:
```json
{
  "scripts": {
    "analyze": "ANALYZE=true next build"
  }
}
```

Install bundle analyzer:
```bash
pnpm add -D @next/bundle-analyzer
```

Create `next.config.js`:
```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // existing config
});
```

Measure baseline:
```bash
pnpm run analyze
```

Create budget file `.bundlewatch.config.json`:
```json
{
  "files": [
    {
      "path": ".next/static/**/*.js",
      "maxSize": "150kb"
    },
    {
      "path": ".next/static/**/*.css",
      "maxSize": "50kb"
    }
  ]
}
```

Add to CI:
```bash
pnpm add -D bundlewatch
pnpm bundlewatch
```

**Target**: CSS <50KB gzipped, Total bundle <150KB gzipped

---

## Priority: RECOMMENDED (Nice to Have)

### FIX-006: Use Responsive Tailwind Classes [CORR-002]

**Severity**: LOW
**File**: `apps/web/test/verification/test-reactflow.tsx`
**Lines**: 48-56

**Fix**:
```typescript
<ReactFlow
  nodes={nodes}
  edges={edges}
  className="w-full h-[300px] sm:h-[400px] border border-gray-300 rounded"
>
  <Background />
  <Controls />
</ReactFlow>
```

---

### FIX-007: Fix RSC Configuration [SEC-003]

**Severity**: INFO
**File**: `apps/web/components.json`
**Lines**: 4

**Fix**:
```json
{
  "rsc": true
}
```

Or document exception:
```json
{
  "rsc": false,
  // Note: Disabled because shadcn components use client-side hooks
}
```

---

### FIX-008: Document Path Alias Rules [SEC-004]

**Severity**: LOW
**File**: `apps/web/tsconfig.json`

**Fix**: Add comment above paths:
```json
{
  "compilerOptions": {
    // Path aliases: @/* maps to src/* for components and utilities
    // Test files belong in test/ directory, NOT in src/
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

### FIX-009: Verify Tree-Shaking [PERF-002]

**Severity**: MEDIUM
**File**: Bundle analysis

**Fix**: In Phase 2, after first build:
```bash
pnpm run analyze
# Verify lucide-react only includes used icons
# If bundle is >20KB for icons, switch to:
# import { Icon1, Icon2 } from 'lucide-react'
```

---

### FIX-010: Add ESLint Rule [PERF-004]

**Severity**: LOW
**File**: `.eslintrc.js`

**Fix**: See FIX-002 (CSS import order validator)

---

### FIX-011: Add Component Health Checks [OBS-004]

**Severity**: MEDIUM
**File**: CI configuration

**Fix**:

Create `scripts/test-components.ts`:
```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Smoke test: ensure components can be imported and instantiated
console.log('✅ Button component loaded');
console.log('✅ Card component loaded');
```

Add to CI:
```bash
tsx scripts/test-components.ts
```

---

### FIX-012: Add Dependency Security Scan [OBS-006]

**Severity**: LOW
**File**: `.github/workflows/ci.yml`

**Fix**:
```yaml
- name: Security Audit
  run: pnpm audit --prod --audit-level=moderate
```

---

## Summary

| Priority | Count | IDs |
|----------|-------|-----|
| MUST FIX | 2 | FIX-001, FIX-002 |
| SHOULD FIX | 3 | FIX-003, FIX-004, FIX-005 |
| RECOMMENDED | 7 | FIX-006 through FIX-012 |

**Estimated Effort**: 2-3 hours for MUST/SHOULD fixes

**Order of Execution**:
1. FIX-001 (feature flags) - 15 min
2. FIX-003 (type guard) - 5 min
3. FIX-004 (CHANGELOG) - 15 min
4. FIX-002 (CSS validator) - 30 min
5. FIX-005 (bundle size) - 60 min
