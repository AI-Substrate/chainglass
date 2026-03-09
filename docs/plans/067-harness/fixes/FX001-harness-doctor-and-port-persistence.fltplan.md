# Flight Plan: Fix FX001 — Harness Doctor + Port Persistence

**Fix**: [FX001-harness-doctor-and-port-persistence.md](FX001-harness-doctor-and-port-persistence.md)
**Status**: Landed

## What → Why

**Problem**: Zero-context agents flail with 8+ diagnostic steps when the harness is booting, and `docker compose` ignores dynamic port allocation because no `.env` persists the computed ports.

**Fix**: Add `harness doctor` (layered cascade with actionable fixes), generate `.env` during `harness dev`, and simplify the test prompt.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| external (harness) | owns | New doctor command, .env generation, container age/log helpers |
| cross-domain (docs) | documents | Updated harness.md + test prompt |

## Stages

- [x] **Stage 1: SDK helpers** — Container age, logs, diagnostic cascade (`lifecycle.ts`, `diagnose.ts`)
- [x] **Stage 2: CLI + .env** — Doctor command, .env generation in dev (`doctor.ts`, `dev.ts`)
- [x] **Stage 3: Tests + docs** — Doctor unit tests, updated prompt, harness.md (`diagnose.test.ts`, prompt, docs)

## Acceptance

- [x] `harness doctor` returns actionable fixes at each failure layer
- [x] `harness dev` generates `.env` so `docker compose up` uses correct ports
- [x] Updated prompt works for zero-context agents
