# Fix Tasks: Phase 1: Domain Setup & Icon Resolver

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make `resolveFileIcon()` fully manifest-driven
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts`, `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts`
- **Issue**: The current resolver only checks the final suffix and a small hardcoded extension→language map, so valid Material Icon Theme keys such as `.env`, `d.ts`, `spec.ts`, and `route.tsx` resolve to the wrong icon.
- **Fix**: Implement longest-match lookup over `manifest.fileExtensions`, support leading-dot / compound suffixes, and reuse or extend the existing filename→language detection logic instead of maintaining a smaller duplicate map. Add regression tests for the failing real-manifest examples.
- **Patch hint**:
  ```diff
  - const ext = extractExtension(lowerFilename);
  - const langId = ext ? EXTENSION_TO_LANGUAGE_ID[ext] : undefined;
  + for (const candidate of getExtensionCandidates(lowerFilename)) {
  +   const iconName = manifest.fileExtensions[candidate];
  +   if (iconName) return toResolution(iconName, 'fileExtension', manifest);
  + }
  + const langId = detectLanguage(lowerFilename);
  ```

### FT-002: Return `iconPath` in the public resolver contract
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/types.ts`, `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts`, `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts`
- **Issue**: Phase 1 documents `IconResolution` as a path-bearing result, but the current type and implementation expose only `iconName` and `source`.
- **Fix**: Add `iconPath` to `IconResolution`, derive it from `manifest.iconDefinitions[iconName]`, and assert it in representative file, folder, fallback, and light-mode tests.
- **Patch hint**:
  ```diff
   export interface IconResolution {
     iconName: string;
  +  iconPath: string;
     source: 'fileName' | 'fileExtension' | 'languageId' | 'default';
   }
  
  - return { iconName: fileNameMatch, source: 'fileName' };
  + return toResolution(fileNameMatch, 'fileName', manifest);
  ```

## Medium / Low Fixes

### FT-003: Add manifest-loader tests and evidence
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts`, `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/`, `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md`
- **Issue**: T009 says `loadManifest()` validates shape and is verified, but the phase has no dedicated tests or recorded evidence for that claim.
- **Fix**: Add a loader-focused unit test (placeholder shape, cache reuse, cache clearing, unsupported theme behavior) and append the command/output evidence to `execution.log.md`. If validation is intentionally deferred, mark that clearly in the phase docs.
- **Patch hint**:
  ```diff
  + import { clearManifestCache, loadManifest } from '@/features/_platform/themes/lib/manifest-loader';
  +
  + it('returns the placeholder manifest shape and reuses the cache', async () => {
  +   const first = await loadManifest('material-icon-theme');
  +   const second = await loadManifest('material-icon-theme');
  +   expect(second).toBe(first);
  + });
  ```

### FT-004: Align domain artifacts with actual Phase 1 scope
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md`, `/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md`, `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md`
- **Issue**: The new domain doc mixes future Phase 3/4 components with current Phase 1 implementation, omits exported `loadManifest()`, the Domain Health Summary is stale, and the plan Domain Manifest omits the root dependency changes.
- **Fix**: Make the domain doc explicitly Phase 1 accurate, add the `_platform/themes` health-summary row, and update the plan Domain Manifest (or phase task paths) to cover `package.json` / `pnpm-lock.yaml` if the dependency install stays in Phase 1.
- **Patch hint**:
  ```diff
  - | `FileIcon` | Component | file-browser, _platform/panel-layout | ... |
  - | `FolderIcon` | Component | file-browser | ... |
  + | `loadManifest` | Function | internal (Phase 1) | Loads and caches the placeholder icon manifest |
  +
  + > Future work: `FileIcon`, `FolderIcon`, and SDK registration land in Phases 3-4.
  ```

### FT-005: Sync C4 architecture documentation for `_platform/themes`
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/073-file-icons/docs/c4/README.md`, `/Users/jordanknight/substrate/073-file-icons/docs/c4/containers/web-app.md`, `/Users/jordanknight/substrate/073-file-icons/docs/c4/components/_platform/themes.md`
- **Issue**: The repository instructions require C4 docs to be updated whenever a domain is added or renamed, but `_platform/themes` does not appear anywhere in `docs/c4/`.
- **Fix**: Add the new L3 component diagram and wire it into the C4 hub / web-app container index.
- **Patch hint**:
  ```diff
  + - [Themes](components/_platform/themes.md) — resolveFileIcon, resolveFolderIcon, loadManifest
  ```

### FT-006: Bring durable tests and evidence up to project rule standard
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts`, `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md`
- **Issue**: The new durable tests omit required Test Doc blocks, and the execution log records only the green state rather than the failing-first / passing sequence the dossier claims.
- **Fix**: Add the 5-field Test Doc comment to each durable `it()` block (or to a justified reusable helper pattern if project conventions allow it) and append RED→GREEN command evidence to the execution log.
- **Patch hint**:
  ```diff
   it('resolves .ts via languageIds (NOT in fileExtensions)', () => {
  +  /*
  +  Test Doc:
  +  - Why: Protect the `.ts` fallback that the real manifest requires.
  +  - Contract: `.ts` resolves through `languageIds` when `fileExtensions.ts` is absent.
  +  - Usage Notes: Uses real `material-icon-theme` manifest data.
  +  - Quality Contribution: Catches regressions in manifest priority order.
  +  - Worked Example: `app.ts` → `typescript` via `languageId`.
  +  */
      const result = resolveFileIcon('app.ts', manifest);
   });
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
