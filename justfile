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
# PORT env var controls both: Next.js listens on PORT, sidecar on PORT+1500
# If PORT not set, Next.js auto-selects and sidecar defaults to 3000+1500
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    NEXT_PORT=${PORT:-3000}
    WS_PORT=$((NEXT_PORT + 1500))
    # Pre-flight: detect stale processes on our ports
    for p in $NEXT_PORT $WS_PORT; do
      PID=$(lsof -ti TCP:$p -sTCP:LISTEN 2>/dev/null || true)
      if [ -n "$PID" ]; then
        CMD=$(ps -p $PID -o command= 2>/dev/null || echo "unknown")
        echo "⚠️  Port $p already in use by PID $PID ($CMD)"
        echo "   Killing stale process..."
        kill $PID 2>/dev/null && sleep 1 || true
      fi
    done
    cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    cd "$OLDPWD"
    PORT=$NEXT_PORT TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} \
      pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
        "pnpm turbo dev -- --port $NEXT_PORT" \
        "pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"

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
    for p in $NEXT_PORT $WS_PORT; do
      PID=$(lsof -ti TCP:$p -sTCP:LISTEN 2>/dev/null || true)
      if [ -n "$PID" ]; then
        CMD=$(ps -p $PID -o command= 2>/dev/null || echo "unknown")
        echo "⚠️  Port $p already in use by PID $PID ($CMD)"
        echo "   Killing stale process..."
        kill $PID 2>/dev/null && sleep 1 || true
      fi
    done
    cd apps/web && node -e "require('node-pty').spawn('/bin/echo',['ok'],{name:'x',cols:1,rows:1,cwd:'/tmp',env:{}})" 2>/dev/null || (echo "Error: node-pty can't spawn. Run: chmod +x apps/web/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" && exit 1)
    cd "$OLDPWD"
    PORT=$NEXT_PORT TERMINAL_WS_HOST=${TERMINAL_WS_HOST:-0.0.0.0} TERMINAL_WS_CERT=apps/web/certificates/localhost.pem TERMINAL_WS_KEY=apps/web/certificates/localhost-key.pem \
      pnpm concurrently --names "next,terminal" --prefix-colors "blue,green" \
        "pnpm turbo dev -- --port $NEXT_PORT --experimental-https" \
        "pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"

# Build all packages
build:
    pnpm turbo build

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

# Kill streamd precisely via the discovery-registry pids (the install path is shared across
# worktrees, so a broad `pkill` would take down unrelated instances — F002). Falls back to the
# bundle path only when no registry file is present.
streamd-kill:
    #!/usr/bin/env bash
    killed=0
    shopt -s nullglob
    for f in .chainglass/streamd-*.json; do
      pid=$(jq -r '.pid // empty' "$f" 2>/dev/null)
      if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then echo "killed streamd pid $pid (from $f)"; killed=1; fi
    done
    if [ "$killed" = 0 ]; then
      pkill -f 'ChainglassStreamd.app/Contents/MacOS/streamd' && echo "streamd killed (by bundle path)" || echo "no streamd running"
    fi

# Start harness dev container
harness-dev:
    cd harness && just dev

# Install standalone harness dependencies
harness-install:
    cd harness && just install

# Type-check standalone harness sources
harness-typecheck:
    cd harness && just typecheck

# Stop harness container
harness-stop:
    cd harness && just stop

# Kill Next.js cache and restart dev server
kill-cache:
    rm -rf apps/web/.next
    rm -rf apps/web/public/icons
    @echo "Next.js cache and generated icons cleared"

# Show harness health
harness-health:
    cd harness && just health

# Run harness CLI command (e.g., just harness health, just harness screenshot home)
# Workflow commands (Plan 076): just harness workflow {reset|run|status|logs}
harness *ARGS:
    cd harness && pnpm exec tsx src/cli/index.ts {{ARGS}}

# Run cg CLI commands inside the harness container (Plan 076)
# Auto-adds --json, --workspace-path, and --server-url when --server is present.
# Example: just harness-cg wf show test-workflow --detailed --server
harness-cg *ARGS:
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
harness-verify path:
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
# Default: host dev server via local CLI (auto-discovers server.json)
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

    # 2. Dev server running — check for server.json with live PID
    SERVER_JSON="$REPO_ROOT/apps/web/.chainglass/server.json"
    if [ ! -f "$SERVER_JSON" ]; then
        echo "  ✗ Dev server not running: no server.json"
        echo "    Fix: just dev"
        PASS=false
    else
        SERVER_PID=$(FORCE_COLOR=0 node -e "try{console.log(JSON.parse(require('fs').readFileSync('$SERVER_JSON','utf8')).pid)}catch{console.log('')}" 2>/dev/null)
        if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
            SERVER_PORT=$(FORCE_COLOR=0 node -e "try{console.log(JSON.parse(require('fs').readFileSync('$SERVER_JSON','utf8')).port)}catch{console.log('?')}" 2>/dev/null)
            echo "  ✓ Dev server running (PID $SERVER_PID, port $SERVER_PORT)"
        else
            echo "  ✗ Dev server not running: server.json exists but PID $SERVER_PID is dead"
            echo "    Fix: just dev"
            PASS=false
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

# Quick preflight: fail immediately if harness isn't running
harness-require:
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
