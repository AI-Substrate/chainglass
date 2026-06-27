# Backpressure Coverage — Remote App View (T004 seam)

**Spec**: [remote-app-view-spec.md](./remote-app-view-spec.md)
**Generated**: 2026-06-23
**Certainty**: Partial
**Scope**: surveyed at the `pre-coding` seam for **Phase 5 · T004** (routes `/health` + `/windows` + web-side catalog). Idempotent — re-run per phase as the spec/tasks change. Phases 1–4 + T001–T003 are shipped with their own green sensors and are not re-surveyed here.

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)

## Existing Sensors (inventory)

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| Typecheck | `pnpm tsc --noEmit` (CI) · `just typecheck` (boot) | maintainability | root + `ci.yml` |
| Lint / format | `pnpm biome check .` (CI) | maintainability | root + `ci.yml` |
| Unit + contract suite | `pnpm vitest run` (CI: `--coverage`) | behaviour | `vitest.config.ts`, `test/` |
| remote-view service contract | `test/contracts/remote-view-service.contract.ts` (runs vs **fake AND real** adapter) | behaviour | `test/contracts/` |
| **Route-test precedent** (NextAuth-gated) | `test/unit/web/features/088-remote-view/token-route.test.ts` | behaviour | `test/unit/web/...` |
| Window-picker render | `test/unit/web/features/088-remote-view/window-picker.test.tsx` (card per `WindowDescriptor`, `onAttach`, loading/empty/error) | behaviour (AC-1 UI) | `test/unit/web/...` |
| Bundle guard | `test/unit/web/features/088-remote-view/bundle-guard.test.ts` | behaviour (AC-13) | `test/unit/web/...` |
| **Architecture guard** | `test/unit/web/architecture/platform-no-remote-view.test.ts` (`_platform ↛ 088-remote-view`, regex import scan) | architecture-fitness | `test/unit/web/architecture/` |
| Build | `pnpm turbo build` (CI) | maintainability | `ci.yml` |
| E2E (deferred) | `vitest.e2e.config.ts` · `harness/playwright.config.ts` (Playwright + CDP) | behaviour (Phase 7) | root / `harness/` |

CI gate (`ci.yml`) = lint → build → typecheck → `vitest run --coverage`, all required. The vitest suite + typecheck + biome are the de-facto PR proof gate an agent can trust locally.

## Coverage Matrix — T004

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail (required if ABSENT) |
|---|---|---|---|---|
| **T004-a** `/windows`+`/health` proxy logic (calls `manager.ensureDaemon()` incl. version-handshake before proxying) | new route test vs `FakeRemoteViewService`, mirroring `token-route.test.ts` | BUILDABLE | computational | — |
| **T004-c** `/windows` returns `WindowDescriptor[]` (shape) | route test asserts shape vs fake | BUILDABLE | computational | — |
| **T004-d** `/health` returns `{ok,…}` proxying the daemon verdict | route test vs fake | BUILDABLE | computational | — |
| **T004-b · cookie gate** missing/tampered bootstrap cookie → 401 | mirror `token-route.test.ts` cookie-gate cases | BUILDABLE | computational | — |
| **T004-b · NextAuth gate** unauthenticated session → 401 (AC-9) | NextAuth `auth()→401` branch | **ABSENT** at unit tier | inferential / e2e | `token-route.test.ts` header: NextAuth-401 "intentionally NOT unit-tested … covered by the Phase 7 e2e sweep"; grepped `vitest.e2e.config.ts` + `harness/playwright.config.ts` — **no remote-view-route e2e exists yet** |
| AC-1 picker renders catalog + emits `onAttach(windowId)` | `window-picker.test.tsx` | EXISTS | computational | — |
| Picker unchanged after fake→real swap of `use-remote-view-windows.ts` | `window-picker.test.tsx` + `bundle-guard.test.ts` | EXISTS | computational | — |
| **Catalog real data source** — host window enumeration (`streamd --list-windows`) | native window-list subcommand | **ABSENT** | human-judgement / manual smoke | grepped `native/` + `apps/web/src/features/088-remote-view/` for `list-windows\|listWindows\|--list-windows\|windowid` — **no match**; spec Testing Strategy: native capture "can't run in CI … manual smoke + spike" |
| Architecture: new route files don't invert `_platform ↛ remote-view` | `platform-no-remote-view.test.ts` | EXISTS | architecture-fitness / computational | — |
| Maintainability: types + format on new files | `tsc --noEmit`, `biome check .` | EXISTS | computational | — |
| AC-13 viewport stays lazy-loaded (base bundle unchanged) | `bundle-guard.test.ts` | EXISTS | computational | — |

## Certainty: Partial

T004's proxy/shape/picker/architecture rows are **EXISTS or BUILDABLE** — a route-test precedent (`token-route.test.ts`) is in hand, the picker + arch + bundle guards already exist. Two material rows hold the rating at **Partial**: the **"401 for unauthenticated (NextAuth gate)"** claim sits in the repo's *consciously-accepted* unit blind spot (deferred to a Phase-7 e2e that does not exist yet), and the **real catalog enumeration source is unbuilt and native-only** (can't be proven in CI).

> The load-bearing question: *what realistic wrong T004 still goes green?* A route that **forgets or mis-wires the NextAuth gate** passes every existing-tier test if those tests run against `FakeRemoteViewService` with `DISABLE_AUTH` and only assert the proxy + cookie gate. The NextAuth-401 guarantee is currently proven **nowhere**.

## Recommended Phase 0: Establish Backpressure

| Sensor to build | Proves | Suggested form |
|---|---|---|
| Route test for `/windows` + `/health` vs `FakeRemoteViewService` (mirror `token-route.test.ts`) | T004-a/c/d proxy + shapes + `ensureDaemon()` call | vitest route test |
| Bootstrap-cookie-gate 401 cases on the new routes | T004-b (cookie half) | vitest route test |
| **Decide the NextAuth-401 strategy** — either (a) document the Phase-7 e2e deferral in the new route test header exactly as `token-route.test.ts` does, **or** (b) add a `DISABLE_AUTH`-off harness that exercises the real `auth()→401` branch | closes/owns the NextAuth-gate blind spot honestly | decision → doc-note **or** e2e/unit test |
| **Resolve the enumeration source** — `streamd --list-windows` is unbuilt; pick: native subcommand now, or web-side fake + a manual-smoke checklist | T004 catalog real data (AC-1 host enumeration) | native subcommand **or** fake + manual-smoke note |

## Suggested "done when" lines (advisory)

| For criterion | Suggested line | Backed by |
|---|---|---|
| T004-a/c/d | done when the new `/windows`+`/health` route test is green vs `FakeRemoteViewService` (`pnpm vitest run test/unit/web/features/088-remote-view`) | BUILDABLE |
| T004-b (cookie) | done when bootstrap-cookie missing/tampered → 401 is asserted (mirrors `token-route.test.ts`) | BUILDABLE |
| T004-b (NextAuth) | done when **either** a remote-view e2e asserts unauthenticated→401 **or** the Phase-7 deferral is documented in the route-test header (matching the repo's accepted pattern) | thin — owns a known blind spot |
| Architecture | done when `platform-no-remote-view.test.ts` stays green with the new route files present | EXISTS |
| Catalog data source | done when the enumeration source is decided + recorded (closes the ⚠ OPEN DECISION) | thin — needs decision before T004 |

---

*A Backpressure Check is distinct from back pressure itself — proof comes from the sensors above, never from this survey. Computational tier surveyed pre-build per harness-foundations Rule 3 / Pattern 18.*
