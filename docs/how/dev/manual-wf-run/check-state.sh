#!/bin/bash
# check-state.sh - Show current state of all phases
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load current run
if [ ! -f "$SCRIPT_DIR/.current-run" ]; then
    echo "ERROR: No current run. Run ./02-compose-run.sh first"
    exit 1
fi
RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")

echo "═══════════════════════════════════════════════════════════"
echo "Workflow State Report"
echo "Run: $RUN_DIR"
echo "═══════════════════════════════════════════════════════════"
echo ""

for phase_dir in "$RUN_DIR/phases"/*; do
    if [ -d "$phase_dir" ]; then
        phase_name=$(basename "$phase_dir")
        state_file="$phase_dir/run/wf-data/wf-phase.json"
        
        if [ -f "$state_file" ]; then
            state=$(jq -r '.state // "unknown"' "$state_file" 2>/dev/null || echo "unknown")
            facilitator=$(jq -r '.facilitator // "n/a"' "$state_file" 2>/dev/null || echo "n/a")
            
            # Color code state
            case "$state" in
                "complete")
                    state_display="\033[32m$state\033[0m"  # Green
                    ;;
                "active")
                    state_display="\033[33m$state\033[0m"  # Yellow
                    ;;
                "pending")
                    state_display="\033[90m$state\033[0m"  # Gray
                    ;;
                *)
                    state_display="$state"
                    ;;
            esac
            
            printf "%-10s: " "$phase_name"
            echo -e "$state_display (facilitator: $facilitator)"
            
            # Check for outputs
            outputs_dir="$phase_dir/run/outputs"
            if [ -d "$outputs_dir" ]; then
                output_count=$(find "$outputs_dir" -type f 2>/dev/null | wc -l)
                if [ "$output_count" -gt 0 ]; then
                    echo "           └── outputs: $output_count file(s)"
                fi
            fi
            
            # Check for messages
            messages_dir="$phase_dir/run/messages"
            if [ -d "$messages_dir" ]; then
                msg_count=$(find "$messages_dir" -name "m-*.json" -type f 2>/dev/null | wc -l)
                if [ "$msg_count" -gt 0 ]; then
                    echo "           └── messages: $msg_count"
                fi
            fi
        else
            printf "%-10s: " "$phase_name"
            echo -e "\033[90mnot initialized\033[0m"
        fi
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════"
