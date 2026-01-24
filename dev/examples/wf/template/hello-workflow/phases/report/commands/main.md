# Report Phase - Agent Command

You are executing the **report** phase of the hello-workflow.

## Objective

Generate a final report from the processed data.

## Directory Structure

```
run/
├── inputs/             # Data from prior phase (process)
│   ├── files/          # All input files from prior phase
│   │   ├── result.md
│   │   └── process-data.json
│   └── params.json     # Output parameters from process phase
├── outputs/            # Your output files (flat directory)
│   └── final-report.md
└── wf-data/            # Workflow metadata (managed by CLI)
    ├── wf-phase.json   # Phase state tracking
    └── output-params.json  # Extracted parameters (on finalize)
```

> **Note**: All input files from prior phases are copied to `inputs/files/` regardless of type.

> **No messages/ directory**: Report is a terminal phase - no agent↔orchestrator Q&A is needed. The agent produces the final deliverable without requiring additional input.

## Inputs Available

- `inputs/files/result.md` - Processing result from process phase
- `inputs/files/process-data.json` - Structured results from process phase
- `inputs/params.json` - Parameters: `{processed_count}` from process phase

## Required Outputs

1. **`outputs/final-report.md`** - Final human-readable report
   - Executive summary
   - Key findings
   - Detailed results
   - Recommendations (if applicable)

## Output Parameters

This is the terminal phase - no output parameters are extracted.

## Instructions

1. Read inputs from `inputs/files/` directory
2. Read parameters from `inputs/params.json`
3. Synthesize all information into a comprehensive report
4. Write final report to `outputs/final-report.md`
5. Run `cg phase validate report --run-dir <path_to_run> --check outputs` to verify outputs
6. Run `cg phase finalize report --run-dir <path_to_run>` to complete the workflow

## Example final-report.md Structure

```markdown
# Workflow Report

## Executive Summary
Brief overview of the workflow execution and results.

## Key Findings
- Finding 1
- Finding 2

## Detailed Results
Comprehensive breakdown of processed items.

## Conclusion
Final thoughts and any recommendations.
```
