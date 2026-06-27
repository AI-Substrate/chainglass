#!/bin/bash
# Build the Chainglass Streamer daemon bundle around the current binary.
#
# Identity is PRODUCTION-STABLE on purpose (Finding 02 / Workshop 004): bundle id
# com.chainglass.streamd + the "chainglass-dev" self-signed cert give a designated
# requirement of (identifier + cert-leaf) — NOT a cdhash — so the macOS TCC grants
# (Screen Recording, Accessibility) survive rebuilds AND carry to the Phase 4
# daemon, which MUST reuse this same bundle id + cert. Grant once, here, forever.
#
# This spike wraps the de-risk binary; Phase 4 swaps the binary inside the same
# identity. Sign with ad-hoc "-" only for throwaway tests (grant won't persist).
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$HOME/Applications/Chainglass Streamer.app}"
SIGN_ID="${2:-chainglass-dev}"
BUNDLE_ID="${3:-com.chainglass.streamd}"
DISPLAY_NAME="${4:-Chainglass Streamer}"
EXEC_NAME="streamd"
BIN="$SPIKE_DIR/.build/release/streamd-spike"

if [ ! -f "$BIN" ]; then (cd "$SPIKE_DIR" && swift build -c release); fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>$DISPLAY_NAME</string>
  <key>CFBundleExecutable</key><string>$EXEC_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF

cp "$BIN" "$APP/Contents/MacOS/$EXEC_NAME"
codesign --force --options runtime --sign "$SIGN_ID" "$APP"
codesign --verify --verbose=2 "$APP"
echo "bundle: $APP"
echo "  id=$BUNDLE_ID name=\"$DISPLAY_NAME\" exec=$EXEC_NAME signed-with=\"$SIGN_ID\""
codesign -dvv "$APP" 2>&1 | grep -E "Identifier|Authority|Signature|TeamIdentifier" || true
