# PRD: chainglass navigation and page-load speed

Author: pij-lonely-antelope (role web-perf-expert) · For: Jordan, pij-outer-bobcat · 2026-11-12
Brief: `briefs/nav-speed-review.md` · Investigation only; no product code was changed.

## Problem

Chainglass feels slow. Pages show the compiling indicator, clicks between pages take seconds, and
the dev server gets restarted often. Jordan switched to the production server during this review
(`just prod`, port 3000) and asked for the opportunities written up so the fleet can build them.

## Goal

A click between pages shows something within 0.3 s and is usable within 1 s on the production
server, on this machine, at normal load. Dev mode stays available for working on chainglass itself.

## Not in scope

- The alerts and question system (plan 067): already being removed by pij-vast-wombat. Its cost was
  one `/api/event-popper/list` fetch per workspace page load plus its always-mounted client code.
- Machine load from other projects (see "Context: the machine").

## Baseline

Measured 2026-11-12 on Jordan's machine with a headless Chromium probe (scripts and raw results in
the scratchpad, listed at the end). Dev = `just dev` (Next 16.4.2, Turbopack), 19 h uptime. Prod =
`just prod` from the build of 11 Nov 23:56.

| Page | Dev: JS loaded | Prod: JS loaded | Dev: fully loaded | Prod: server HTML complete |
|---|---|---|---|---|
| Home | 7.4 MB, 26 files | 0.9 MB, 20 files | 1.6 s | 2.1 to 5.5 s |
| Workspace | 10.6 MB, 36 files | 1.2 MB, 28 files | 5.6 s | 0.3 to 0.8 s |
| Browser | 17.4 MB, 54 files | 2.7 MB, 36 files | 6.3 s | 0.1 to 1.2 s |
| Terminal | 13.7 MB, 43 files | 2.1 MB, 32 files | 4.4 s | 0.06 to 0.3 s |
| Workflows | 11.2 MB, 39 files | 1.2 MB, 28 files | 4.6 s | not timed |
| Work units | 11.3 MB, 39 files | 1.2 MB, 28 files | 6.1 s | not timed |
| Pij | 11.7 MB, 42 files | 1.3 MB, 28 files | 0.2 s | not timed |

Other baseline facts:

- Dev, first visit to a page since server start: 1 to 3 s extra server time (workflows 3.0 s, work
  units 2.4 s, settings 2.4 s; second visit 0.07 to 0.11 s). This is the compiling indicator.
- Server memory: dev 1.27 GB after 19 h; prod 0.17 to 0.19 GB.
- Prod clicks between pages (client-side navigation, two laps): browser 1.0 s and 8.1 s, terminal
  3.9 s and 4.1 s, workflows 0.9 s and 3.8 s, work units 1.3 s and 1.0 s, pij 0.1 s and 0.01 s.
- Dev clicks between pages: one click to the browser page took 27.4 s and the next click (to the
  terminal) did not arrive within 60 s; on the second lap they took 2.1 s and 0.3 s. Cause not found.

**How far to trust the numbers.** The machine's load average was 59 at the start of the review and
reached 180 on 16 cores during the prod runs. Prod browser timings taken above load 100 are not
quoted here (home once took 74 s at load 127 and 3.7 s at load 72). Sizes, request counts and code
findings do not depend on load; timings do, and should be re-measured on a quiet machine.

## Opportunities, ranked by expected gain

### 1. Pages arrive empty and show nothing until all the JavaScript has run (dev and prod)

- **Evidence:** the server HTML for `/`, `/workspaces/chainglass` and the browser page contains no
  visible page content: 0, 23 and 23 characters of text ("Chainglass | Chainglass" is the title)
  once script tags are removed. Home is 155 KB of HTML, all of it script payload. In prod, first
  paint on home came at 3.76 s, the same moment the document finished (3.70 s).
- **Likely cause (to confirm):** `apps/web/src/features/063-login/components/auth-provider.tsx:9-15`
  loads next-auth's `SessionProvider` with `dynamic(..., { ssr: false })` and wraps every dashboard
  page in it from `apps/web/app/(dashboard)/layout.tsx:25-27`. A client component that does not
  render on the server renders none of its children on the server either.
- **Change:** make the dashboard tree render on the server. Options: render children outside the
  client-only provider, or fix the next-auth/React resolution problem the comment describes so
  `SessionProvider` can render on the server.
- **Done when:** the HTML for `/workspaces/<slug>` contains the sidebar and page markup with
  JavaScript disabled, and prod first paint on a workspace page is under 0.5 s.
- **Size:** CS 3. Risk: hydration mismatches in components that read browser state.

### 2. Every click waits for server work, with no loading state (dev and prod)

- **Evidence:** there are no `loading.tsx` files anywhere under `apps/web/app` (0 found), and 54
  route files set `force-dynamic`. A click therefore changes nothing on screen until the server
  finishes. Prod click to the browser page: 1.0 to 8.1 s; terminal 3.9 to 4.1 s.
- **Server work on the path:**
  - Browser page, `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx:42` runs
    `getInfo` (spawns `git worktree list`), then `:61-64` lists the root directory and runs
    `git log -1` once per worktree (`apps/web/src/lib/worktree-timestamps.ts:30`).
  - Workspace layout, `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx:57-63`, resolves the
    workspace twice per request (once in `generateMetadata` at `:66`, once in the layout at `:74`),
    each reading the full workspace list.
- **Change:** add `loading.tsx` skeletons for the workspace routes so a click paints immediately;
  wrap `resolveWorkspace` in React `cache()`; move worktree timestamps behind a `Suspense` boundary
  or a short-lived server cache; cache `git worktree list` results for a few seconds.
- **Done when:** a click between workspace pages paints a skeleton within 0.3 s in prod, and the
  browser page's server render spawns no more than one git process on a warm cache.
- **Size:** CS 3.

### 3. The home page runs git for every workspace before sending anything (dev and prod)

- **Evidence:** `apps/web/app/(dashboard)/page.tsx:29-45` calls `workspaceService.getInfo` for
  every workspace (about 30 registered), each of which spawns `git worktree list`
  (`packages/workflow/src/resolvers/git-worktree.resolver.ts:89-97`). Prod home HTML took 2.1 s,
  3.8 s and 5.5 s on three direct requests while other pages took 0.06 to 1.2 s.
- **Change:** send the card grid from the workspace list alone and stream worktree counts in after
  (Suspense per card, or a cached `/api` call); cache worktree detection.
- **Done when:** prod home HTML completes in under 0.5 s with 30 workspaces registered.
- **Size:** CS 2.

### 4. Use the production server day to day, and let dev run beside it (dev-only costs)

- **Evidence:** prod loads about 8 times less JavaScript per page (table above), has no compile
  wait, and uses about 7 times less memory. Two things block running dev alongside prod today:
  - `apps/web/instrumentation.ts:118-154` writes `.chainglass/server.json` at start and removes it
    at shutdown, so a second server in the same folder takes over the file the CLI tools read.
  - `justfile:117-126` (`prod-serve`) kills whatever is listening on its port before starting.
- **Change:** key `server.json` by port or mode (or refuse to overwrite a live server's entry), and
  make `prod-serve` fail rather than kill a live server unless told to. Add a documented pairing:
  prod on 3000 for use, dev on another port when changing chainglass. Time a rebuild and record it.
- **Done when:** `just dev` on a second port and `just prod` on 3000 run together, both discoverable
  by the CLI, and the rebuild time is written into the justfile comment.
- **Size:** CS 2. Open question for Jordan: is a rebuild per change acceptable for daily use?

### 5. Production link prefetching floods the server (prod only)

- **Evidence:** in prod, the home page issued about 40 background requests for workspace routes on
  load (one or two per workspace card and sidebar link). The work-units page requested each unit
  page 1 to 3 times on load and again while idle: 32 requests in 30 idle seconds. Every such request
  runs the `force-dynamic` layout work in item 2. Dev does not prefetch, so this is new on prod.
- **Change:** set `prefetch={false}` on link lists that scale with data (workspace cards, sidebar
  workspace list, work-unit list), or prefetch on hover only. Find why the work-units page repeats.
- **Done when:** prod home issues no more than 5 route prefetches on load and the work-units page
  issues none while idle.
- **Size:** CS 2.

### 6. Background server-action calls on idle pages (dev and prod; cause not traced)

- **Evidence:** request counts while a page sat idle for 30 s: workspace page 6 server-action POSTs
  (dev); browser page 7 (prod); pij page 6 (dev) and 3 (prod). On load the browser page made 16
  server-action POSTs in dev and 2 in prod (dev doubles effects, which does not explain 16).
- **Not done:** I could not name the actions; the probe that reads the action ids ran while the
  machine was at load 180 and the pages did not hydrate in time.
- **Change:** first task is a trace (log the `next-action` id per POST and map it through
  `.next/server/server-reference-manifest.json`), then replace polling actions with the existing
  SSE channels or stop them when the tab is hidden.
- **Done when:** an idle workspace page makes zero server-action calls in 60 s.
- **Size:** CS 2 to trace, fix size unknown.

### 7. The pij-rs event stream reconnects about every 7 seconds (dev and prod, server side)

- **Evidence:** `[pij-rs] event stream connected` appears 9,835 times in 19 h of
  `apps/web/.next/dev/logs/next-development.log`, logged from
  `apps/web/src/features/089-first-class-pij/server/start-pij-poller.ts:192`. No matching
  "reconnecting" warnings were logged, so the stream appears to end cleanly and reopen.
- **Change:** find why the stream ends (idle timeout on either side is the first suspect) and keep
  it open; at minimum stop logging each reconnect at info level.
- **Done when:** fewer than 10 connects per hour on an idle server.
- **Size:** CS 2. May need a pij-rs change; route that part to the pij project.

### 8. Smaller items

- `/api/auth/session` is fetched 2 times per page load in prod (3 to 4 in dev) and
  `/api/workspaces` is refetched on every click between pages. Cache both client-side.
- Dev log shows 30 "Unexpected import of module" hot-reload errors in 19 h; each can force a full
  page reload in dev. Dev only; worth one look at which module.
- Dev server start logs 17 ENOENT warnings from the pij flow watcher for workspaces whose
  `docs/plans` folder does not exist (`[pij] flow watcher error`). Harmless but noisy.

## Context: the machine

Not a chainglass fix, but it dominated the timings. During the review the load average went from 59
to 180 on 16 cores. Top users seen: the OrbStack VM (490% CPU), eight or more Copilot CLI processes
at 20 to 87% each, Rust builds, and the Defender and DLP daemons. Any target above should be checked
on a quiet machine.

## Suggested order

1. Item 1 (server-render the dashboard) and item 2 (loading states): the two that change how every
   click feels, in both modes.
2. Item 3 (home page) and item 5 (prefetch): small, and they matter most now that prod is in use.
3. Item 4 (dev beside prod).
4. Items 6 and 7: trace first, then fix.

## Evidence files

All under
`/private/tmp/claude-501/-Users-jordanknight-substrate-chainglass/e144359d-e66d-48f2-8095-b7f4dbf9705e/scratchpad/`:

- `nav-probe.mjs`: the probe (page loads, 30 s idle window, two laps of client-side navigation).
- `nav-probe-dev.json`: dev results. `nav-probe-prod.json`: prod results (taken at load 94 to 127).
- `home-probe.mjs`, `action-probe.mjs`: per-request timing probes.

These are in a session scratchpad and will not survive; copy them into the governance repo if they
should be kept.
