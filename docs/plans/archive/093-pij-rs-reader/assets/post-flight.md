# Post-flight — 093-pij-rs-reader

**Closed out**: 2026-09-08T02:40Z
**Archived to**: docs/plans/archive/093-pij-rs-reader/
**Shipped**: yes — on main, no PR (Jordan's standing push authorization). Final code sha `89a32b4e4`.

## Completion

| Check | Result |
|-------|--------|
| Units | u1–u4 (coder sweet-stork, `0cad1087b`); u5–u9 + Amendments 4–6 (silkworm, `bc57d806d`); review corrections (`f1b79236f`, `3650a9619`, `78f659c20`, `c93cbab49`, `89a32b4e4`) |
| Acceptance criteria | 8/8 with RAN receipts — `assets/dispatch/RECEIPTS-silkworm.md`. bp-0001 by operator restart; bp-0005 by the pij plan-139 deploy. ac-0003 re-specified from 2s to ≤10s (Amendment 4), then overtaken: all kinds now push live. |
| Reviews | `REVIEW-bc57d806d.md` REQUEST_CHANGES ×6 (upheld, closed); `REVIEW-f1b79236f.md` APPROVE + 3 LOW (closed); `REVIEW-c93cbab49.md` APPROVE, no findings. Cross-model (Claude Opus 5) vs coder (omp). |
| Latest gate | 547 files / 7403 tests, build, lint, 9/9 typechecks; `security-audit` red on 124 pre-existing advisories under Jordan's standing exception |

## Open / deferred items

_Carried into the archive on the prime's judgment; none blocks the shipped behaviour._

| Kind | Item | Where | Note |
|------|------|-------|------|
| open question | oq-0001 old→new id mapping during migration | plan.dd.json | Overtaken: legacy roster retired; plan-129 re-key pending upstream |
| open question | oq-0002 role/watchdog derivation against rs vocabulary | plan.dd.json | Half closed by pij plan 139 (roles live, `89a32b4e4`); watchdog still not carried by rs — explicit unavailable marker |
| open question | oq-0004 corpses reported idle | plan.dd.json | Handled permanently (liveness marker); pij 139 shipped close/reap, roster 918→867 on deploy |
| deferred | `data.unavailable` (federated peers) not surfaced | rs-pij-records.ts | Single machine today |
| deferred | chainglass search still spawns retired `fs2` | flowspace-mcp-client.ts | Own plan; Jordan's call. Gate fixed (`3650a9619`) |
| upstream | pij plan 138 (observability) / 139 landed; control-verb gap (compact) ledgered | pij ledger | — |

## Where the durable findings live

`assets/findings/rs-corpse-census.md`, `assets/findings/live-push-recheck-2026-09-06.md`
(three-writer root cause, `at=0`/empty payload, closure by 139), `assets/findings/pij-team-experiences-093.md`.
