# Hello Workflow - Bootstrap Template

This template is shared across all phases and provides the workflow context.

## Workflow Overview

**Name**: hello-workflow
**Version**: 1.0.0
**Description**: A hello-world workflow demonstrating the three-phase pattern: gather, process, report.

## Phase Sequence

```
gather → process → report
```

1. **Gather**: Collect and acknowledge input data
2. **Process**: Transform and analyze gathered data
3. **Report**: Generate final deliverable

## Getting Started

### Prerequisites

- Chainglass CLI installed (`cg` command available)
- Workflow template available at `.chainglass/templates/hello-workflow/`

### Create a New Run

```bash
cg wf compose hello-workflow --output .chainglass/runs
```

### Execute Phases

For each phase, follow the cycle:

1. **Prepare**: `cg phase prepare <phase> --run-dir <run-path>`
2. **Work**: Read inputs, execute phase command, write outputs
3. **Validate**: `cg phase validate <phase> --run-dir <run-path>`
4. **Finalize**: `cg phase finalize <phase> --run-dir <run-path>`

### Full Execution Example

```bash
# Create workflow run
cg wf compose hello-workflow -o .chainglass/runs

# Execute gather phase
cg phase prepare gather --run-dir .chainglass/runs/run-2026-01-21-001
# ... do gather work ...
cg phase validate gather --run-dir .chainglass/runs/run-2026-01-21-001
cg phase finalize gather --run-dir .chainglass/runs/run-2026-01-21-001

# Execute process phase
cg phase prepare process --run-dir .chainglass/runs/run-2026-01-21-001
# ... do process work ...
cg phase validate process --run-dir .chainglass/runs/run-2026-01-21-001
cg phase finalize process --run-dir .chainglass/runs/run-2026-01-21-001

# Execute report phase
cg phase prepare report --run-dir .chainglass/runs/run-2026-01-21-001
# ... do report work ...
cg phase validate report --run-dir .chainglass/runs/run-2026-01-21-001
cg phase finalize report --run-dir .chainglass/runs/run-2026-01-21-001
```

## Directory Structure

After composing a workflow run:

```
run-{date}-{ordinal}/
├── wf.yaml                    # Workflow definition (copied from template)
├── wf-run/
│   └── wf-status.json         # Run metadata and phase status
└── phases/
    ├── gather/
    │   ├── wf-phase.yaml      # Phase config
    │   ├── commands/          # Agent commands
    │   ├── schemas/           # Validation schemas
    │   └── run/
    │       ├── inputs/        # files/, data/, params.json
    │       ├── outputs/       # Phase outputs
    │       └── wf-data/       # wf-phase.json, output-params.json
    ├── process/               # Same structure
    └── report/                # Same structure
```

## Error Handling

If validation fails:
1. Check error messages for specific issues
2. Fix the identified problems
3. Re-run validation
4. Only finalize when validation passes

## Support

For issues with this workflow template, consult the Chainglass documentation.
