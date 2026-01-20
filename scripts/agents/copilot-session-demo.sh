#!/usr/bin/env bash
#
# copilot-session-demo.sh
#
# Demonstrates running GitHub Copilot CLI with:
# 1. An initial prompt
# 2. Waiting for completion
# 3. Extracting session ID from log files
# 4. Running a follow-up prompt in the same session
#
# Based on Vibe Kanban's copilot.rs implementation
#
# Usage: ./copilot-session-demo.sh [working_dir]

set -euo pipefail

# Configuration
COPILOT_VERSION="0.0.375"
LOG_BASE_DIR="${TMPDIR:-/tmp}/copilot_session_demo"
POLL_INTERVAL_MS=200
SESSION_TIMEOUT_SECS=60

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Create unique log directory for this run
create_log_dir() {
    local run_id
    run_id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s)
    local log_dir="${LOG_BASE_DIR}/${run_id}"
    mkdir -p "$log_dir"
    echo "$log_dir"
}

# Extract session ID from log files (Vibe Kanban pattern)
# Polls log directory for files containing "events to session <UUID>"
extract_session_id() {
    local log_dir="$1"
    local timeout_secs="${2:-$SESSION_TIMEOUT_SECS}"
    local poll_interval_secs
    poll_interval_secs=$(echo "scale=3; $POLL_INTERVAL_MS / 1000" | bc)

    local elapsed=0
    local session_id=""

    log_info "Polling for session ID in $log_dir (timeout: ${timeout_secs}s)..."

    while (( elapsed < timeout_secs )); do
        # Search all .log files for session ID pattern
        # Pattern from Vibe Kanban: "events to session <UUID>"
        for logfile in "$log_dir"/*.log 2>/dev/null; do
            if [[ -f "$logfile" ]]; then
                session_id=$(grep -oE 'events to session ([0-9a-fA-F-]{36})' "$logfile" 2>/dev/null | head -1 | grep -oE '[0-9a-fA-F-]{36}' || true)
                if [[ -n "$session_id" ]]; then
                    log_success "Found session ID: $session_id"
                    echo "$session_id"
                    return 0
                fi
            fi
        done

        sleep "$poll_interval_secs"
        elapsed=$((elapsed + 1))
    done

    log_error "Timeout waiting for session ID"
    return 1
}

# Run Copilot with a prompt and capture output
run_copilot() {
    local prompt="$1"
    local log_dir="$2"
    local session_id="${3:-}"  # Optional: for resume
    local working_dir="${4:-.}"

    local args=(
        "--no-color"
        "--log-level" "debug"
        "--log-dir" "$log_dir"
    )

    # Add resume flag if session ID provided
    if [[ -n "$session_id" ]]; then
        args+=("--resume" "$session_id")
        log_info "Resuming session: $session_id"
    fi

    log_info "Running Copilot in: $working_dir"
    log_info "Prompt: $prompt"
    log_info "Log dir: $log_dir"
    echo ""

    # Run copilot with piped stdin (Vibe Kanban pattern)
    # Prompt is written to stdin, then stdin is closed
    cd "$working_dir"
    echo "$prompt" | npx -y "@github/copilot@${COPILOT_VERSION}" "${args[@]}" 2>&1
    local exit_code=$?

    echo ""
    if [[ $exit_code -eq 0 ]]; then
        log_success "Copilot completed successfully (exit code: $exit_code)"
    else
        log_warn "Copilot exited with code: $exit_code"
    fi

    return $exit_code
}

# Main demo
main() {
    local working_dir="${1:-.}"

    echo "======================================"
    echo "GitHub Copilot CLI Session Demo"
    echo "======================================"
    echo ""

    # Verify copilot is accessible
    log_info "Checking Copilot CLI availability..."
    if ! npx -y "@github/copilot@${COPILOT_VERSION}" --version &>/dev/null; then
        log_error "Cannot access @github/copilot@${COPILOT_VERSION}"
        log_error "Make sure you have npm/npx installed and network access"
        exit 1
    fi
    log_success "Copilot CLI is available"
    echo ""

    # === FIRST PROMPT ===
    echo "======================================"
    echo "STEP 1: Initial Prompt"
    echo "======================================"

    local log_dir_1
    log_dir_1=$(create_log_dir)

    local prompt_1="List the files in the current directory and briefly describe what this project does based on the file structure. Keep your response under 100 words."

    # Run first prompt
    run_copilot "$prompt_1" "$log_dir_1" "" "$working_dir"

    # Extract session ID (this happens async in Vibe Kanban, we do it after completion here)
    local session_id
    session_id=$(extract_session_id "$log_dir_1" 30) || {
        log_error "Failed to extract session ID from first run"
        log_info "Log files in $log_dir_1:"
        ls -la "$log_dir_1" 2>/dev/null || true
        exit 1
    }

    echo ""
    echo "======================================"
    echo "STEP 2: Follow-up Prompt (Same Session)"
    echo "======================================"
    echo ""
    log_info "Using session ID: $session_id"
    echo ""

    local log_dir_2
    log_dir_2=$(create_log_dir)

    local prompt_2="Based on what you just told me about this project, suggest one small improvement that could be made. Be specific and brief."

    # Run follow-up with --resume
    run_copilot "$prompt_2" "$log_dir_2" "$session_id" "$working_dir"

    echo ""
    echo "======================================"
    echo "Demo Complete"
    echo "======================================"
    echo ""
    log_success "Successfully demonstrated:"
    echo "  1. Running Copilot with initial prompt"
    echo "  2. Extracting session ID from log files"
    echo "  3. Resuming session with --resume flag"
    echo ""
    log_info "Session ID: $session_id"
    log_info "Log directories:"
    echo "  - Initial: $log_dir_1"
    echo "  - Follow-up: $log_dir_2"
}

# Alternative: Non-blocking version that returns session info
# Useful for programmatic control
run_copilot_async() {
    local prompt="$1"
    local log_dir="$2"
    local session_id="${3:-}"
    local working_dir="${4:-.}"
    local output_file="${5:-}"

    local args=(
        "--no-color"
        "--log-level" "debug"
        "--log-dir" "$log_dir"
    )

    if [[ -n "$session_id" ]]; then
        args+=("--resume" "$session_id")
    fi

    cd "$working_dir"

    if [[ -n "$output_file" ]]; then
        # Run in background, capture output
        echo "$prompt" | npx -y "@github/copilot@${COPILOT_VERSION}" "${args[@]}" > "$output_file" 2>&1 &
        echo $!  # Return PID
    else
        # Run in foreground
        echo "$prompt" | npx -y "@github/copilot@${COPILOT_VERSION}" "${args[@]}" 2>&1
    fi
}

# Wait for process and get exit status
wait_for_completion() {
    local pid="$1"
    local timeout_secs="${2:-300}"

    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
        if (( elapsed >= timeout_secs )); then
            log_error "Process $pid timed out after ${timeout_secs}s"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            kill -KILL "$pid" 2>/dev/null || true
            return 1
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    wait "$pid"
    return $?
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
