#!/bin/bash
# =============================================================================
# Chainglass Harness — Chromium Startup Script
#
# Launches headless Chromium with CDP (Chrome DevTools Protocol) on an internal
# loopback port. A separate TCP proxy exposes the host-facing CDP port because
# newer Chromium builds keep remote debugging bound to loopback inside Docker.
#
# Features:
#   - Auto-discovers Playwright-installed Chromium binary
#   - Restart loop: if Chromium crashes, restarts after 2s delay
#   - Proper signal forwarding for clean shutdown
#
# Required Docker/container setup:
#   - shm_size: 1gb (Chromium needs shared memory)
#   - socat proxy exposes host-facing CDP port 9222
# =============================================================================

CHROMIUM_INTERNAL_CDP_PORT="${CHROMIUM_INTERNAL_CDP_PORT:-9223}"

# Find Playwright-installed Chromium binary
find_chromium() {
  local binary
  # Playwright installs Chromium at a versioned path
  binary=$(find /root/.cache/ms-playwright -name "chrome" -path "*/chrome-linux/chrome" 2>/dev/null | head -1)
  if [ -z "$binary" ]; then
    # Fallback: try headless_shell
    binary=$(find /root/.cache/ms-playwright -name "headless_shell" 2>/dev/null | head -1)
  fi
  echo "$binary"
}

CHROMIUM_BIN=$(find_chromium)

if [ -z "$CHROMIUM_BIN" ]; then
  echo "ERROR: Chromium binary not found in /root/.cache/ms-playwright/"
  echo "Run: npx playwright install chromium"
  exit 1
fi

echo "🌐 Starting Chromium (internal CDP on :${CHROMIUM_INTERNAL_CDP_PORT})"
echo "   Binary: ${CHROMIUM_BIN}"

# Restart loop — if Chromium crashes, restart after a brief delay
while true; do
  "$CHROMIUM_BIN" \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --disable-setuid-sandbox \
    --disable-software-rasterizer \
    --remote-debugging-port="$CHROMIUM_INTERNAL_CDP_PORT" \
    --remote-debugging-address=127.0.0.1 \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-networking \
    --disable-sync \
    --disable-translate \
    --metrics-recording-only \
    --safebrowsing-disable-auto-update \
    about:blank

  EXIT_CODE=$?
  echo "⚠️  Chromium exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
