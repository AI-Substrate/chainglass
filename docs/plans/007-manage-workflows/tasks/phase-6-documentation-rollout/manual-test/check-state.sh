#!/bin/bash
# check-state.sh - Report workflow management state comprehensively
#
# Shows: workflow list, checkpoint versions, current run info, phase states
#
# DYK-05: Asserts slug/version_hash are non-empty when wf-status.json exists
#
# Usage: ./check-state.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
CLI="node $PROJECT_ROOT/apps/cli/dist/cli.cjs"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
GRAY='\033[0;90m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════"
echo "Workflow Management State Report"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Part 1: Workflow Templates
echo -e "${CYAN}Workflow Templates:${NC}"
echo ""

if [ -d "$PROJECT_ROOT/.chainglass/workflows" ]; then
    cd "$PROJECT_ROOT"
    $CLI workflow list 2>/dev/null || echo -e "  ${GRAY}(No workflows found or error listing)${NC}"
else
    echo -e "  ${GRAY}.chainglass/workflows/ does not exist${NC}"
    echo -e "  ${GRAY}Run: cg init${NC}"
fi

echo ""

# Part 2: Current Run (if tracked)
echo -e "${CYAN}Current Run:${NC}"
echo ""

if [ -f "$SCRIPT_DIR/.current-run" ]; then
    RUN_DIR=$(cat "$SCRIPT_DIR/.current-run")
    echo "  Path: $RUN_DIR"

    if [ -d "$RUN_DIR" ]; then
        # Check wf-status.json (DYK-05)
        WF_STATUS="$RUN_DIR/wf-run/wf-status.json"
        if [ -f "$WF_STATUS" ]; then
            echo ""
            echo -e "  ${CYAN}wf-status.json:${NC}"

            SLUG=$(jq -r '.workflow.slug // empty' "$WF_STATUS")
            VERSION_HASH=$(jq -r '.workflow.version_hash // empty' "$WF_STATUS")
            COMMENT=$(jq -r '.workflow.checkpoint_comment // "(no comment)"' "$WF_STATUS")
            WF_NAME=$(jq -r '.workflow.name // "unknown"' "$WF_STATUS")

            echo "    name: $WF_NAME"
            echo "    slug: $SLUG"
            echo "    version_hash: $VERSION_HASH"
            echo "    checkpoint_comment: $COMMENT"

            # DYK-05: Assert non-empty values
            if [ -z "$SLUG" ]; then
                echo -e "    ${RED}✗ slug is empty (DYK-05 violation)${NC}"
            else
                echo -e "    ${GREEN}✓ slug is non-empty${NC}"
            fi

            if [ -z "$VERSION_HASH" ]; then
                echo -e "    ${RED}✗ version_hash is empty (DYK-05 violation)${NC}"
            else
                echo -e "    ${GREEN}✓ version_hash is non-empty${NC}"
            fi
        else
            echo -e "  ${YELLOW}⚠ wf-status.json not found${NC}"
        fi

        # Phase states
        echo ""
        echo -e "  ${CYAN}Phase States:${NC}"

        if [ -d "$RUN_DIR/phases" ]; then
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
                                state_display="${GREEN}$state${NC}"
                                ;;
                            "active"|"ready")
                                state_display="${YELLOW}$state${NC}"
                                ;;
                            "pending")
                                state_display="${GRAY}$state${NC}"
                                ;;
                            *)
                                state_display="$state"
                                ;;
                        esac

                        printf "    %-10s: " "$phase_name"
                        echo -e "$state_display (facilitator: $facilitator)"

                        # Check for outputs
                        outputs_dir="$phase_dir/run/outputs"
                        if [ -d "$outputs_dir" ]; then
                            output_count=$(find "$outputs_dir" -type f 2>/dev/null | wc -l)
                            if [ "$output_count" -gt 0 ]; then
                                echo "               └── outputs: $output_count file(s)"
                            fi
                        fi

                        # Check for messages
                        messages_dir="$phase_dir/run/messages"
                        if [ -d "$messages_dir" ]; then
                            msg_count=$(find "$messages_dir" -name "m-*.json" -type f 2>/dev/null | wc -l)
                            if [ "$msg_count" -gt 0 ]; then
                                echo "               └── messages: $msg_count"
                            fi
                        fi
                    else
                        printf "    %-10s: " "$phase_name"
                        echo -e "${GRAY}not initialized${NC}"
                    fi
                fi
            done
        else
            echo -e "    ${GRAY}No phases directory${NC}"
        fi
    else
        echo -e "  ${RED}✗ Run directory does not exist${NC}"
        echo -e "  ${GRAY}The .current-run file points to a deleted path.${NC}"
        echo -e "  ${GRAY}Run: ./04-compose-run.sh${NC}"
    fi
else
    echo -e "  ${GRAY}.current-run not set${NC}"
    echo -e "  ${GRAY}Run: ./04-compose-run.sh${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
