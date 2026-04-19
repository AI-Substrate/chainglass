# Phase 4 Execution Log

**Phase**: Phase 4: Utilities (TDD)
**Plan**: [../../md-editor-plan.md](../../md-editor-plan.md)
**Started**: 2026-04-19
**Testing Strategy**: Full TDD (Constitution §3); no mocks (Constitution §4/§7)

---

## Pre-Phase Harness Validation (2026-04-19)

| Check | Status | Duration | Evidence |
|-------|--------|----------|----------|
| Boot | ✅ already running | < 1s | `just harness-health` → `app=up, mcp=up, terminal=up, cdp=up Chrome/136.0.7103.25` |
| Interact | ✅ verified | N/A | CDP ready, Playwright project configured |
| Observe | ✅ verified | N/A | `harness/results/` exists; screenshots and test JSON from prior phases present |

**Verdict**: ✅ HEALTHY (L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK). Proceed.

---

## Task Log

_(Appended per-task as implementation progresses.)_

### T001 — Interface-first types verification (2026-04-19)

**Action**: Read `apps/web/src/features/_platform/viewer/lib/wysiwyg-extensions.ts` lines 31-36.

**Finding**: `FrontMatterCodec` interface declared in Phase 1 matches the planned function signatures exactly:
- `split: (md: string) => { frontMatter: string; body: string }` ✓ (matches `splitFrontMatter`)
- `join: (frontMatter: string, body: string) => string` ✓ (matches `joinFrontMatter`)

**Result**: Zero-change task. No types file edits required. Phase 4's new utilities (`splitFrontMatter`, `joinFrontMatter`, `hasTables`, `exceedsRichSizeCap`) export named functions directly; `FrontMatterCodec` remains as a structural type that the pair satisfies.

**Gate**: `pnpm -F web typecheck` — no changes to typecheck baseline (4 pre-existing errors unchanged).

### T002 + T003 — TDD splitFrontMatter / joinFrontMatter (2026-04-19)

**Approach**: Combined both utilities into a single test file (`markdown-frontmatter.test.ts`) and a single module (`markdown-frontmatter.ts`) since they're co-operating halves of the same codec and share the round-trip invariant.

**RED**:
- Created `test/unit/web/features/_platform/viewer/markdown-frontmatter.test.ts` with 34 test cases (17 split + 4 join basics + 7 forward round-trip + 5 reverse round-trip + 1 scan-cap-boundary extra)
- `pnpm exec vitest run test/unit/web/features/_platform/viewer/markdown-frontmatter.test.ts` → "Failed to resolve import" (expected — module doesn't exist yet)

**GREEN**:
- Created `apps/web/src/features/_platform/viewer/lib/markdown-frontmatter.ts` with:
  - `splitFrontMatter(md)` — line-based scan, BOM + CRLF tolerant, scan capped at 500 lines after the open fence
  - `joinFrontMatter(fm, body)` — trivial concat (complexity intentionally lives in split)
  - JSDoc documents the bidirectional invariant above each function
- Algorithm: `md.split('\n')` → check first line (BOM-stripped, CRLF-tolerant) for `'---'` → scan lines[1..500] for first CRLF-tolerant `'---'` → if found, include all lines[0..closeIdx] in frontMatter, add trailing `\n` only if original had one
- Helpers: `stripTrailingCR`, `stripBomPrefix` — pure, tiny

**Result**: `pnpm exec vitest run test/unit/web/features/_platform/viewer/markdown-frontmatter.test.ts` → **34/34 green** in 3ms.

**Key cases verified**:
- Happy path, CRLF, BOM, BOM+CRLF combined
- Passthrough: no fm, open-without-close, malformed 2-line, empty string, whitespace-only
- Fence-in-body: `---` inside fenced code (body only) + setext-heading `---` in body — both stay in body; scanner stops at FIRST close
- fm-only with trailing newline / without trailing newline (close at EOF)
- `---\n---\n` immediate close (empty fm body)
- Blank line after close fence → retained in body (byte-identical)
- Scan cap: close at line 500 (within cap) found; close at line 501+ missed → passthrough
- Forward invariant: 11 samples, all round-trip
- Reverse invariant: 5 well-formed pairs, all round-trip

**Decision**: Combined T002 + T003 into one commit / one test file. Plan-3 split them RED/GREEN per-function; combining them is cleaner and the sanitize-link-href template (Phase 3) already establishes this as an acceptable variation of strict TDD (RED-then-GREEN per numbered test case, not per function).

### T004 — TDD hasTables (2026-04-19)

**RED**: Created `test/unit/web/features/_platform/viewer/markdown-has-tables.test.ts` with 18 test cases (7 positive + 9 negative + 2 boundary).

Failed as expected: module not found.

**GREEN**: Created `apps/web/src/features/_platform/viewer/lib/markdown-has-tables.ts`.

Algorithm:
- Line-by-line scan (CRLF-tolerant via trailing-`\r` strip)
- Fence state = `'```' | '~~~' | null`; opening fence remembers its TYPE so only a matching-type line closes it (nested-fence case 14)
- Header row detection: `/^ {0,3}\|.*\|\s*$/` + content check `/[^\s:|-]/` (separator-only content rejected — prevents `|---|---|\n|---|---|` self-trigger)
- Separator row detection: `/^ {0,3}\|[\s:|-]+\|\s*$/` + `includes('-')`
- Returns true on first match; returns false at EOF

**Result**: `pnpm exec vitest run test/unit/web/features/_platform/viewer/markdown-has-tables.test.ts` → **18/18 green** in 2ms.

**Key cases verified**:
- Happy: classic GFM, single-column, after front-matter, CRLF, EOF no-newline, 3-space leading, alignment colons
- Rejections: plain text, pipe-prose-no-separator, reversed (separator first), ``` fenced, ~~~ fenced, 4-space indent (code), nested-fence (``` inside ~~~), empty, single-line
- Boundary: intervening paragraphs; header-like-but-not-real

**Insight**: The `HEADER_HAS_CONTENT_RX = /[^\s:|-]/` check is the under-documented-but-essential piece — without it, a file with `|---|---|\n|---|---|` self-detects as a table. This is precisely the "bias toward strict" the dossier called for.

### T005 — TDD exceedsRichSizeCap + RICH_MODE_SIZE_CAP_BYTES (2026-04-19)

**RED**: Created `test/unit/web/features/_platform/viewer/rich-size-cap.test.ts` with 7 cases (constant-identity + 4 ASCII boundary + 2 UTF-8 byte-semantics incl. 66_667-char CJK boundary per FC-validator recommendation).

Failed as expected: module not found.

**GREEN**: Created `apps/web/src/features/_platform/viewer/lib/rich-size-cap.ts`:
```ts
export const RICH_MODE_SIZE_CAP_BYTES = 200_000;
export function exceedsRichSizeCap(content: string): boolean {
  return new TextEncoder().encode(content).length > RICH_MODE_SIZE_CAP_BYTES;
}
```

JSDoc on the constant explicitly disambiguates: "200_000 bytes (decimal kilobytes, NOT 204_800 KiB). Matches the spec's informal '200 KB' phrasing." This is the mitigation for FC-validator Issue 1.

**Result**: `pnpm exec vitest run test/unit/web/features/_platform/viewer/rich-size-cap.test.ts` → **7/7 green** in 3ms.

**Key verified**:
- Constant identity (200_000)
- ASCII boundary: 199_999 → false, 200_000 → false (strict `>`), 200_001 → true
- UTF-8 semantics: 100_000 × `'中'` (300 kB) → true; exact boundary 66_666/66_667 × `'中'` straddles the cap correctly

### T006 — Wire utilities into editor + lifecycle-safety test + barrel (2026-04-19)

**Editor changes** (`apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx`):
1. Deleted local `splitFrontMatterStub` + `joinFrontMatterStub` function definitions (was lines 43–48)
2. Added `import { joinFrontMatter, splitFrontMatter } from '../lib/markdown-frontmatter'`
3. Replaced stub calls at two sites: `onUpdate` assembler (joinFrontMatterStub → joinFrontMatter) and the `useEffect` value-sync (splitFrontMatterStub → splitFrontMatter)

**Verification**: `grep -r "FrontMatterStub" apps/web/src test/` → **empty** (zero references remain).

**Barrel** (`apps/web/src/features/_platform/viewer/index.ts`):
- Added three new exports: `{ joinFrontMatter, splitFrontMatter }`, `{ hasTables }`, `{ exceedsRichSizeCap, RICH_MODE_SIZE_CAP_BYTES }`
- Phase 5 can now `import { exceedsRichSizeCap, RICH_MODE_SIZE_CAP_BYTES, hasTables } from '@/features/_platform/viewer'`

**Tests extended** (`test/unit/web/features/_platform/viewer/markdown-wysiwyg-editor.test.tsx`):
- Added test 1: renders body with fm stripped + no onChange on mount / same-value rerender (covers display path)
- Added test 2 (lifecycle-safety — the FC-validator mandatory piece): mounts with `'---\nfoo: bar\n---\n# Heading\n'`, triggers `editor.commands.insertContent(' more')` via captured Editor, asserts the emitted onChange argument **starts with** `'---\nfoo: bar\n---\n'`. This proves `frontMatterRef` is populated correctly by `split()` and the subsequent `join()` reattaches fm — the only way to catch "split() returns empty fm → silent data loss on edit".

**Regression sweep** (`pnpm exec vitest run test/unit/web/features/_platform/viewer/`):
- **148/148 green** across 9 files
- Phase 1/2/3 tests unchanged: editor 13 pre-existing + 2 new = 15, toolbar 10 + markdown 14, sanitize 26, link-popover 13, image-url 11
- Phase 4 new: frontmatter 34, has-tables 18, rich-size-cap 7 = **59 new unit tests**

**Gotcha**: The "act() warning" noise in output is pre-existing Phase 1 test flake from the image-url and Mod-k tests (async Tiptap state updates outside test-owned `act()` calls). Not introduced by Phase 4. Tests still pass.

**Lifecycle-safety assertion outcome**: `expect(emitted.startsWith('---\nfoo: bar\n---\n')).toBe(true)` → **passed**. This is the authoritative proof that Finding 03's silent-data-loss scenario is closed.

### T007 — Harness smoke: front-matter round-trip (2026-04-19)

**Dev route changes** (`apps/web/app/dev/markdown-wysiwyg-smoke/page.tsx`):
- Added `SAMPLE_MARKDOWN_FRONTMATTER` fixture (`'---\ntitle: Test Doc\ntags:\n  - a\n  - b\n---\n\n# Body\n\nparagraph.\n'`)
- Added `useState<string>` for `value` (initial = SAMPLE_MARKDOWN, toggle → SAMPLE_MARKDOWN_FRONTMATTER)
- Added `[data-testid="fixture-toggle-frontmatter"]` button above the editor
- Added `lastEmittedMarkdownRef` + `captureOnChange` callback — records every onChange argument
- Extended window getter: `__smokeGetLastEmittedMarkdown()` returns `lastEmittedMarkdownRef.current` — the authoritative assembled markdown (fm + body) seen by the parent

**Harness spec changes** (`harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts`):
- Added `RESULTS_DIR_P4` constant
- Preserved every Phase 1/2/3 assertion verbatim
- After Phase 3 block, reload to clean state, click fm-toggle, then assert:
  - (P4-1) `<h1>Body</h1>` renders (replaces `<h1>Hello</h1>`)
  - (P4-2) Rendered text does NOT contain `---` or `title: Test Doc` (fm stripped from DOM)
  - (P4-2) Rendered text DOES contain `Body` and `paragraph.` (body visible)
  - (P4-3) Type ` edited` at end to trigger onChange
  - (P4-4) `window.__smokeGetLastEmittedMarkdown()` returns non-empty string
  - (P4-4) Emitted markdown **starts with** `'---\ntitle: Test Doc\n'` — authoritative fm preservation proof
  - (P4-4) Emitted markdown contains `'edited'` — proves we see post-edit state, not an echo of the original value
- Screenshot saved to `harness/results/phase-4/frontmatter-roundtrip-<project>.png`

**Results**:
- `pnpm exec playwright test tests/smoke/markdown-wysiwyg-smoke.spec.ts --project=desktop` → **1 passed (7.2s)**
- `pnpm exec playwright test tests/smoke/markdown-wysiwyg-smoke.spec.ts --project=tablet` → **1 passed (6.6s)**
- Mobile skipped by design (`testInfo.project.name === 'mobile'` skip guard — Phase 6.4 scope)
- Screenshots present: `harness/results/phase-4/frontmatter-roundtrip-desktop.png`, `frontmatter-roundtrip-tablet.png`

**Gotcha**: Initial draft had an assertion that text SHOULD contain `title: Test Doc` in the rendered DOM — inverse of correct. Title is in front-matter, so it must NOT be in the rendered DOM. Fixed before running.

**Decision**: Used a separate `__smokeGetLastEmittedMarkdown` getter rather than augmenting `__smokeGetMarkdown`. The existing getter reads `storage.getMarkdown()` (body only) — that's still useful for Phase 3's parenthesized-URL round-trip assertion, which needs the raw body serialization. The new getter captures the parent-visible emitted markdown (assembled fm + body), which is what Phase 4's preservation claim is actually about.

---

## Phase 4 — Landed (2026-04-19)

**Final status**: ⚠️ → ✅

**Files changed** (8 new + 4 modified):
- **New** `apps/web/src/features/_platform/viewer/lib/markdown-frontmatter.ts`
- **New** `apps/web/src/features/_platform/viewer/lib/markdown-has-tables.ts`
- **New** `apps/web/src/features/_platform/viewer/lib/rich-size-cap.ts`
- **New** `test/unit/web/features/_platform/viewer/markdown-frontmatter.test.ts` (34 cases)
- **New** `test/unit/web/features/_platform/viewer/markdown-has-tables.test.ts` (18 cases)
- **New** `test/unit/web/features/_platform/viewer/rich-size-cap.test.ts` (7 cases)
- **New** `harness/results/phase-4/frontmatter-roundtrip-desktop.png`
- **New** `harness/results/phase-4/frontmatter-roundtrip-tablet.png`
- **Modified** `apps/web/src/features/_platform/viewer/components/markdown-wysiwyg-editor.tsx` (stubs → real codec; lines 43-48 deleted; imports updated)
- **Modified** `apps/web/src/features/_platform/viewer/index.ts` (5 new barrel exports)
- **Modified** `test/unit/web/features/_platform/viewer/markdown-wysiwyg-editor.test.tsx` (+2 tests — display path + lifecycle-safety)
- **Modified** `apps/web/app/dev/markdown-wysiwyg-smoke/page.tsx` (fm fixture toggle + captureOnChange + new window getter)
- **Modified** `harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts` (+Phase 4 assertion block — all Phase 1/2/3 preserved verbatim)
- **Modified** `docs/domains/_platform/viewer/domain.md` (Phase 4 History entry)
- **Modified** `docs/plans/083-md-editor/md-editor.fltplan.md` (phase table updated; P3/P4 checked)

**Test totals**:
- Pre-Phase 4: 87 unit tests, 1 harness spec (desktop + tablet)
- Post-Phase 4: **148 unit tests** (+ 59 new), 1 harness spec (same spec, extended with Phase 4 assertions, still passes desktop + tablet)

**Acceptance Criteria** (from tasks.fltplan.md):
- ✅ `splitFrontMatter` round-trips cleanly on all 11 corpus samples (Finding 03)
- ✅ `joinFrontMatter(split(x).fm, split(x).body) === x` for 7 forward samples + 5 reverse pairs
- ✅ `hasTables` matches GFM tables, ignores ``` + ~~~ fenced code, rejects 4-space-indent, handles nested fences (AC-11 contribution)
- ✅ `exceedsRichSizeCap` uses UTF-8 byte length via `TextEncoder`; 66_667-char CJK boundary test green (AC-16a)
- ✅ Editor has zero `FrontMatterStub` references (`grep` clean)
- ✅ Mount+unmount with fm-bearing value emits zero onChange (Finding 11)
- ✅ Harness desktop smoke: `<h1>Body</h1>` renders, fm stripped from DOM, post-edit emitted markdown starts with `'---\ntitle: Test Doc\n'`, contains `'edited'`
- ✅ All 87 prior unit tests stay green; 59 new tests land green (148 total)
- ✅ No new test-only deps installed (no `fast-check`)
- ✅ `pnpm -F web typecheck` — no new errors introduced (4 pre-existing unrelated-feature errors remain per Phase 1 debt log)

**Remaining deferred items** (LOW, plan-6 inline):
- Reference-format consistency in dossier (shorthand vs absolute paths) — not blocking
- Test-boundary synthetic→real handoff note for Phase 6.2 — Phase 6 owns
- TOML corpus check — Phase 6.2 corpus pinning can verify

**Next step**: `/plan-7-v2-code-review --phase "Phase 4: Utilities (TDD)" --plan "/Users/jordanknight/substrate/083-md-editor/docs/plans/083-md-editor/md-editor-plan.md"`







