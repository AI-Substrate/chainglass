#!/bin/bash
set -e

# =============================================================================
# Chainglass Harness — Container Entrypoint
#
# Handles first-boot dependency installation and starts the dev environment:
#   1. Check if node_modules is populated (named volume may be empty)
#   2. Run pnpm install if needed (cold start: ~3-5 min)
#   3. Build packages (turbo build)
#   4. Start Next.js dev server + terminal WebSocket sidecar + Chromium + CDP proxy
# =============================================================================

SENTINEL="/app/node_modules/.harness-installed"

echo "╔══════════════════════════════════════════╗"
echo "║  Chainglass Agentic Development Harness  ║"
echo "╚══════════════════════════════════════════╝"

# --- Step 1: Dependencies ---
if [ ! -f "$SENTINEL" ] || [ "/app/pnpm-lock.yaml" -nt "$SENTINEL" ]; then
  echo ""
  echo "📦 Installing dependencies (first boot or lockfile changed)..."
  echo "   This may take 3-5 minutes on first run."
  echo ""
  cd /app
  pnpm install --frozen-lockfile
  touch "$SENTINEL"
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies up to date (sentinel: $SENTINEL)"
fi

# --- Step 2: Build packages ---
echo ""
echo "🔨 Building packages..."
cd /app
pnpm turbo build --filter='@chainglass/*'
echo "✓ Packages built"

# --- Step 3: node-pty spawn helper permissions ---
SPAWN_HELPER="/app/apps/web/node_modules/node-pty/prebuilds/linux-x64/spawn-helper"
if [ -f "$SPAWN_HELPER" ]; then
  chmod +x "$SPAWN_HELPER"
  echo "✓ node-pty spawn-helper permissions set"
fi

# --- Step 4: Start dev server + terminal sidecar + Chromium + CDP proxy ---
echo ""
echo "🚀 Starting dev server on :${PORT:-3100} + terminal sidecar on :${TERMINAL_WS_PORT:-4600} + Chromium CDP on :${CDP_PORT:-9222}"
echo ""

cd /app

# Chromium's remote debugging endpoint stays loopback-only in newer versions,
# so expose it through a local TCP proxy the host can reach via Docker port mapping.
exec npx concurrently --names "next,terminal,chromium,cdp-proxy" --prefix-colors "blue,green,magenta,yellow" \
  "pnpm turbo dev -- --port ${PORT:-3000}" \
  "pnpm tsx watch apps/web/src/features/064-terminal/server/terminal-ws.ts" \
  "/usr/local/bin/start-chromium.sh" \
  "socat TCP-LISTEN:${CDP_PORT:-9222},bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:${CHROMIUM_INTERNAL_CDP_PORT:-9223}"
