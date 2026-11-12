# Nav speed wave — shared rules for every coder in this wave

Prime: pij-outer-bobcat · Source PRD: `../reports/nav-speed-review-2026-11-12.md` (web-perf-expert,
pij-lonely-antelope) · Probes: `../reports/nav-speed-evidence/` · Jordan 2026-11-12: "dispatch the fleet
from it".

## Where you work (this wave differs from the coder role default)

Several coders run at once, so **each works in its own worktree**, not the main tree:

```sh
git -C /Users/jordanknight/substrate/chainglass worktree add /Users/jordanknight/substrate/chainglass-<slug> -b <slug> origin/main
cd /Users/jordanknight/substrate/chainglass-<slug> && nice -n 19 pnpm install --frozen-lockfile
```

Landing is still Jordan's "commit and push main", via a fast-forward: when green,
`git fetch origin && git rebase origin/main`, re-run the affected tests, then
`git push origin HEAD:main`. A rebase conflict: stop and tell the prime, never force. After a
successful push, remove your worktree (`git -C /Users/jordanknight/substrate/chainglass worktree remove <path>`)
and delete the branch.

## Gates

- `just fft` at `nice -n 19` in your worktree before landing; read its full output.
- Jordan runs `just prod` on :3000 now. To measure prod, build your worktree and serve it on a spare
  port (3100 + your item number), niced, and stop it when done. Never touch :3000 or `just dev`.
  One build per change; the reviewer reuses it.
- Measure the PRD's "Done when" for your item before and after, on the same machine, and quote the
  load average next to each timing (load is high; say so rather than drop the number).
- **Full runs are serialized** (prime, 2026-11-12 11:20): one chainglass `just fft`/`just test` at a time,
  only at 1-min load < 60, in the order the prime gives; announce start/finish and hand on with "fft done".
- **Browser proofs never reach Jordan's tmux** (incident 2026-11-12, ctx-max): a spare-port server's
  terminal sidecar talks to the default tmux server, where Jordan's sessions live, and the overlay can
  attach one after a client-side navigation. Start your spare-port Next server and sidecar with `TMUX`
  unset and `TMUX_TMPDIR=/tmp/<slug>-tmux`, and make scratch sessions there.
- **The terminal keeps working, always** (Jordan, 2026-11-12): any change touching auth, `proxy.ts`,
  `instrumentation.ts`, the localhost guard, server startup, ports, or the terminal sidecar must show,
  on a spare-port build with a private tmux server, that xterm.js connects to its sidecar, accepts
  typing, streams output, and the window strip and resize still work, from localhost and from the
  LAN address. Same for remote view (`requireLocalAuth`) and the `cg` CLI's `X-Local-Token` path.

## Other coders in flight (do not edit their files without telling the prime)

| Holder | Item | Main files |
|---|---|---|
| coder/strip-067 | remove question popper + alerts | `features/067-question-popper/**`, `workspaces/[slug]/layout.tsx`, `/api/event-popper/**`, CLI |
| coder/ssr-dashboard | PRD item 1 | `features/063-login/components/auth-provider.tsx`, `app/(dashboard)/layout.tsx` |
| coder/home-prefetch | PRD items 3 + 5 | `app/(dashboard)/page.tsx`, worktree resolver caching, link `prefetch` |
| coder/dev-beside-prod | PRD item 4 | `apps/web/instrumentation.ts`, `justfile` prod recipes |
| coder/trace-idle | PRD items 6 + 7 (trace first) | read-mostly; fixes after the prime's go |

Item 2 (loading states, layout caching) waits for strip-067 to land, since both edit the workspace layout.

## Report

`pij output deliverable --role coder --subject 'plan:nav-<slug>' --body-file <path> --answers <request id>`:
commit SHAs on main, before/after numbers with load, tests added, anything left undone.
