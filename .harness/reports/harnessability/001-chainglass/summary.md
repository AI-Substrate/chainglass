# Harnessability — chainglass · B

**Operate-Today** A (93%) · **Adaptability** B (70%) · Readiness H4 · Confidence high
Proof ceiling: L4 today → target L5

_`final_grade` augments the tuple above; it never hides a weak axis — Adaptability (B/70%) trails Operate-Today (A/93%); weakest area = Architecture enforcement (E)._

## Matrix (A–F)

Setup A · State/interaction/observability A · Compounding-loop A · Seams A · Inner-loop A · Front-door+sensors A · Cold-start C · Structure C · State-evolution C · **Arch-enforcement E**

## Top blockers

1. [HIGH] CI typecheck narrower than local (root tsc only) — swap `ci.yml` for `just typecheck` (XS)
2. [HIGH] Architecture boundaries are prose, not a sensor — add dependency-cruiser to check+CI (M)
3. [HIGH] Root `*.md` sprawl + false `START_HERE.md` drown the front door (S)
4. [HIGH] "harness" means 5 things, no front-door disambiguation (S)
5. [HIGH] native/streamd has zero CI coverage — add a macOS job (M)

## Encode first (candidate harness surfaces — all WRAP existing commands)

- **boot** → `just dev` (or `just harness dev`) + `just preflight`
- **health** → `just preflight` / `GET /api/health` / `just harness-require`
- **proof** → `just check` + `just harness-verify <path>` + `just streamd-smoke`
- **observe** → minih `report.json` + `cg --json` + Playwright console logs
- **interact** → `DISABLE_GITHUB_OAUTH` + `cg --json` + `fake-streamd`/`createTestContainer`

## First safe agent session

Read `README.md`+`AGENTS.md` (skip the stale root scratch docs) → map via `docs/c4` + `docs/domains/registry.md` → disambiguate "harness" → read `harness-wishlist.md`+`docs/retros/` → `just preflight` (read-only).

---
Full report: `.harness/reports/harnessability/001-chainglass/report.md` · JSON: `.harness/reports/harnessability/001-chainglass/report.json` · Run dir: `.harness/reports/harnessability/001-chainglass/`
