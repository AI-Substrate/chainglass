Work request for role coder/remote-view-auth (prime pij-outer-bobcat, 2026-11-12). Backlog B14.

Read /Users/jordanknight/substrate/chainglass-governance/.harness/government/briefs/nav-wave-1.md first (worktree, landing, full fft per commit, keep builds for the reviewer, the tmux rule: never kill-server; `-L`/`-S`; mkdir 700 + prove the socket). Worktree slug: remote-view-auth. Output subject: plan:remote-view-auth.

## Bug (reviewer pij-unaware-quokka found it; prime verified in source)

Remote-view session create/delete through Next fails: `POST /api/remote-view/sessions` returns 500 "daemon POST /sessions failed: 401".

- Next sends the daemon JWT as an `Authorization: Bearer` header:
  `apps/web/src/features/088-remote-view/server/remote-view-service.ts` (create ~241-249, remove ~251-258).
- streamd's REST guard reads only the query token:
  `native/streamd/Sources/streamd/WSServer.swift` `handleREST` (~193-200): `RemoteViewAuth.verifyJWT(req.query["token"] ?? "", ...)`, and its comment says the token "rides the query string (?token=...) exactly like the WS upgrade - the Next proxy injects it".

## Change

Make the two sides agree, the boring way: Next sends the token as `?token=` on every daemon REST call
(matching streamd's documented contract and the WS upgrade), for create, remove and any other daemon REST
call. Do not change streamd unless you find a reason (if you do, ask the prime first; the Swift daemon
needs its own build). Find every Next -> streamd REST call, not just these two.

## Acceptance

- Test against the real request shape: a fake daemon that, like streamd, accepts only `?token=` -> create
  and remove succeed; the old header-only form would 401 (fail-before).
- Live: on a spare-port prod build with Next spawning the offline streamd fixture (or a real streamd if
  available), `POST /api/remote-view/sessions` returns success and `DELETE` works; `cg remote-view list`
  shows the session. Private tmux per the rule; stop everything after.
- Full `just fft` (nice -n 19) green; land by fast-forward; keep the build for the reviewer.
