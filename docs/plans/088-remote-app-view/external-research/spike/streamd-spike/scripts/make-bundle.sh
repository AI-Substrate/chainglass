#!/bin/bash
# T005 — throwaway codesign/TCC test shell: wraps the capture scratch in a minimal
# .app bundle, signs it with "chainglass-dev", installs to a stable path.
# NOT a prototype of the Phase 4 daemon (that owns native/streamd/scripts/make-bundle.sh).
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$HOME/Applications/ChainglassSpike.app}"
BIN="$SPIKE_DIR/.build/release/streamd-spike"

if [ ! -f "$BIN" ]; then
  (cd "$SPIKE_DIR" && swift build -c release)
fi

mkdir -p "$APP/Contents/MacOS"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.chainglass.spike</string>
  <key>CFBundleName</key><string>ChainglassSpike</string>
  <key>CFBundleExecutable</key><string>streamd-spike</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF

cp "$BIN" "$APP/Contents/MacOS/streamd-spike"
codesign --force --sign "chainglass-dev" "$APP"
codesign --verify --verbose=2 "$APP"
echo "bundle: $APP (signed with chainglass-dev)"
