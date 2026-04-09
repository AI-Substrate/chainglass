#!/bin/bash
# chainglass-bell.sh — Notify Chainglass server of a bell event
#
# Called by Claude Code hooks (Notification, Stop) to trigger the
# bell sound and title flash in the browser. Can also be called
# manually or from any script that wants to ring the Chainglass bell.
#
# Uses the server port from .chainglass/server.json if available,
# falls back to PORT env var, then to 3000.
#
# Usage:
#   ./scripts/chainglass-bell.sh                    # basic bell
#   ./scripts/chainglass-bell.sh --source "build"   # bell with source label
#   echo '{"message":"done"}' | ./scripts/chainglass-bell.sh  # stdin context
#
# Plan 080: tmux Eventing System

set -euo pipefail

SOURCE="${2:-claude-code}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve server port
PORT="${PORT:-3000}"
SERVER_JSON="$PROJECT_ROOT/.chainglass/server.json"
if [ -f "$SERVER_JSON" ]; then
  JSON_PORT=$(python3 -c "import json; print(json.load(open('$SERVER_JSON')).get('port',''))" 2>/dev/null || true)
  if [ -n "$JSON_PORT" ]; then
    PORT="$JSON_PORT"
  fi
fi

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Read stdin if available (Claude Code pipes JSON context)
STDIN_DATA=""
if [ ! -t 0 ]; then
  STDIN_DATA=$(cat 2>/dev/null || true)
fi

# POST bell event to Chainglass
curl -s -X POST "http://localhost:${PORT}/api/tmux/events" \
  -H 'Content-Type: application/json' \
  -d "{\"session\":\"$SOURCE\",\"pane\":\"hook\",\"event\":\"BELL\",\"data\":{\"stdin\":$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')}}" \
  >/dev/null 2>&1 || true
