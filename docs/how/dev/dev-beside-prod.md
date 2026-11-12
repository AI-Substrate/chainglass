# Dev beside prod

Use the production server for day-to-day work and run a dev server beside it only while you are
changing chainglass. Prod loads about 8x less JavaScript per page, never waits on a compile, and
uses about 7x less memory (nav speed review, 2026-11-12).

## The pairing

| Server | Command | Port | Use |
|---|---|---|---|
| prod | `just prod` | 3000 | using chainglass |
| dev | `PORT=3010 just dev` | 3010 (any free port) | changing chainglass, hot reload |

Each recipe also starts the terminal sidecar on `PORT + 1500` (4500 and 4510 above).

Both run from the same checkout. Each server writes its own entry,
`.chainglass/servers/<port>.json` (port, pid, startedAt, `mode: dev|prod`, `localToken`), and
removes only its own entry at shutdown, so neither takes over the other.

## Which server the CLI talks to

`cg` (wf commands with `--server`, `cg remote-view`), the MCP server, and the `wf-*` recipes pick
one live entry:

1. `--server-url` / `CG_SERVER_URL`, if set.
2. `CG_SERVER_PORT=<port>`: exactly that server, or a "not running" error.
3. Otherwise the prod server, then the lowest port.

```bash
just preflight                          # lists every live server and the one the CLI targets
just wf-run my-flow                     # prod (3000)
CG_SERVER_PORT=3010 just wf-run my-flow # the dev server
```

Inside the web server, token checks (`proxy.ts`, `requireLocalAuth`, the workflow execution
routes) read only that server's own entry, so a token is valid only on the server that issued it.

## Ports are never stolen from a live server

- `just prod` / `just prod-serve` refuse to start when anything listens on `PORT` or
  `PORT + 1500`. `just prod` checks before building, so a refusal costs nothing.
- `just dev` / `just dev-https` still kill a stale listener on their ports, but refuse when the port
  belongs to a live prod server.
- `KILL_EXISTING=1` kills the listener in both cases, e.g. `KILL_EXISTING=1 just prod` to replace
  a running prod server with a fresh build.

## Prod serves its own copy of the build

Every `next build` (`just fft`, `just build`, `just prod`) clears and rewrites `apps/web/.next`. A
prod server serving from `.next` loses its chunks mid-build and every page goes blank. So prod never
serves `.next`:

1. `just prod` builds into `.next` as usual, then clones it (minus `cache`, `dev`, `standalone`,
   traces) to `apps/web/.next-prod-<port>.staged`. `cp -c` makes this an APFS clone: about 2 s.
2. `just prod-serve` claims the ports, swaps the staged copy into `apps/web/.next-prod-<port>`,
   and runs `next start` with `CHAINGLASS_DIST_DIR=.next-prod-<port>` (read by
   `apps/web/next.config.mjs`; builds ignore it).

The copy sits beside `.next`, at the same depth, because the build's `node_modules` symlinks are
relative. `.next-prod-*` is ignored by git, biome, and the source file watcher.

## Rebuilding prod after a change

Prod has no hot reload. To ship a change into a running prod server: `KILL_EXISTING=1 just prod`.
The old server keeps serving its copy during the build and is stopped only to swap in the new
copy and restart. Measured 2026-11-12: `pnpm turbo build` with nothing cached took 31 s (load
~40); staging the clone took ~9 s and prod was down ~3 s, from kill to `Ready` (load ~76).
