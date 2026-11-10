# Chainglass government

This is the `prime-governance` orphan branch in its standing worktree
(`~/substrate/chainglass-governance` on the canonical machine). The o-prime is the
sole writer. It never merges to main: no PRs, no CI.

Governance rules: pij skill `references/prime/rituals/bootstrap.md` § Governance branch — the rules.

## Authority

- **Platform store is authoritative** for project, prime designation, assignments,
  events and seat truth: `pij project show chainglass`, `pij spine events --project chainglass`,
  `pij list --json`, `pij anomalies --json`.
- This tree holds documents only: local orient, briefs, handovers, rulings narrative.
  It never repeats store facts as competing prose.

## Layout

| Path | Holds |
|---|---|
| `orient-local.md` | Lever 2 orient for this repo (o-prime single writer) |
| `RULINGS.md` | Jordan's standing rulings, each with date and spine seq once recorded |
| `handover/` | Seat-rotation handovers, newest first by date |
| `briefs/` | Stream and PA briefs |

## Seat history

| Date | Seat | Event |
|---|---|---|
| 2026-11-10 | pij-lonely-antelope → pij-outer-bobcat | Jordan ruled rotation; antelope ran ungoverned (no project record, no government); bobcat created project `chainglass` (store seq 4319663) and this branch |
