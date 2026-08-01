# The served-payload check

**Why:** `just typecheck` exit 0 proves the *source* is coherent. It proves nothing about what
the browser receives. The dev server pins its pij poller to `globalThis` so the singleton
survives HMR — which means a merged, on-disk fix **cannot reach the running instance**. Merged
is not running.

Run this whenever the UI shows something the code says it shouldn't, and before you conclude a
fix is live.

## The check

```bash
TOKEN=$(python3 -c "import json;print(json.load(open('.chainglass/server.json'))['localToken'])")
curl -s -H "X-Local-Token: $TOKEN" \
  "http://localhost:3000/api/pij/fleet?workspace=$PWD" \
  | python3 -m json.tool | head -40
```

Rows are under `.data.rows`; status cards under `.data.statuses`. The envelope carries `seq`
and `at` — **quote both when you relay a result**, or your measurement silently becomes a claim
about the present.

To check one field on one seat:

```bash
curl -s -H "X-Local-Token: $TOKEN" "http://localhost:3000/api/pij/fleet?workspace=$PWD" \
  | python3 -c "import json,sys; print([(r['id'], r.get('orchestrationRole')) for r in json.load(sys.stdin)['data']['rows']])"
```

## What a good answer looks like

- **Values match the CLI.** Compare against `pij list --json`. A field the CLI reports and the
  endpoint doesn't — or reports differently — means the server is running older code, not that
  the data is wrong.
- **`{"error":"bootstrap-required"}`** means the token is missing or wrong. It is *not* a
  bootstrap problem and `bootstrap-code.json` is not the file you want — the credential is
  `localToken` in `.chainglass/server.json`, sent as `X-Local-Token`.
- **A disagreement is not fixed by editing, merging, or reloading the browser.** The pinned
  singleton keeps its original module closure. Only a dev-server restart clears it, and that is
  Jordan's call — report the diagnosis, don't restart.

## The failure this exists to prevent

2026-08-01: a live PA rendered `ROLE UNKNOWN`. The store, the descriptor and the on-disk code
all said `orchestrationRole: 'pa'`. The **served** row said `null`, because the dev server had
started ~15h before the fix merged. Three seats measured three upstream layers and none measured
the served payload; the browser was faithfully rendering what it had been given.
