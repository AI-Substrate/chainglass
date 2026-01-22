# Report Phase - Agent Command

You are executing the **report** phase of the hello-workflow.

## Objective

Generate a final report from the processed data.

## Directory Structure

```
run/
├── inputs/             # Data from prior phase (process)
│   ├── files/          # Human-readable content (.md)
│   │   └── result.md
│   ├── data/           # Structured JSON data
│   │   └── process-data.json
│   └── params.json     # Output parameters from process phase
├── outputs/            # Your output files
│   └── final-report.md
└── wf-data/            # Workflow metadata (managed by CLI)
    ├── wf-phase.json   # Phase state tracking
    └── output-params.json  # Extracted parameters (on finalize)
```

> **inputs/ Directory Split**: Human-readable files (`.md`) go in `files/`, structured data (`.json`) goes in `data/`. This separation helps agents quickly identify content type.

> **No messages/ directory**: Report is a terminal phase - no agent↔orchestrator Q&A is needed. The agent produces the final deliverable without requiring additional input.

## Inputs Available

- `inputs/files/result.md` - Processing result from process phase
- `inputs/data/process-data.json` - Structured results from process phase
- `inputs/params.json` - Parameters: `{processed_count, status}` from process phase

## Required Outputs

1. **`outputs/final-report.md`** - Final human-readable report
   - Executive summary
   - Key findings
   - Detailed results
   - Recommendations (if applicable)

## Output Parameters

This is the terminal phase - no output parameters are extracted.

## Instructions

1. Read inputs from `inputs/files/` and `inputs/data/` directories
2. Read parameters from `inputs/params.json`
3. Synthesize all information into a comprehensive report
4. Write final report to `outputs/final-report.md`
5. Run `cg phase validate report` to verify outputs
6. Run `cg phase finalize report` to complete the workflow

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
