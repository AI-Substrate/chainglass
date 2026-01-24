#!/bin/bash
# check-state.sh - Report phase states for a workflow run
#
# Usage: ./check-state.sh <run-dir>
#
# Example: ./check-state.sh ./results/run-2026-01-23-001

set -e

RUN_DIR="${1:-.}"

if [ ! -d "$RUN_DIR/phases" ]; then
    echo "Error: No phases directory found at $RUN_DIR/phases"
    echo "Usage: ./check-state.sh <run-dir>"
    exit 1
fi

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
                output_count=$(find "$outputs_dir" -type f | wc -l)
                if [ "$output_count" -gt 0 ]; then
                    echo "           └── outputs: $output_count file(s)"
                fi
            fi
            
            # Check for messages
            messages_dir="$phase_dir/run/messages"
            if [ -d "$messages_dir" ]; then
                msg_count=$(find "$messages_dir" -name "m-*.json" -type f | wc -l)
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
