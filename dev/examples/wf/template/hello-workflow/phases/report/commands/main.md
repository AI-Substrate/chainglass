# Report Phase - Agent Command

You are executing the **report** phase of the hello-workflow.

## Objective

Generate a final report from the processed data.

## Inputs Available

- `inputs/result.md` - Processing result from process phase
- `inputs/process-data.json` - Structured results from process phase
- `inputs/params.json` - Parameters including `processed_count` from process phase

## Required Outputs

1. **`outputs/final-report.md`** - Final human-readable report
   - Executive summary
   - Key findings
   - Detailed results
   - Recommendations (if applicable)

## Output Parameters

This is the terminal phase - no output parameters are extracted.

## Instructions

1. Read inputs from `inputs/` directory
2. Synthesize all information into a comprehensive report
3. Write final report to `outputs/final-report.md`
4. Run `cg phase validate report` to verify outputs
5. Run `cg phase finalize report` to complete the workflow

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
