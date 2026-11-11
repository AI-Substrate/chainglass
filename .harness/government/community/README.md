# Chainglass community

The Pij Emergent Community for chainglass: roles that hold what the fleet learns about this product
(Next.js 16 web app, `cg` CLI, shared packages) in memory and outputs that outlive any seat.

- Prime: designated in the store (`pij project show chainglass`); currently pij-outer-bobcat.
- Rules every holder follows: `../RULINGS.md` (Jordan's standing rulings) and the repo's `AGENTS.md`.
- Local orient: `../orient-local.md`. Briefs: `../briefs/`. Reports: `../reports/`.
- Routing table: `ROUTES.md` (generated; never hand-edit). Roles: `roles/<id>/role.dd.md`.

## How work lands here

- Jordan's ruling: commit and push **main** directly after a green `just fft` (no PRs). Jordan's dev
  server runs from the main tree and hot-reloads it: keep every save compiling.
- Never start, stop or restart `just dev`. Heavy runs at `nice -n 19`; one build per change, reviewers
  reuse it.
- Results are pij outputs (`pij output deliverable|verdict|note ...`), not chat. Subjects for commit
  work use the brief name: `plan:<brief-slug>`.
