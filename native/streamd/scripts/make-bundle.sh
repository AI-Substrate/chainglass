#!/bin/bash
# Assemble + sign the ChainglassStreamd.app bundle around the release binary.
#
# Identity is PRODUCTION-STABLE on purpose (Finding 02 / Workshop 004): bundle id
# com.chainglass.streamd + the "chainglass-dev" self-signed cert give a designated
# requirement of (identifier + cert-leaf) — NOT a cdhash — so the macOS TCC grants
# (Screen Recording, Accessibility) survive rebuilds. Grant once, forever. This Phase 4
# daemon reuses the EXACT bundle id + cert the spike validated; changing either breaks
# the grant. Install path is Workshop 004's (shared across worktrees), not the spike's.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"            # native/streamd
APP="${1:-$HOME/Library/Application Support/chainglass/streamd/ChainglassStreamd.app}"
SIGN_ID="${2:-chainglass-dev}"
BUNDLE_ID="${3:-com.chainglass.streamd}"
DISPLAY_NAME="${4:-Chainglass Streamd}"
EXEC_NAME="streamd"
BIN="$PKG_DIR/.build/release/streamd"

if [ ! -f "$BIN" ]; then (cd "$PKG_DIR" && swift build -c release); fi

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
  <key>LSMinimumSystemVersion</key><string>14.0</string>
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
