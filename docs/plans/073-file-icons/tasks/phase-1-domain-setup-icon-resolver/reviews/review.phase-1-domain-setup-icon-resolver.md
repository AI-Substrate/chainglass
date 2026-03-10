# Code Review: Phase 1: Domain Setup & Icon Resolver

**Plan**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md
**Spec**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-spec.md
**Phase**: Phase 1: Domain Setup & Icon Resolver
**Date**: 2026-03-09
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

The resolver implementation does not yet satisfy the Phase 1 contract: it misses valid manifest cases and never returns icon paths, so downstream consumers cannot rely on the advertised API.

**Key failure areas**:
- **Implementation**: `resolveFileIcon()` misses leading-dot and compound manifest keys (`.env`, `d.ts`, `spec.ts`, `route.tsx`) and falls back incorrectly.
- **Domain compliance**: `_platform/themes` documentation and plan/domain artifacts are not fully phase-accurate or synchronized.
- **Reinvention**: The extension→language bridge partially duplicates `apps/web/src/lib/language-detection.ts`.
- **Testing**: Core resolver tests pass, but `iconPath` / `loadManifest()` coverage and auditable RED→GREEN evidence are missing.
- **Doctrine**: Durable tests omit required Test Doc blocks, and C4 artifacts were not updated for the new domain.

## B) Summary

This phase establishes the `_platform/themes` domain and a useful first pass at manifest-backed icon resolution, but the implementation is not yet complete enough to approve. The largest gap is correctness: the resolver only checks a single trailing suffix and a tiny hardcoded language map, which misses valid Material Icon Theme keys that the phase explicitly set out to support. Domain docs are mostly in place, yet the new domain definition, domain-map summary, plan manifest, and C4 inventory are not fully synchronized with what Phase 1 actually ships. Testing evidence is solid for 25 passing resolver cases, but it does not prove the promised `iconPath` contract or the manifest-loader behavior, and harness validation correctly found no live UI surface to validate yet.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid / TDD focus:
- [x] Core resolver validation tests present
- [x] Folder resolution critical paths covered
- [ ] Resolver output contract (`iconPath`) asserted
- [ ] Manifest loader validation/cache behavior tested
- [ ] RED→GREEN evidence recorded for the TDD tasks

Universal (all approaches):
- [ ] Only in-scope files changed and reflected in plan/domain manifest
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts:4-13,40-66,108-111` | correctness | `resolveFileIcon()` only checks the last suffix plus an 8-entry hardcoded language map, so valid manifest cases like `.env`, `index.d.ts`, `button.spec.ts`, and `app.route.tsx` resolve incorrectly. | Implement longest-match lookup over `manifest.fileExtensions`, support leading-dot / compound keys, and reuse a complete filename→language strategy. |
| F002 | HIGH | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/types.ts:31-37`<br/>`/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts:20-70` | scope | Phase 1 documents a path-bearing resolver contract, but `IconResolution` omits `iconPath` and the resolver never consults `manifest.iconDefinitions`. | Add `iconPath` to the public type, derive it from `iconDefinitions`, and assert it in resolver tests. |
| F003 | MEDIUM | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts:1-42`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md:36-42` | testing | T009 claims shape validation, but `loadManifest()` has no unit tests or concrete evidence for validation, caching, or unsupported theme handling. | Add manifest-loader tests or explicitly defer shape validation to Phase 2 and update the phase dossier / execution log. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md:29-86`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md:22-49`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md:161-186` | domain-compliance | The new domain docs are not phase-accurate: they document future components/consumers as current, omit exported `loadManifest()`, and the phase plan/domain-map summary are not fully synchronized with the actual changed files. | Align `domain.md`, the plan Domain Manifest, and the Domain Health Summary with Phase 1 reality. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/073-file-icons/docs/c4/README.md:23-35`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/c4/containers/web-app.md:12-74` | doctrine | `_platform/themes` was added as a new domain, but C4 artifacts still omit it entirely. | Add `/Users/jordanknight/substrate/073-file-icons/docs/c4/components/_platform/themes.md` and update the README / web-app container indexes in the same change. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:35-210`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md:28-42` | doctrine | Durable resolver tests omit the required 5-field Test Doc blocks, and the execution log records only the green end state instead of auditable RED→GREEN evidence. | Add Test Doc comments to the durable tests and append failing-first / passing evidence to `execution.log.md`. |
| F007 | LOW | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts:4-13`<br/>`/Users/jordanknight/substrate/073-file-icons/apps/web/src/lib/language-detection.ts:10-102` | reinvention | The new extension→language bridge duplicates part of the existing `detectLanguage()` logic and is already drifting in coverage. | Reuse or extract the existing mapping logic instead of maintaining a smaller duplicate table. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts:4-13,40-66,108-111`
  - The resolver is not fully manifest-driven. Verified against real `material-icon-theme` data, the current implementation returns:
    - `.env` → `{ iconName: 'file', source: 'default' }`
    - `index.d.ts` → `{ iconName: 'typescript', source: 'languageId' }` instead of `typescript-def`
    - `button.spec.ts` → `{ iconName: 'typescript', source: 'languageId' }` instead of `test-ts`
    - `app.route.tsx` → `{ iconName: 'react_ts', source: 'fileExtension' }` instead of `routing`
  - Root cause: `extractExtension()` only returns the final suffix, and `EXTENSION_TO_LANGUAGE_ID` covers only 8 extensions.

- **F002 (HIGH)** — `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/types.ts:31-37` and `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts:20-70`
  - Phase 1 defines `IconResolution` as including `iconPath`, and the task brief says the resolver maps filenames to icon paths. The exported type and implementation currently return only `{ iconName, source }`.
  - Because `manifest.iconDefinitions` is never consulted, downstream consumers still cannot render the actual asset path from the public API.

- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts:1-42`
  - `loadManifest()` is present and exported, but it is effectively an unverified placeholder. There is no test coverage for shape validation, cache reuse, cache clearing, or theme handling.
  - The execution log states validation happened, but it does not cite any concrete test output for this function.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files live under `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/`, and the new domain doc lives under `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/` as declared. |
| Contract-only imports | ✅ | New runtime code imports only local domain files. The test imports `material-icon-theme` directly for real-manifest coverage, with no cross-domain internal imports. |
| Dependency direction | ✅ | `file-browser → themes` and `themes → sdk` are allowed directions (business→infrastructure and infrastructure→infrastructure). No infrastructure→business import was introduced. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md` describes future components/consumers as if they already exist and omits the currently exported `loadManifest()` contract/concept. |
| Registry current | ✅ | `/Users/jordanknight/substrate/073-file-icons/docs/domains/registry.md` includes the `Themes | _platform/themes | infrastructure | _platform | Plan 073 — File Type Icons | active` row. |
| No orphan files | ❌ | `/Users/jordanknight/substrate/073-file-icons/package.json` and `/Users/jordanknight/substrate/073-file-icons/pnpm-lock.yaml` changed for Phase 1, but the plan's Domain Manifest does not list them. |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md` adds the node to the Mermaid graph, but the Domain Health Summary table has no `_platform/themes` row. |
| Map edges current | ✅ | The new diagram edges are labeled. No unlabeled theme dependency was introduced. |
| No circular business deps | ✅ | No new business→business cycle was introduced by the phase changes. |
| Concepts documented | ⚠️ | A Concepts table exists, but it misses the exported `loadManifest()` behavior and mixes current Phase 1 concepts with future-only component concepts. |

Domain compliance findings:
- **F004 (MEDIUM)** — `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md:29-86`, `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md:22-49`, `/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md:161-186`
  - Domain artifacts exist, but they are not yet synchronized with the actual Phase 1 surface.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Extension→language bridge in `icon-resolver.ts` | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/lib/language-detection.ts` | `_platform/viewer` | LOW — prefer reuse/extension to avoid drift |

### E.4) Testing & Evidence

**Coverage confidence**: 76%

| AC | Confidence | Evidence |
|----|------------|----------|
| Phase 1 deliverable: `resolveFileIcon` priority + fallback | 92 | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:35-161` exercises `fileNames`, `fileExtensions`, `languageIds`, default fallback, and light override behavior with real manifest data. |
| Phase 1 deliverable: `resolveFolderIcon` named/default folders | 90 | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:164-210` covers `src`, `node_modules`, `test`, `.git`, expanded variants, and default folder fallbacks. |
| AC-3: Unknown extensions fall back gracefully | 95 | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:115-133` asserts `.xyz`, unknown dotfiles, and random no-extension inputs resolve via `source: 'default'`. |
| AC-4: Special filenames are recognized | 88 | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:36-66` covers `package.json`, `Dockerfile`, `.gitignore`, `tsconfig.json`, and `justfile`; `README.md` is also exercised in the markdown case. |
| AC-12: New icon resolver tests exist | 72 | `pnpm vitest run test/unit/web/features/_platform/themes/icon-resolver.test.ts --config vitest.config.ts` passed `25/25`, but `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md:28-42` preserves only the green end state. |
| AC-14: Manifest-driven resolver | 68 | Tests build the manifest from `material-icon-theme.generateManifest()`, but they do not assert `iconPath` or multi-part / leading-dot manifest keys, so the advertised contract is only partially covered. |
| T009: `loadManifest(themeId)` placeholder validated | 30 | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts:1-42` exists, but `rg loadManifest|clearManifestCache /Users/jordanknight/substrate/073-file-icons/test` returned no test coverage. |

### E.5) Doctrine Compliance

- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/073-file-icons/docs/c4/README.md:23-35` and `/Users/jordanknight/substrate/073-file-icons/docs/c4/containers/web-app.md:12-74`
  - The repository instructions require C4 diagrams to stay in sync with domain changes, but `_platform/themes` is missing from the C4 hub, the web-app container diagram, and the component diagram inventory.

- **F006 (MEDIUM)** — `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:35-210`
  - The new durable test suite omits the required Test Doc blocks from `docs/project-rules/rules.md#R-TEST-002,R-TEST-003`.
  - The execution log also needs failing-first evidence to support the RED→GREEN claim in the task dossier.

### E.6) Harness Live Validation

Harness status: **HEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| Harness health / live-validation precondition | Read `/Users/jordanknight/substrate/073-file-icons/docs/project-rules/harness.md`, then ran `just harness dev`, `just harness doctor --wait 120`, and `just harness health` | PASS | Final health was ok: app `http://127.0.0.1:3181` returned 200, MCP was up with 406, terminal sidecar on 4681 was up, and CDP on 9303 reported Chrome/136.0.7103.25. |
| Phase 1 domain docs | Assessed whether the changed documentation artifacts have any harness-observable runtime surface | SKIP | The domain doc, registry, and domain-map updates are static artifacts with no live runtime surface to validate through the harness. |
| Phase 1 resolver logic and tests | Searched for runtime consumers of `resolveFileIcon`, `resolveFolderIcon`, and `loadManifest` while the harness was healthy | SKIP | No file-browser, panel-layout, or viewer runtime path imports the new resolver yet. |
| Phase 1 manifest loader placeholder | Inspected the loader implementation for live observability | SKIP | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts` is not yet wired to any route or component. |

Summary: The harness is available and healthy, but Phase 1 does not yet expose a meaningful live UI surface. Static review and targeted unit evidence are the authoritative validation sources for this phase.

## F) Coverage Map

Plan-wide UI / asset-pipeline acceptance criteria intentionally deferred to later phases (for example AC-1/2/5/6/7/8/9/10/11/13/15) are excluded from the confidence score below.

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| P1-1 | `resolveFileIcon()` respects `fileNames → fileExtensions → languageIds → default` | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:35-161`; `pnpm vitest run test/unit/web/features/_platform/themes/icon-resolver.test.ts --config vitest.config.ts` | 92 |
| P1-2 | `resolveFolderIcon()` resolves named folders and defaults | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:164-210` | 90 |
| AC-3 | Unknown extensions fall back gracefully | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:115-133` | 95 |
| AC-4 | Special filenames are recognized | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts:36-66` | 88 |
| AC-12 | New icon resolver tests exist | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts`; `25/25` passing run in the reviewer command log | 72 |
| AC-14 | Resolver is manifest-driven rather than hardcoded | Real-manifest test setup plus reviewer verification scripts; gaps remain for compound keys and `iconPath` | 68 |
| T009 | `loadManifest(themeId)` placeholder is validated and evidenced | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts:1-42` exists, but no dedicated test/evidence exists | 30 |

**Overall coverage confidence**: **76%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager status --short -- docs/domains/_platform/themes/domain.md docs/domains/registry.md docs/domains/domain-map.md apps/web/src/features/_platform/themes test/unit/web/features/_platform/themes docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver
git --no-pager log --oneline -- docs/domains/_platform/themes/domain.md docs/domains/registry.md docs/domains/domain-map.md apps/web/src/features/_platform/themes test/unit/web/features/_platform/themes docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver | head -40
# Computed diff assembled from git diff + git diff --no-index for new files and saved to:
# /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/reviews/_computed.diff
pnpm vitest run test/unit/web/features/_platform/themes/icon-resolver.test.ts --config vitest.config.ts
node - <<'NODE'
# inspected material-icon-theme manifest keys for .env, index.html, config.yaml, index.d.ts, button.spec.ts, app.route.tsx
NODE
pnpm exec tsx <<'TS'
# executed resolveFileIcon() against real manifest data for .env, index.html, config.yaml, index.d.ts, button.spec.ts, app.route.tsx
TS
just harness dev
just harness doctor --wait 120
just harness health
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md
**Spec**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-spec.md
**Phase**: Phase 1: Domain Setup & Icon Resolver
**Tasks dossier**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/tasks.md
**Execution log**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md
**Review file**: /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/reviews/review.phase-1-domain-setup-icon-resolver.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/substrate/073-file-icons/docs/domains/registry.md` | modified | cross-domain | None if the dependency/support-file drift is documented elsewhere |
| `/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md` | modified | cross-domain | Add `_platform/themes` to the Domain Health Summary and re-check map sync |
| `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md` | created | `_platform/themes` | Make contracts/concepts/composition/dependencies phase-accurate |
| `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/index.ts` | created | `_platform/themes` | Decide whether `loadManifest` stays public and sync docs accordingly |
| `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/constants.ts` | created | `_platform/themes` | None |
| `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/types.ts` | created | `_platform/themes` | Add `iconPath` to `IconResolution` if the documented contract is retained |
| `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts` | created | `_platform/themes` | Fix compound/leading-dot resolution, add path-bearing output, and reduce mapping duplication |
| `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts` | created | `_platform/themes` | Add tests/evidence or explicitly defer validation |
| `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts` | created | `_platform/themes` | Add regression coverage, `iconPath` assertions, and required Test Doc blocks |
| `/Users/jordanknight/substrate/073-file-icons/package.json` | modified | cross-domain | Keep the dependency if Phase 1 owns it, but reflect it in the plan Domain Manifest |
| `/Users/jordanknight/substrate/073-file-icons/pnpm-lock.yaml` | modified | cross-domain | Keep in sync with `package.json`; no separate fix beyond manifest/documentation sync |
| `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/tasks.md` | created | plan-artifact | Update task wording/paths if dependency install or validation scope changes |
| `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/tasks.fltplan.md` | created | plan-artifact | None |
| `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md` | created | plan-artifact | Add RED→GREEN evidence and manifest-loader validation evidence |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts` | Support compound and leading-dot manifest keys with longest-match lookup | The current resolver mis-resolves real manifest cases like `.env`, `d.ts`, `spec.ts`, and `route.tsx` |
| 2 | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/types.ts`<br/>`/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/icon-resolver.ts`<br/>`/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts` | Add `iconPath` to the public contract and assert it in tests | Phase 1 promises path-bearing results, but the implementation and tests stop at `iconName` |
| 3 | `/Users/jordanknight/substrate/073-file-icons/apps/web/src/features/_platform/themes/lib/manifest-loader.ts`<br/>`/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/tasks/phase-1-domain-setup-icon-resolver/execution.log.md` | Add loader validation/cache tests and record evidence | T009 is currently claimed but not demonstrated |
| 4 | `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md` | Align docs/manifests/health summary with Phase 1 reality | Current domain docs and plan artifacts overstate future work and omit some actual changes |
| 5 | `/Users/jordanknight/substrate/073-file-icons/docs/c4/README.md`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/c4/containers/web-app.md`<br/>`/Users/jordanknight/substrate/073-file-icons/docs/c4/components/_platform/themes.md` | Sync C4 architecture docs for the new domain | Project rules require C4 updates in the same PR when domains change |
| 6 | `/Users/jordanknight/substrate/073-file-icons/test/unit/web/features/_platform/themes/icon-resolver.test.ts` | Add Test Doc blocks and keep the durable tests rule-compliant | The new tests currently violate `R-TEST-002` / `R-TEST-003` |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/substrate/073-file-icons/docs/domains/_platform/themes/domain.md` | Phase-accurate contracts/concepts/composition/dependencies; current `loadManifest()` coverage |
| `/Users/jordanknight/substrate/073-file-icons/docs/domains/domain-map.md` | `_platform/themes` row in the Domain Health Summary |
| `/Users/jordanknight/substrate/073-file-icons/docs/c4/README.md` | Themes domain quick link / inventory entry |
| `/Users/jordanknight/substrate/073-file-icons/docs/c4/containers/web-app.md` | Themes infrastructure component and index row |
| `/Users/jordanknight/substrate/073-file-icons/docs/c4/components/_platform/themes.md` | New L3 component diagram for `_platform/themes` |
| `/Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md` | Domain Manifest entries for `/Users/jordanknight/substrate/073-file-icons/package.json` and `/Users/jordanknight/substrate/073-file-icons/pnpm-lock.yaml` if the dependency remains in Phase 1 |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/073-file-icons/docs/plans/073-file-icons/file-icons-plan.md --phase 'Phase 1: Domain Setup & Icon Resolver'
