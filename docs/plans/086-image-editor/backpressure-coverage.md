# Backpressure Coverage — In-browser Image Editor (pen / annotation)

**Spec**: [image-editor-spec.md](./image-editor-spec.md)
**Generated**: 2026-06-07
**Certainty**: Partial

> Advisory only — informs `plan-3`. Never blocks, never gates, no scores. (See plan-2d-backpressure-survey.)

## Existing Sensors (inventory)

| Sensor | Command | Dimension |
|--------|---------|-----------|
| Build (Turbo/Next) | `just build` / `turbo build` | behaviour + maintainability (compiles; **catches the Next 15 `ssr:false`-from-server-component build break**) |
| Typecheck | `just typecheck` / `tsc --noEmit` | maintainability |
| Lint/format | `just lint` / `biome check .` | maintainability |
| Unit/integration tests | `just test` / `vitest run` | behaviour |
| Agent-CLI e2e | `just test-e2e` (vitest, `test/e2e/agent-cli-e2e`) | behaviour (CLI agents) |
| **Browser e2e (Playwright + CDP)** | `just test-harness` / `cd harness && pnpm playwright test` (connects to real Chromium over CDP @ `localhost:3000`, 3 viewports) | **behaviour (real-browser DOM, canvas, `toBlob`, console errors)** |
| **Harness CLI (Boot→Interact→Observe)** | `just harness {check-route <path>\|screenshot\|console-logs\|health\|doctor\|seed}` | behaviour (drive + observe the running app in-browser) |
| Harness health/boot | `just harness-health`, `just preflight`, `just smoke-test-agent` | behaviour (boot/health of the agent harness) |
| Security audit | `just security-audit` | maintainability (deps) |
| Aggregate gates | `just check` (lint+typecheck+test), `just fft` | mixed |

**Correction (2026-06-07)**: an earlier draft of this survey wrongly stated "no browser/DOM e2e." The repo **has** a browser-driving Playwright harness (`harness/playwright.config.ts`, CDP→Chromium, specs in `harness/tests/{smoke,features,responsive}/`), including **`markdown-wysiwyg-smoke.spec.ts`** — the direct structural precedent for an editor smoke test (navigate to a file route in edit mode, drive the editor, assert mount + no console errors + byte/round-trip preservation via a `data-*` test affordance). So canvas drawing, `toBlob` export, and CORS-taint detection are **browser-BUILDABLE**, not ABSENT.

**Remaining real gap**: no **architecture / dependency-direction rule** (e.g. dependency-cruiser) to enforce `viewer ↛ file-browser` — still ABSENT (buildable as a rule).

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier |
|--------------------------|----------------------|--------|------|
| AC-5 `-edited` idempotency (`foo-edited.png`→stays `foo-edited.png`) | `vitest` unit on filename-derivation pure fn | **BUILDABLE** | computational |
| AC-4 save-as-new unconditional replace | `vitest` + `FakeFileSystem` | **BUILDABLE** | computational |
| AC-3 overwrite mtime-conflict halts | `vitest` + `FakeFileSystem` (mtime/`expectedMtime`) | **BUILDABLE** | computational |
| AC-8 path security → `PathSecurityError` | `vitest` + `FakePathResolver` (traversal) | **BUILDABLE** (PathResolver contract tests EXIST; new action wiring needs its own) | computational |
| AC-9 binary integrity (Buffer write = valid bytes) | `vitest` round-trip: write known PNG buffer → read back → decode/assert | **BUILDABLE** | computational |
| AC-13 save-failure typed result (`write-failed`/conflict/security) | `vitest` + `FakeFileSystem.simulateError` | **BUILDABLE** | computational |
| AC-6 format→MIME/extension selection + JPEG-alpha-flatten policy | `vitest` unit on the format-mapping fn | **BUILDABLE** | computational |
| AC-7 resolution fidelity (saved dims == native dims) | `vitest` round-trip dimension assertion | **BUILDABLE** | computational |
| AC-14 large-image guard predicate (≥16.7M px or dim>4096) | `vitest` unit on the guard predicate | **BUILDABLE** | computational |
| Coordinate map (CSS px → image px under object-contain) | `vitest` unit on the pure transform | **BUILDABLE** | computational |
| AC-10 `ssr:false` / production build succeeds | `just build` | **EXISTS** | computational |
| AC-10 editor + lib stay out of initial bundle (lazy chunk) | bundle-analysis check (none today) | **BUILDABLE** (currently manual) | computational |
| AC-1 / AC-16 Edit shown for raster only (predicate) | `vitest` unit on `category==='image' && !svg` predicate | **BUILDABLE** | computational |
| AC-1 / AC-16 Edit control actually renders/hides | Playwright spec on the file-browser surface (`check-route` + DOM assertion) | **BUILDABLE** (browser; `markdown-wysiwyg-smoke` precedent) | computational |
| AC-17 canvas export succeeds, no CORS taint | Playwright spec: draw → save → assert `toBlob` resolves a Blob, no `SecurityError` in console | **BUILDABLE** (browser; CORS taint throws at `toBlob` and is catchable) | computational |
| Architecture: `viewer ↛ file-browser`; deps one-directional | dependency-direction rule (none today) | **ABSENT** | computational (buildable as a rule) |
| AC-2 pen feel / pressure / smoothness | — (the genuine eyeball/taste row) | ABSENT | inferential / human-judgement |
| AC-11/AC-12 save & cancel/discard UX flow | Playwright spec: mount editor → draw → Save/Cancel → assert outcome + file state | **BUILDABLE** (browser) | computational |
| AC-15 image-load-failure error state | Playwright spec on a bad/oversized image route → assert error state renders | **BUILDABLE** (browser) | computational |

## Certainty: Partial

The **core behaviour** — every save semantic (idempotent `-edited`, overwrite-mtime-conflict, unconditional save-as-new, typed failure), path security, binary integrity, format mapping, resolution fidelity, the large-image guard, and the coordinate transform — is cleanly **BUILDABLE** as `vitest` units against the existing `FakeFileSystem`/`FakePathResolver`. One behaviour criterion **EXISTS** (`just build` proves `ssr:false`/build success). The **browser-side** rows — canvas export / CORS taint (AC-17), edit-control render (AC-1/16), save+cancel UX (AC-11/12), image-load-failure (AC-15) — are **BUILDABLE via the existing Playwright + CDP harness**, following the `markdown-wysiwyg-smoke.spec.ts` precedent (an earlier draft wrongly called these ABSENT). Only **one** material item is genuinely **ABSENT**: the **architecture dependency-direction** rule (`viewer ↛ file-browser`) — buildable as a small rule/guard. The lone inherently-inferential row is **pen feel / pressure / smoothness** (AC-2), which correctly does not drag the rating down. → **Partial** (stronger than the first draft): the gaps are BUILDABLE — most as `vitest` units, the browser ones via the Playwright harness already in the repo — with nothing material left as a manual eyeball-gap except the one arch rule.

## Recommended Phase 0: Establish Backpressure

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| `saveImageService` test suite | AC-3, AC-4, AC-5, AC-8, AC-9, AC-13 | `vitest` integration with injected `FakeFileSystem` + `FakePathResolver` |
| Pure-function unit tests: filename-derivation, format→MIME, coordinate-map, large-image guard | AC-5, AC-6, AC-7(dims), AC-14 | `vitest` pure unit (no I/O) |
| Binary round-trip check | AC-7, AC-9 | data-check: write known image buffer → read back → assert dimensions + decodable |
| Lazy-chunk / bundle assertion | AC-10 (editor + perfect-freehand not in initial bundle) | build-output check (parse `.next` build manifest or a size budget) |
| Edit-affordance predicate test | AC-1, AC-16 (raster-only show/hide) | `vitest` unit on the content-type predicate |
| **Image-editor browser smoke spec** | AC-1/16 (render), AC-17 (canvas `toBlob`, no CORS taint), AC-11/12 (save/cancel UX), AC-15 (load-failure) | Playwright + CDP spec in `harness/tests/smoke/` (or `features/`), modelled on `markdown-wysiwyg-smoke.spec.ts`: navigate to image route in edit mode → draw via pointer events → Save → assert Blob + no `SecurityError` console event + round-trip dims via a `data-*` test affordance |
| _(advisory)_ Dependency-direction rule | Architecture: `viewer ↛ file-browser`, one-directional deps | dependency-cruiser rule **or** a small grep/test guard |

> **How this differs**: `plan-3` Gate G6 checks that *test tasks exist*; `plan-7` is the *inferential/eyeball* tier (post-hoc review). This survey is the *computational* tier *before* architecture — and (after the 2026-06-07 correction) it says: nearly the whole feature **can be proven deterministically** — the save/derivation logic with `vitest` units, and the browser-side canvas/CORS/UX behaviour with the **Playwright harness already in the repo** — leaving only the arch-boundary rule as an honest ABSENT, and pen-feel (AC-2) as the one true human-judgement row.
