#!/usr/bin/env bash
# copilot-tmux-sessions.sh — Detect Copilot CLI sessions running in tmux panes
#
# Walks tmux panes, finds copilot processes via TTY matching,
# resolves session IDs from lock files, and extracts session metadata
# (model, token usage, cwd, branch, etc.)
#
# Usage:
#   ./scripts/explore/copilot-tmux-sessions.sh            # All tmux panes with copilot
#   ./scripts/explore/copilot-tmux-sessions.sh --current   # Only the current tmux window
#   ./scripts/explore/copilot-tmux-sessions.sh --json      # JSON output

set -euo pipefail

COPILOT_CONFIG_DIR="${HOME}/.copilot"
SESSION_STATE_DIR="${COPILOT_CONFIG_DIR}/session-state"
LOGS_DIR="${COPILOT_CONFIG_DIR}/logs"
CONFIG_FILE="${COPILOT_CONFIG_DIR}/config.json"

# Model context windows are defined in the Python section below

MODE="all"
OUTPUT="text"
for arg in "$@"; do
  case "$arg" in
    --current) MODE="current" ;;
    --json)    OUTPUT="json" ;;
    --help|-h)
      echo "Usage: $0 [--current] [--json]"
      echo "  --current  Only show the current tmux window's copilot session"
      echo "  --json     Output as JSON"
      exit 0
      ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────

# Find copilot PID running on a given TTY
find_copilot_on_tty() {
  local tty_name="$1"
  # Strip /dev/ prefix for ps matching
  local short_tty="${tty_name#/dev/}"
  ps -eo pid,tty,command 2>/dev/null \
    | grep "copilot-darwin-arm64/copilot" \
    | grep -v grep \
    | awk -v t="$short_tty" '$2 == t { print $1 }' \
    | sort -rn \
    | head -1
}

# Find session ID from copilot PID via lock files (pick most recently modified)
find_session_for_pid() {
  local pid="$1"
  # Find all lock files for this PID, sort by modification time (newest first)
  find "${SESSION_STATE_DIR}" -name "inuse.${pid}.lock" -maxdepth 2 2>/dev/null \
    | while read -r lock_file; do
        local session_dir
        session_dir=$(dirname "$lock_file")
        local events_file="${session_dir}/events.jsonl"
        local mtime=0
        if [[ -f "$events_file" ]]; then
          mtime=$(stat -f %m "$events_file" 2>/dev/null || stat -c %Y "$events_file" 2>/dev/null || echo 0)
        fi
        echo "${mtime}|$(basename "$session_dir")"
      done \
    | sort -t'|' -k1 -rn \
    | head -1 \
    | cut -d'|' -f2
}

# Extract model from the latest log for a PID
get_model_from_log() {
  local pid="$1"
  local log_file
  log_file=$(ls -t "${LOGS_DIR}"/process-*-"${pid}".log 2>/dev/null | head -1)
  if [[ -n "$log_file" ]]; then
    grep '"model":' "$log_file" 2>/dev/null | tail -1 | sed 's/.*"model": *"\([^"]*\)".*/\1/'
  fi
}

# Get the latest token usage from the process log
get_latest_token_usage() {
  local pid="$1"
  local log_file
  log_file=$(ls -t "${LOGS_DIR}"/process-*-"${pid}".log 2>/dev/null | head -1)
  if [[ -n "$log_file" ]]; then
    # Extract the last occurrence of token counts
    grep "prompt_tokens_count" "$log_file" 2>/dev/null | tail -1 | sed 's/.*"prompt_tokens_count": *\([0-9]*\).*/\1/'
  fi
}

# Get session metadata from events.jsonl
get_session_info() {
  local session_id="$1"
  local events_file="${SESSION_STATE_DIR}/${session_id}/events.jsonl"
  local workspace_file="${SESSION_STATE_DIR}/${session_id}/workspace.yaml"

  if [[ ! -f "$events_file" ]]; then
    return
  fi

  python3 -c "
import json, sys, os, yaml

session_id = '${session_id}'
events_file = '${events_file}'
workspace_file = '${workspace_file}'
config_file = '${CONFIG_FILE}'
logs_dir = '${LOGS_DIR}'
pid = '${2:-}'

info = {
    'session_id': session_id,
    'copilot_version': None,
    'model': None,
    'configured_model': None,
    'reasoning_effort': None,
    'cwd': None,
    'branch': None,
    'repository': None,
    'start_time': None,
    'total_output_tokens': 0,
    'turn_count': 0,
    'latest_prompt_tokens': None,
    'latest_completion_tokens': None,
    'latest_total_tokens': None,
    'latest_cached_tokens': None,
    'context_window': None,
    'context_used_pct': None,
}

# Read workspace.yaml
if os.path.exists(workspace_file):
    try:
        with open(workspace_file) as f:
            ws = yaml.safe_load(f)
        info['cwd'] = ws.get('cwd')
        info['branch'] = ws.get('branch')
        info['repository'] = ws.get('repository')
    except:
        pass

# Read config.json for configured model
if os.path.exists(config_file):
    try:
        with open(config_file) as f:
            cfg = json.load(f)
        info['configured_model'] = cfg.get('model')
        info['reasoning_effort'] = cfg.get('reasoning_effort')
    except:
        pass

# Parse events
with open(events_file) as f:
    for line in f:
        try:
            evt = json.loads(line)
            etype = evt.get('type', '')
            data = evt.get('data', {})

            if etype == 'session.start':
                info['copilot_version'] = data.get('copilotVersion')
                info['start_time'] = data.get('startTime')
                info['reasoning_effort'] = data.get('reasoningEffort', info['reasoning_effort'])
                ctx = data.get('context', {})
                info['cwd'] = info['cwd'] or ctx.get('cwd')
                info['branch'] = info['branch'] or ctx.get('branch')
                info['repository'] = info['repository'] or ctx.get('repository')

            elif etype == 'assistant.message':
                if 'outputTokens' in data:
                    info['total_output_tokens'] += data['outputTokens']
                    info['turn_count'] += 1

            elif etype == 'tool.execution_complete':
                if 'model' in data:
                    info['model'] = data['model']
        except:
            pass

# Parse the process log for latest token usage
if pid:
    import glob
    log_files = sorted(glob.glob(f'{logs_dir}/process-*-{pid}.log'), reverse=True)
    if log_files:
        log_file = log_files[0]
        last_prompt = None
        last_completion = None
        last_total = None
        last_cached = None
        with open(log_file) as f:
            for line in f:
                if '\"prompt_tokens_count\"' in line:
                    import re
                    m = re.search(r'\"prompt_tokens_count\":\s*(\d+)', line)
                    if m: last_prompt = int(m.group(1))
                if '\"completion_tokens_count\"' in line:
                    import re
                    m = re.search(r'\"completion_tokens_count\":\s*(\d+)', line)
                    if m: last_completion = int(m.group(1))
                if '\"total_tokens_count\"' in line:
                    import re
                    m = re.search(r'\"total_tokens_count\":\s*(\d+)', line)
                    if m: last_total = int(m.group(1))
                if '\"cached_tokens_count\"' in line:
                    import re
                    m = re.search(r'\"cached_tokens_count\":\s*(\d+)', line)
                    if m: last_cached = int(m.group(1))

        info['latest_prompt_tokens'] = last_prompt
        info['latest_completion_tokens'] = last_completion
        info['latest_total_tokens'] = last_total
        info['latest_cached_tokens'] = last_cached

# Calculate context window and usage
model_windows = {
    'claude-opus-4.6': 200000,
    'claude-opus-4.6-1m': 1000000,
    'claude-opus-4.5': 200000,
    'claude-sonnet-4.6': 200000,
    'claude-sonnet-4.5': 200000,
    'claude-sonnet-4': 200000,
    'claude-haiku-4.5': 200000,
}

effective_model = info['configured_model'] or info['model']
if effective_model and effective_model in model_windows:
    info['context_window'] = model_windows[effective_model]
    if info['latest_prompt_tokens']:
        info['context_used_pct'] = round(
            (info['latest_prompt_tokens'] / info['context_window']) * 100, 1
        )

print(json.dumps(info))
" 2>/dev/null
}

# ── Main ─────────────────────────────────────────────────────────────

# Check tmux is available
if ! command -v tmux &>/dev/null || [[ -z "${TMUX:-}" ]]; then
  echo "Error: Not running inside tmux" >&2
  exit 1
fi

# Collect pane info
if [[ "$MODE" == "current" ]]; then
  # Use TMUX_PANE env var to find our specific pane, then its window
  MY_PANE="${TMUX_PANE:-}"
  if [[ -n "$MY_PANE" ]]; then
    # Get all panes, filter to the window containing our pane
    MY_WINDOW=$(tmux list-panes -a -F '#{window_id}|#{pane_id}' | grep "${MY_PANE}" | head -1 | cut -d'|' -f1)
    if [[ -n "$MY_WINDOW" ]]; then
      PANE_DATA=$(tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}|#{pane_tty}|#{pane_pid}|#{pane_current_command}|#{window_id}' \
        | grep "${MY_WINDOW}" \
        | cut -d'|' -f1-4)
    else
      PANE_DATA=$(tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}|#{pane_tty}|#{pane_pid}|#{pane_current_command}|#{pane_id}' \
        | grep "${MY_PANE}" \
        | cut -d'|' -f1-4)
    fi
  else
    PANE_DATA=$(tmux list-panes -F '#{session_name}:#{window_index}.#{pane_index}|#{pane_tty}|#{pane_pid}|#{pane_current_command}')
  fi
else
  # All panes across all sessions
  PANE_DATA=$(tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}|#{pane_tty}|#{pane_pid}|#{pane_current_command}')
fi

RESULTS=()
RESULT_COUNT=0

while IFS='|' read -r pane_id pane_tty pane_pid pane_cmd; do
  # Find copilot process on this TTY
  copilot_pid=$(find_copilot_on_tty "$pane_tty")
  [[ -z "$copilot_pid" ]] && continue

  # Find session ID
  session_id=$(find_session_for_pid "$copilot_pid")
  [[ -z "$session_id" ]] && continue

  # Get full session info
  session_json=$(get_session_info "$session_id" "$copilot_pid")
  [[ -z "$session_json" ]] && continue

  # Add tmux context to the JSON
  session_json=$(echo "$session_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
data['tmux_pane'] = '${pane_id}'
data['tmux_tty'] = '${pane_tty}'
data['copilot_pid'] = ${copilot_pid}
print(json.dumps(data))
")

  RESULTS+=("$session_json")
  RESULT_COUNT=$((RESULT_COUNT + 1))
done <<< "$PANE_DATA"

# ── Output ───────────────────────────────────────────────────────────

if [[ "$OUTPUT" == "json" ]]; then
  printf '[\n'
  for i in "${!RESULTS[@]}"; do
    echo "  ${RESULTS[$i]}"
    if [[ $i -lt $((${#RESULTS[@]} - 1)) ]]; then
      printf ',\n'
    fi
  done
  printf '\n]\n'
else
  if [[ $RESULT_COUNT -eq 0 ]]; then
    echo "No Copilot CLI sessions found in tmux panes."
    exit 0
  fi

  echo "═══════════════════════════════════════════════════════════════"
  echo "  Copilot CLI Sessions in tmux  (found: ${RESULT_COUNT})"
  echo "═══════════════════════════════════════════════════════════════"

  for result in "${RESULTS[@]}"; do
    echo "$result" | python3 -c "
import json, sys

d = json.load(sys.stdin)

print()
print(f\"  tmux pane:        {d['tmux_pane']}\")
print(f\"  TTY:              {d['tmux_tty']}\")
print(f\"  Copilot PID:      {d['copilot_pid']}\")
print(f\"  Session ID:       {d['session_id']}\")
print(f\"  ─────────────────────────────────────────────────\")
print(f\"  Model (active):   {d.get('model') or '—'}\")
print(f\"  Model (config):   {d.get('configured_model') or '—'}\")
print(f\"  Reasoning:        {d.get('reasoning_effort') or '—'}\")
print(f\"  Copilot Version:  {d.get('copilot_version') or '—'}\")
print(f\"  ─────────────────────────────────────────────────\")
print(f\"  CWD:              {d.get('cwd') or '—'}\")
print(f\"  Branch:           {d.get('branch') or '—'}\")
print(f\"  Repository:       {d.get('repository') or '—'}\")
print(f\"  Started:          {d.get('start_time') or '—'}\")
print(f\"  ─────────────────────────────────────────────────\")

# Token usage
prompt = d.get('latest_prompt_tokens')
completion = d.get('latest_completion_tokens')
total = d.get('latest_total_tokens')
cached = d.get('latest_cached_tokens')
ctx_window = d.get('context_window')
ctx_pct = d.get('context_used_pct')

def fmt_tokens(n):
    if n is None: return '—'
    if n >= 1000: return f'{n:,} ({n/1000:.1f}k)'
    return str(n)

print(f\"  ─── Token Usage (latest turn) ───────────────────\")
print(f\"  Prompt tokens:    {fmt_tokens(prompt)}\")
print(f\"  Completion:       {fmt_tokens(completion)}\")
print(f\"  Cached:           {fmt_tokens(cached)}\")
print(f\"  Total (turn):     {fmt_tokens(total)}\")

if ctx_window:
    remaining = ctx_window - (prompt or 0)
    print(f\"  ─── Context Budget ──────────────────────────────\")
    print(f\"  Context window:   {fmt_tokens(ctx_window)}\")
    print(f\"  Used:             {ctx_pct}%\")
    print(f\"  Remaining:        ~{fmt_tokens(remaining)}\")

print(f\"  ─── Session Totals ──────────────────────────────\")
print(f\"  Output tokens:    {fmt_tokens(d.get('total_output_tokens'))}\")
print(f\"  Turns:            {d.get('turn_count', 0)}\")

print()
print(f\"  ═══════════════════════════════════════════════════\")
"
  done
fi
