#!/bin/bash
set -euo pipefail

# Work unit script
# Inputs are available as environment variables
# Write outputs to stdout or output files

echo "Hello from ${UNIT_SLUG:-unknown}"
