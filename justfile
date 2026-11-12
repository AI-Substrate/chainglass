# Chainglass Development Commands
# Usage: just <command>
# Run `just --list` to see all available commands

# Default recipe - show available commands
default:
    @just --list

# Install dependencies, build, and link CLI globally
install:
    pnpm install --ignore-scripts
    pnpm build
    pnpm install
    chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper 2>/dev/null || true
    @cd apps/cli && pnpm link --global 2>/dev/null || echo "Note: Run 'pnpm setup' and restart your shell to enable global 'cg' command"

# Start development server (Next.js + terminal WebSocket sidecar)
# PORT env var controls both: Next.js listens on PORT, sidecar on PORT+1500 (default 3000).
# Dev beside prod: with `just prod` on 3000, run dev on another port, e.g. `PORT=3010 just dev`.
# A stale process on the port is killed, but a live prod server is never touched (see _claim-ports).
# `--filter=@chainglass/web` runs web's dev server plus builds of only the packages it imports
# (shared, workflow, positional-graph). Unfiltered, turbo also scheduled cli#dev, whose ^build pulls
# in a full `next build` of web on every start (rewriting apps/web/.next) for no dev benefit.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    NEXT_PORT=${PORT:-3000}
    WS_PORT=$((NEXT_PORT + 1500))
    just _claim-ports dev $NEXT_PORT $WS_PORT
    just _clear-stale-dev-cache
    cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    cd "$OLDPWD"
    PORT=$NEXT_PORT TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} \
      pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
        "pnpm turbo dev --filter=@chainglass/web -- --port $NEXT_PORT" \
        "pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"

# Free the ports a server is about to bind. `mode` is the server being started:
# - dev: kills a stale listener, unless the port belongs to a live prod server (its
#   .chainglass/servers/<port>.json says mode prod) — then it refuses.
# - prod: refuses whenever something listens, so `just prod` never kills a running server.
# KILL_EXISTING=1 kills the listener in both modes. Nothing is killed unless every port passes.
# CLAIM_CHECK_ONLY=1 reports and refuses but never kills (`just prod` runs it before building).
_claim-ports mode +ports:
    #!/usr/bin/env bash
    set -euo pipefail
    REFUSED=false
    TO_KILL=""
    for p in {{ports}}; do
      PIDS=$(lsof -ti TCP:$p -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' || true)
      [ -z "${PIDS// /}" ] && continue
      CMD=$(ps -p "$(echo $PIDS | tr ' ' ',')" -o command= 2>/dev/null | head -1 || echo "unknown")
      ENTRY=".chainglass/servers/$p.json"
      LIVE_PROD=false
      if [ -f "$ENTRY" ] && grep -q '"mode": "prod"' "$ENTRY"; then LIVE_PROD=true; fi
      if [ "${KILL_EXISTING:-}" = "1" ] || { [ "{{mode}}" = "dev" ] && [ "$LIVE_PROD" = false ]; }; then
        ACTION="killing it"; [ -n "${CLAIM_CHECK_ONLY:-}" ] && ACTION="will kill it once the build is ready"
        echo "⚠️  Port $p in use by PID $PIDS($CMD); $ACTION"
        TO_KILL="$TO_KILL $PIDS"
      else
        echo "❌ Port $p in use by PID $PIDS($CMD)"
        REFUSED=true
      fi
    done
    if [ "$REFUSED" = true ]; then
      echo "   Not killing a live server. Use another port (PORT=3010 just {{mode}}), or replace it:"
      echo "   KILL_EXISTING=1 just {{mode}}. \`just preflight\` lists the running servers."
      exit 1
    fi
    if [ -n "${TO_KILL// /}" ] && [ -z "${CLAIM_CHECK_ONLY:-}" ]; then kill $TO_KILL 2>/dev/null && sleep 1 || true; fi

# Turbopack's dev cache goes stale when dependencies change, and the stale cache makes
# every open page reload in a loop. Clear it whenever pnpm-lock.yaml has changed.
_clear-stale-dev-cache:
    #!/usr/bin/env bash
    set -euo pipefail
    CACHE=apps/web/.next/dev/cache/turbopack
    LOCK_SUM=$(shasum pnpm-lock.yaml | cut -d' ' -f1)
    if [ -d "$CACHE" ] && [ "$(cat "$CACHE.lock-sum" 2>/dev/null)" != "$LOCK_SUM" ]; then
      echo "pnpm-lock.yaml changed since the Turbopack cache was built; clearing it"
      rm -rf "$CACHE"
    fi
    mkdir -p "$(dirname "$CACHE")"
    echo "$LOCK_SUM" > "$CACHE.lock-sum"

# Start dev server with file-watch POLLING forced on (WSL / Windows-mount fallback).
# Native fs.watch (inotify) is silently dead when the workspace lives on a Windows
# drive mounted into WSL2 (/mnt/c/..., drvfs/9P), so file changes go undetected. This
# forces a recursive polling watcher instead. Optional arg = poll interval ms (default 1000).
# Equivalent to setting CHAINGLASS_WATCH_POLLING=true in apps/web/.env then `just dev`.
dev-poll interval="1000":
    @echo "🐢 file-watch polling ON — CHAINGLASS_WATCH_POLLING=true, interval={{interval}}ms (use plain 'just dev' for native watching)"
    CHAINGLASS_WATCH_POLLING=true CHAINGLASS_WATCH_POLL_INTERVAL={{interval}} just dev

# Start terminal WebSocket server only
dev-terminal:
    PORT=${PORT:-3000} pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts

# Start development server with HTTPS (enables clipboard API on remote devices)
dev-https:
    #!/usr/bin/env bash
    set -euo pipefail
    NEXT_PORT=${PORT:-3000}
    WS_PORT=$((NEXT_PORT + 1500))
    just _claim-ports dev $NEXT_PORT $WS_PORT
    just _clear-stale-dev-cache
    cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    cd "$OLDPWD"
    PORT=$NEXT_PORT TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} TERMINAL_WS_CERT=apps/web/certificates/localhost.pem TERMINAL_WS_KEY=apps/web/certificates/localhost-key.pem \
      pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
        "pnpm turbo dev --filter=@chainglass/web -- --port $NEXT_PORT --experimental-https" \
        "pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"

# Build all packages
build:
    pnpm turbo build

# Production run: build, then serve the optimized build (Next prod server + terminal sidecar).
# Slower to start (one-time build) but far lighter at runtime than `just dev` — no on-demand
# compilation, minified bundles, React production mode. No hot reload: rerun to pick up changes.
# Terminal works exactly as in dev. PORT controls both: Next on PORT, sidecar on PORT+1500.
#
# Pairing: prod on 3000 for use (`just prod`), dev on another port for changing chainglass
# (`PORT=3010 just dev`). Both register in .chainglass/servers/<port>.json; the CLI and the
# wf-* recipes talk to prod unless CG_SERVER_PORT=<port> picks another (`just preflight` lists them).
#
# Prod serves its own copy of the build, apps/web/.next-prod-<port>/, so `just fft` / `just build`
# rewriting apps/web/.next never breaks a running prod server. A running server on PORT is never
# killed: this refuses before building. To ship a change into a running prod server:
# `KILL_EXISTING=1 just prod` — the old server keeps serving while the build runs; it is stopped
# only to swap in the new copy and restart. Rebuild cost (2026-11-12, M-series Mac): turbo build
# with nothing cached 31 s (load ~40), staging clone ~9 s, prod down ~3 s (kill → Ready, load ~76).
prod:
    #!/usr/bin/env bash
    set -euo pipefail
    NEXT_PORT=${PORT:-3000}
    CLAIM_CHECK_ONLY=1 just _claim-ports prod $NEXT_PORT $((NEXT_PORT + 1500))
    just build
    # Stage a copy of the fresh build (no caches, dev output or standalone bundle); prod-serve
    # swaps it in once the ports are free. It sits beside .next, at the same depth, because the
    # build's node_modules symlinks are relative (../../../../node_modules/...). `cp -c` clones
    # on APFS (~2 s; rsync took 5 min under load); plain `cp -R` elsewhere.
    STAGED=apps/web/.next-prod-$NEXT_PORT.staged
    rm -rf "$STAGED" && mkdir -p "$STAGED"
    for e in apps/web/.next/*; do
      case "$(basename "$e")" in cache|dev|standalone|trace|trace-build|diagnostics|lock) continue ;; esac
      cp -cR "$e" "$STAGED/" 2>/dev/null || cp -R "$e" "$STAGED/"
    done
    just prod-serve

# Serve the prod build without rebuilding (fast relaunch): a build staged by `just prod`,
# else the copy already in apps/web/.next-prod-<port>/. Same server + sidecar as `just prod`.
prod-serve:
    #!/usr/bin/env bash
    set -euo pipefail
    NEXT_PORT=${PORT:-3000}
    WS_PORT=$((NEXT_PORT + 1500))
    DIST=.next-prod-$NEXT_PORT
    # Guard: a production build must exist
    if [ ! -f "apps/web/$DIST/BUILD_ID" ] && [ ! -f "apps/web/$DIST.staged/BUILD_ID" ]; then
      echo "❌ No production build for port $NEXT_PORT (apps/web/$DIST/BUILD_ID missing)."
      echo "   Run \`just prod\` (build + serve) first."
      exit 1
    fi
    just _claim-ports prod $NEXT_PORT $WS_PORT
    if [ -d "apps/web/$DIST.staged" ]; then
      rm -rf "apps/web/$DIST" && mv "apps/web/$DIST.staged" "apps/web/$DIST"
    fi
    cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    cd "$OLDPWD"
    # `next start` serves the precompiled build (minified, no on-demand compile) from the
    # CHAINGLASS_DIST_DIR copy (apps/web/next.config.mjs). Next prints an "output: standalone"
    # advisory warning here; it's harmless (standalone output is only for `cg`/CLI packaging).
    # Terminal sidecar runs via tsx WITHOUT `watch` (no file-watching overhead in prod).
    PORT=$NEXT_PORT TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} \
      pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
        "cd apps/web && CHAINGLASS_DIST_DIR=$DIST pnpm exec next start --port $NEXT_PORT" \
        "pnpm tsx --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"

# Plan 088 (DL-001): flag a stale CLI bundle — dist/cli.cjs older than any apps/cli/src file means
# `cg remote-view` (and other verbs) may be missing/outdated. Advisory guard; run before a live CLI
# smoke. Exits non-zero when stale so CI/agents can gate on it; `just cli-build` rebuilds.
cli-build-check:
    #!/usr/bin/env bash
    set -euo pipefail
    dist="apps/cli/dist/cli.cjs"
    if [ ! -f "$dist" ]; then
      echo "❌ $dist missing — run \`just cli-build\`"; exit 1
    fi
    newer=$(find apps/cli/src -type f -name '*.ts' -newer "$dist" | head -5 || true)
    if [ -n "$newer" ]; then
      echo "❌ $dist is STALE — newer source(s) since last build:"; echo "$newer"
      echo "→ run \`just cli-build\` so cg ships the current verbs (Plan 088 DL-001)"; exit 1
    fi
    echo "✓ $dist is up to date with apps/cli/src"

# Rebuild just the CLI bundle (dist/cli.cjs) so `cg` ships the current commands.
cli-build:
    cd apps/cli && pnpm build

# Run tests
test:
    pnpm vitest run

# Run E2E agent tests (requires real agent CLIs, manually unskip tests first)
test-e2e:
    pnpm vitest run test/e2e/agent-cli-e2e.test.ts --config vitest.e2e.config.ts

# Run advanced 6-node pipeline E2E with real Copilot agents (interactive mode)
test-pipeline:
    npx tsx scripts/test-advanced-pipeline.ts --interactive

# Run harness integration tests (requires Docker/OrbStack running + container up)
test-harness:
    cd harness && pnpm vitest run

# Plan 088 Phase 3 — host streaming smoke: real Chrome + fake-streamd + WebCodecs on the Mac
remote-view-stream-smoke:
    npx tsx harness/host/remote-view-stream-smoke.mts

# Plan 088 Phase 4 — streamd native daemon (Swift; outside the pnpm graph). Sources in native/streamd/.
# ⚠️ streamd-setup creates a keychain cert (GUI auth) and the first install/run triggers TCC
# Screen-Recording (and Accessibility for input) grants — run these AT THE HOST MAC.
streamd-setup:
    native/streamd/scripts/setup-cert.sh

streamd-build:
    cd native/streamd && swift build -c release

# Swift-side fixture/auth/session conformance (the automated half of the Hybrid strategy)
streamd-test:
    cd native/streamd && swift test

# Headless wire-protocol smoke: the REAL daemon binary streaming the recorded fixtures over a
# real authenticated WebSocket to a `ws` client — NO TCC grant, no window. Proves the full
# Workshop-003 path (auth gate, handshake, frames, displacement, detach, REST). Daemon-side
# analogue of the Phase-3 browser stream smoke.
streamd-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    (cd native/streamd && swift build)
    FIX="$(cd apps/web/src/features/088-remote-view/protocol/fixtures/video && pwd)"
    AUTH_SECRET=smoke-secret CG_REMOTE_VIEW__FIXTURES_DIR="$FIX" \
      CG_REMOTE_VIEW__ALLOWED_ORIGINS="http://localhost:3000" \
      native/streamd/.build/debug/streamd --port 6099 >/tmp/streamd-smoke.log 2>&1 &
    DAEMON_PID=$!
    trap 'kill $DAEMON_PID 2>/dev/null || true' EXIT
    curl -s --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:6099/health >/dev/null
    node native/streamd/scripts/smoke-headless.mjs --port 6099 --secret smoke-secret --origin http://localhost:3000
    node native/streamd/scripts/lifecycle-headless.mjs --bin native/streamd/.build/debug/streamd --fixtures "$FIX"

streamd-install: streamd-build
    native/streamd/scripts/make-bundle.sh

# Kill streamd precisely via the discovery-registry pids. The signed bundle install path is shared
# across worktrees, so a broad `pkill -f <bundle path>` would take down another worktree's daemon
# (F002/F014). We therefore ONLY kill registry-backed pids; with no registry file we refuse to
# broad-pkill and tell you how to target a specific instance explicitly. Each `.pid` is validated as
# a positive nonzero integer AND confirmed to be a live `streamd` process before we signal it, so a
# malformed/stale/recycled registry value can never target a process group or an unrelated pid (F001).
streamd-kill:
    #!/usr/bin/env bash
    killed=0
    shopt -s nullglob
    for f in .chainglass/streamd-*.json; do
      pid=$(jq -r '.pid // empty' "$f" 2>/dev/null)
      # Only a positive nonzero decimal pid is safe — `0`/negatives/option-shaped strings would let
      # `kill` hit a process group or be parsed as a signal flag (F001/FT-001).
      if [[ ! "$pid" =~ ^[1-9][0-9]*$ ]]; then
        echo "skipping invalid streamd pid in $f: ${pid:-<empty>}" >&2
        continue
      fi
      # Identity gate: the live process must actually be a streamd before we signal it.
      if [[ "$(ps -o command= -p "$pid" 2>/dev/null)" != *streamd* ]]; then
        echo "skipping pid $pid in $f — not a live streamd process" >&2
        continue
      fi
      if kill -- "$pid" 2>/dev/null; then echo "killed streamd pid $pid (from $f)"; killed=1; fi
    done
    if [ "$killed" = 0 ]; then
      echo "no registry-backed streamd pid found (.chainglass/streamd-*.json)."
      echo "refusing to broad-pkill the shared bundle path; target one explicitly, e.g.:"
      echo "  kill \$(lsof -ti tcp:<port>)        # the daemon serving a known port"
    fi

# Start harness dev container (harness-tools — OLD Docker toolset)
alias harness-dev := harness-tools-dev
harness-tools-dev:
    cd harness && just dev

# Install standalone harness dependencies (harness-tools — OLD Docker toolset)
alias harness-install := harness-tools-install
harness-tools-install:
    cd harness && just install

# Type-check standalone harness sources (harness-tools — OLD Docker toolset)
alias harness-typecheck := harness-tools-typecheck
harness-tools-typecheck:
    cd harness && just typecheck

# Stop harness container (harness-tools — OLD Docker toolset)
alias harness-stop := harness-tools-stop
harness-tools-stop:
    cd harness && just stop

# Kill Next.js cache and restart dev server
kill-cache:
    rm -rf apps/web/.next
    rm -rf apps/web/public/icons
    @echo "Next.js cache and generated icons cleared"

# Show harness health (harness-tools — OLD Docker toolset)
alias harness-health := harness-tools-health
harness-tools-health:
    cd harness && just health

# Run the harness-tools CLI — the OLD Docker dev-container toolset (browser automation,
# screenshots, workflow runner). This is NOT the new AI-Substrate `harness` proof-loop CLI
# (that one is the bare `harness` command + `.harness/`; see .harness/engineering-harness.md).
# Canonical:  just harness-tools <cmd>   (e.g. dev, doctor, health, screenshot, workflow ...)
# `just harness <cmd>` still works as a back-compat alias (below) so existing docs keep resolving.
alias harness := harness-tools
harness-tools *ARGS:
    cd harness && pnpm exec tsx src/cli/index.ts {{ARGS}}

# The bare `harness` command is the AI-Substrate proof-loop CLI (.harness/engineering-harness.md);
# fails if any un-namespaced `harness-<x>:` recipe reappears (back-compat ALIASES are fine — they
# are `alias` lines, not recipe definitions).
# Guard: OLD Docker toolset stays namespaced under `harness-tools` (SUPPLANT de-conflation, Plan 088)
check-harness-deconflation:
    #!/usr/bin/env bash
    set -euo pipefail
    leaked=$(grep -nE '^harness-[a-z]' justfile | grep -vE ':harness-tools' || true)
    if [ -n "$leaked" ]; then
      echo "❌ de-conflation regressed — un-namespaced Docker recipe(s) found:"
      echo "$leaked"
      echo "→ rename to harness-tools-<x> and add: alias <old-name> := harness-tools-<x>"
      exit 1
    fi
    echo "✓ harness ⇄ harness-tools de-conflated (Docker toolset fully namespaced)"

# Run cg CLI commands inside the harness container (Plan 076)
# Auto-adds --json, --workspace-path, and --server-url when --server is present.
# Example: just harness-cg wf show test-workflow --detailed --server
alias harness-cg := harness-tools-cg
harness-tools-cg *ARGS:
    cd harness && just cg {{ARGS}}

# Verify a page renders cleanly in the harness — Plan 084 FX007 lesson.
#
# Catches the class of bug where `tsc --noEmit` + vitest are both happy but
# the Turbopack dev bundler fails (e.g., a barrel value-re-exports a
# server-only module into a client chunk → "chunking context does not support
# external modules"). Such failures only surface when an actual page loads.
#
# Checks:
#   1. HTTP status of the page (must be 2xx)
#   2. Console errors (filtered: HMR / favicon / GCM noise stripped)
#   3. Container dev-server logs since the recipe started — fails on any
#      Turbopack `⨯` markers (parse / chunking / runtime errors)
#
# Example:
#   just harness-verify "/workspaces/harness-test-workspace/browser"
alias harness-verify := harness-tools-verify
harness-tools-verify path:
    #!/usr/bin/env bash
    set -euo pipefail
    START_ISO="$(date -u +%Y-%m-%dT%H:%M:%S)"
    cd harness
    OUT=$(pnpm exec tsx src/cli/index.ts check-route "{{path}}" --wait-until networkidle 2>&1 || true)
    STATUS=$(echo "$OUT" | jq -r '.data.httpStatus // empty')
    CONSOLE=$(echo "$OUT" | jq -r '.data.checks.consoleErrors.messages[]? | "\(.level): \(.text)"' \
        | grep -vE 'webpack-hmr|favicon\.ico|DEPRECATED_ENDPOINT|google_apis/gcm' || true)
    cd ..
    CONTAINER="chainglass-$(basename "$(git rev-parse --show-toplevel)")"
    DEV_ERRORS=$(docker logs --since "${START_ISO}Z" "$CONTAINER" 2>&1 \
        | grep -E '⨯|Failed to compile|chunking context|Parsing ecmascript' \
        | head -20 || true)
    PASS=true
    if [[ -z "$STATUS" || "$STATUS" -lt 200 || "$STATUS" -ge 400 ]]; then
        echo "❌ HTTP $STATUS for {{path}}"
        PASS=false
    else
        echo "✓ HTTP $STATUS for {{path}}"
    fi
    if [[ -n "$CONSOLE" ]]; then
        echo "❌ Console errors (filtered):"
        echo "$CONSOLE" | head -10
        PASS=false
    else
        echo "✓ Console clean (filtered)"
    fi
    if [[ -n "$DEV_ERRORS" ]]; then
        echo "❌ Dev-server compile errors since recipe started:"
        echo "$DEV_ERRORS"
        PASS=false
    else
        echo "✓ Dev-server clean"
    fi
    if $PASS; then
        echo "✅ harness-verify {{path}} — PASS"
    else
        echo "🔴 harness-verify {{path}} — FAIL"
        exit 1
    fi

# Workflow shortcuts (Plan 076 FX001)
# Default: host server via local CLI (auto-discovers .chainglass/servers/<port>.json; prod first)
# Prod and dev both running: CG_SERVER_PORT=3010 just wf-run <slug> targets the dev server
# Add --container to target the harness Docker container instead
#
# Host mode:  just wf-run jordo-test
# Container:  just wf-run test-workflow --container

wf-run slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf run {{slug}} --server
    else
        REPO_ROOT="$(git rev-parse --show-toplevel)"
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf run {{slug}} \
          --json --pretty --server \
          --workspace-path "$REPO_ROOT"
    fi

wf-status slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf show {{slug}} --detailed --server
    else
        REPO_ROOT="$(git rev-parse --show-toplevel)"
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf show {{slug}} \
          --detailed --json --pretty --server \
          --workspace-path "$REPO_ROOT"
    fi

wf-stop slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf stop {{slug}}
    else
        REPO_ROOT="$(git rev-parse --show-toplevel)"
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf stop {{slug}} \
          --json --pretty \
          --workspace-path "$REPO_ROOT"
    fi

wf-restart slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf restart {{slug}}
    else
        REPO_ROOT="$(git rev-parse --show-toplevel)"
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf restart {{slug}} \
          --json --pretty \
          --workspace-path "$REPO_ROOT"
    fi

wf-reset *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness workflow reset
    else
        REPO_ROOT="$(git rev-parse --show-toplevel)"
        echo "Host reset: clearing workflow state..."
        # Host reset uses the local CLI to delete + recreate
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf reset \
          --json --pretty \
          --workspace-path "$REPO_ROOT" 2>&1 || echo "Note: wf reset may not be available on host. Use --container for seeded test data."
    fi

# Show unified workflow execution log — timeline, diagnostics, per-node detail (FX002)
# Use: just wf-logs jordo-test
# Flags: --errors (just problems), --node <id> (one node), --container
wf-logs slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    REPO_ROOT="$(git rev-parse --show-toplevel)"
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf logs {{slug}} --server
    else
        EXTRA_FLAGS=""
        if echo "{{FLAGS}}" | grep -q -- '--errors'; then EXTRA_FLAGS="$EXTRA_FLAGS --errors"; fi
        if echo "{{FLAGS}}" | grep -q -- '--node'; then
            NODE=$(echo "{{FLAGS}}" | grep -oP '(?<=--node )\S+')
            EXTRA_FLAGS="$EXTRA_FLAGS --node $NODE"
        fi
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf logs {{slug}} \
          --server \
          --workspace-path "$REPO_ROOT" \
          $EXTRA_FLAGS
    fi

# Watch workflow execution live (polls every 2s, appends to stdout + .chainglass/watch.log)
# Auto-stops on terminal state (completed/failed/stopped). Ctrl+C to stop early.
# Use: just wf-watch jordo-test
# Also: tail -f .chainglass/watch.log (in another terminal)
wf-watch slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    REPO_ROOT="$(git rev-parse --show-toplevel)"
    LOG_FILE="$REPO_ROOT/.chainglass/watch.log"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "Watching {{slug}} (polling every 2s, logging to $LOG_FILE)..."
    echo "Press Ctrl+C to stop."
    echo ""
    echo "─── $(date +%H:%M:%S) ─── Start watching: {{slug}} ───" | tee -a "$LOG_FILE"
    while true; do
        TS=$(date +%H:%M:%S)
        if echo "{{FLAGS}}" | grep -q -- '--container'; then
            OUTPUT=$(just harness-cg wf show {{slug}} --detailed --server 2>&1) || true
        else
            OUTPUT=$(node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf show {{slug}} \
              --detailed --json --pretty --server \
              --workspace-path "$REPO_ROOT" 2>&1) || true
        fi
        # Extract key fields for summary line
        STATUS=$(echo "$OUTPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const e=j.data?.execution||{};console.log(e.status||'unknown')}catch{console.log('error')}})" 2>/dev/null)
        PROGRESS=$(echo "$OUTPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const e=j.data?.execution||{};console.log(e.progress||'?')}catch{console.log('?')}})" 2>/dev/null)
        NODES=$(echo "$OUTPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const lines=j.data?.lines||[];const nodes=lines.flatMap(l=>l.nodes||[]);nodes.forEach(n=>{const icon=n.status==='complete'?'✅':n.status==='blocked-error'?'❌':n.status==='ready'?'🔵':n.status==='pending'?'⏸':'🔄';console.log('  '+icon+' '+n.id+'  '+n.status+(n.error?'  '+n.error.message:''))});if(!nodes.length)console.log('  (no nodes)')}catch{console.log('  (parse error)')}})" 2>/dev/null)
        # Print summary
        SUMMARY="─── $TS ─── {{slug}}: $STATUS ($PROGRESS) ───"
        echo "$SUMMARY" | tee -a "$LOG_FILE"
        echo "$NODES" | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
        # Auto-stop on terminal state
        if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "stopped" ]; then
            echo "Workflow reached terminal state: $STATUS" | tee -a "$LOG_FILE"
            break
        fi
        sleep 2
    done

# Manage test workflow data (Plan 074 Phase 6)
test-data *ARGS:
    cd harness && pnpm exec tsx src/cli/index.ts test-data {{ARGS}}

# Run linter
lint:
    pnpm biome check .

# Format code
format:
    pnpm biome format --write .

# Fix, format, and test (fft) - full quality check sequence
fft: lint format build typecheck test security-audit

# Run TypeScript type checking across EVERY workspace tsconfig.
# Per AGENTS § "No Pre-Existing Errors": the canonical typecheck must
# cover apps/, packages/, harness/, and test/ — not just packages/ via
# the root tsconfig. We loop explicitly because each workspace owns its
# own tsconfig with workspace-specific paths and includes.
typecheck:
    #!/usr/bin/env bash
    set -euo pipefail
    failed=0
    for cfg in apps/web/tsconfig.json apps/cli/tsconfig.json packages/*/tsconfig.json harness/tsconfig.json test/tsconfig.json; do
      echo "===> $cfg"
      if ! pnpm exec tsc --noEmit -p "$cfg"; then
        failed=1
      fi
    done
    exit $failed

# Audit dependencies for known security vulnerabilities (high/critical only)
security-audit:
    pnpm audit --audit-level=high

# Run all quality checks
check: lint typecheck test

# Clean Next.js server cache (.next directory)
clean-next:
    rm -rf apps/web/.next

# Clean build artifacts
clean:
    rm -rf packages/*/dist apps/*/dist apps/*/.next node_modules/.cache apps/web/public/icons

# Prune turbo cache across all worktrees under ~/substrate (keeps last 7 days by default)
# Override age with: just turbo-prune 14   (days) — or 0 to wipe everything
turbo-prune days="7":
    #!/usr/bin/env bash
    set -euo pipefail
    DAYS={{days}}
    ROOT="$HOME/substrate"
    echo "Scanning turbo caches under ${ROOT}..."
    TOTAL_BEFORE=$(find "${ROOT}" -type d -path '*/.turbo/cache' -prune -exec du -sk {} + 2>/dev/null | awk '{s+=$1} END {printf "%.1f GB", s/1024/1024}')
    echo "Current total: ${TOTAL_BEFORE}"
    if [ "${DAYS}" = "0" ]; then
      echo "Wiping ALL turbo cache entries..."
      while IFS= read -r d; do rm -rf "$d"/*; done < <(find "${ROOT}" -type d -path '*/.turbo/cache')
    else
      echo "Deleting cache entries older than ${DAYS} days..."
      find "${ROOT}" -type f -path '*/.turbo/cache/*' \( -name '*.tar.zst' -o -name '*-meta.json' \) -mtime +${DAYS} -delete
    fi
    TOTAL_AFTER=$(find "${ROOT}" -type d -path '*/.turbo/cache' -prune -exec du -sk {} + 2>/dev/null | awk '{s+=$1} END {printf "%.1f GB", s/1024/1024}')
    echo "New total: ${TOTAL_AFTER}"

# Reset everything (clean + reinstall)
reset: clean
    rm -rf node_modules packages/*/node_modules apps/*/node_modules pnpm-lock.yaml
    pnpm install

# Show graph status view gallery (all visual scenarios)
graph-gallery:
    npx tsx scripts/graph-status-gallery.ts

# Run drive() demo — creates a graph, drives it to completion with real scripts
drive-demo:
    npx tsx scripts/drive-demo.ts

test-advanced-pipeline *args:
    npx tsx scripts/test-advanced-pipeline.ts {{args}}

# Run tests for a specific plan/feature by number (e.g., just test-feature 040)
test-feature plan:
    pnpm vitest run --reporter=verbose $(find test -path "*{{plan}}*" -name "*.test.ts" 2>/dev/null | tr '\n' ' ')

# Watch tests for a specific plan/feature (re-runs on file change)
test-watch plan:
    pnpm vitest --reporter=verbose $(find test -path "*{{plan}}*" -name "*.test.ts" 2>/dev/null | tr '\n' ' ')

# Generate demo workflows for UI development (Plan 050)
dope *args:
    npx tsx scripts/dope-workflows.ts {{args}}

# Clean and regenerate all demo workflows
redope:
    npx tsx scripts/dope-workflows.ts clean
    npx tsx scripts/dope-workflows.ts

# Watch a Copilot CLI session and send prompts via tmux
session-watch session_id tmux_session pane='0':
    npx tsx scripts/session-watcher.ts {{session_id}} {{tmux_session}} {{pane}}

# Host dev server preflight checks (FX001)
# Run before workflow operations to catch stale builds, missing server, etc.
preflight:
    #!/usr/bin/env bash
    set -euo pipefail
    REPO_ROOT="$(git rev-parse --show-toplevel)"
    PASS=true

    echo "Preflight checks..."

    # 1. CLI build freshness — compare newest src file vs dist/cli.cjs
    CLI_DIST="$REPO_ROOT/apps/cli/dist/cli.cjs"
    if [ ! -f "$CLI_DIST" ]; then
        echo "  ✗ CLI not built: $CLI_DIST missing"
        echo "    Fix: pnpm --filter @chainglass/cli build"
        PASS=false
    else
        NEWEST_SRC=$(find "$REPO_ROOT/apps/cli/src" "$REPO_ROOT/packages/positional-graph/src" "$REPO_ROOT/packages/shared/src" -name '*.ts' -newer "$CLI_DIST" 2>/dev/null | head -1)
        if [ -n "$NEWEST_SRC" ]; then
            echo "  ✗ CLI build stale: $(basename "$NEWEST_SRC") is newer than dist/cli.cjs"
            echo "    Fix: pnpm --filter @chainglass/cli build"
            PASS=false
        else
            echo "  ✓ CLI build fresh"
        fi
    fi

    # 2. A server is running — live entries in .chainglass/servers/<port>.json (prod first, then port)
    SERVERS=$(FORCE_COLOR=0 node -e '
      const fs = require("fs"), path = require("path");
      const dir = path.join(process.argv[1], ".chainglass", "servers");
      let names = [];
      try { names = fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)); } catch {}
      for (const n of names) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
          process.kill(s.pid, 0);
          console.log(`${s.mode} ${s.port} ${s.pid}`);
        } catch {}
      }' "$REPO_ROOT" | sort -k1,1r -k2,2n)
    if [ -z "$SERVERS" ]; then
        echo "  ✗ No chainglass server running (no live .chainglass/servers/<port>.json)"
        echo "    Fix: just dev (or just prod)"
        PASS=false
    else
        while read -r MODE PORT PID; do
            echo "  ✓ $MODE server running (port $PORT, PID $PID)"
        done <<< "$SERVERS"
        if [ -n "${CG_SERVER_PORT:-}" ]; then
            if echo "$SERVERS" | awk '{print $2}' | grep -qx "$CG_SERVER_PORT"; then
                echo "  ✓ CLI targets port $CG_SERVER_PORT (CG_SERVER_PORT)"
            else
                echo "  ✗ CG_SERVER_PORT=$CG_SERVER_PORT but no server is running on it"
                PASS=false
            fi
        else
            echo "  ✓ CLI targets port $(echo "$SERVERS" | head -1 | awk '{print $2}') (set CG_SERVER_PORT to pick another)"
        fi
    fi

    # 3. Workspace registered — can the CLI resolve a workspace context?
    if [ -d "$REPO_ROOT/.chainglass" ]; then
        echo "  ✓ Workspace directory exists"
    else
        echo "  ✗ No .chainglass directory — workspace not initialized"
        echo "    Fix: Open the web UI and register this directory as a workspace"
        PASS=false
    fi

    if [ "$PASS" = "true" ]; then
        echo ""
        echo "All checks passed. Ready to run workflows."
    else
        echo ""
        echo "Some checks failed. Fix the issues above before running workflows."
        exit 1
    fi

# Quick preflight: fail immediately if harness isn't running (harness-tools — OLD Docker toolset)
alias harness-require := harness-tools-require
harness-tools-require:
    #!/usr/bin/env bash
    PORT=$(cd harness && pnpm exec tsx -e "import{computePorts}from'./src/ports/allocator.js';console.log(computePorts().app)" 2>/dev/null)
    if [ -z "$PORT" ]; then PORT=3181; fi
    if ! curl -sf --max-time 2 "http://127.0.0.1:$PORT" > /dev/null 2>&1; then
      echo "Error: Harness is not running (app port $PORT unreachable)."
      echo ""
      echo "  1. just harness dev"
      echo "  2. just harness doctor --wait"
      echo ""
      echo "Then retry your command."
      exit 1
    fi

# --- Agent Runner (minih) ---

# Run smoke-test agent
smoke-test-agent:
    GH_TOKEN=$(XDG_CONFIG_HOME=~/.config gh auth token) minih run smoke-test --agents-dir harness/agents

# Run code-review agent with GPT-5.4 xhigh reasoning and 20-minute timeout
code-review-agent file_path:
    GH_TOKEN=$(XDG_CONFIG_HOME=~/.config gh auth token) minih run code-review --agents-dir harness/agents --model gpt-5.4 --reasoning xhigh --timeout 1200 --param file_path={{file_path}}

# Run code-review-companion (long-running, coordination-enabled, with live human-view TUI). Send tasks via `minih outside inbox send code-review-companion ...`.
companion:
    GH_TOKEN=$(XDG_CONFIG_HOME=~/.config gh auth token) minih run code-review-companion --agents-dir harness/agents --model gpt-5.5 --timeout 7200 --human

# Tail an agent's live event stream
agent-tail slug:
    minih tail {{slug}} --agents-dir harness/agents

# List available agents
agent-list:
    minih list --agents-dir harness/agents

# Validate all agent conventions
agent-doctor:
    minih doctor --agents-dir harness/agents

# Show last run info for an agent (e.g., just agent-last-run code-review)
agent-last-run slug:
    minih last-run {{slug}} --agents-dir harness/agents

# Show run history for an agent
agent-history slug:
    minih history {{slug}} --agents-dir harness/agents

# Re-validate an agent's latest output against current schema
agent-validate slug:
    minih validate {{slug}} --agents-dir harness/agents

# Preview assembled prompt without executing (saves API tokens)
agent-dry-run slug:
    minih run {{slug}} --agents-dir harness/agents --dry-run

# Resume a completed agent session with a follow-up message
agent-resume slug message:
    GH_TOKEN=$(XDG_CONFIG_HOME=~/.config gh auth token) minih resume {{slug}} "{{message}}" --agents-dir harness/agents

# Print the report.json path from an agent's latest run (pipe-friendly)
agent-report slug:
    @minih last-run {{slug}} --agents-dir harness/agents 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); p=d.get('data',{}).get('reportPath'); print(p) if p else (print('No report found',file=sys.stderr),exit(1))"
