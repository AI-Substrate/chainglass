# Spec-to-Exemplar Traceability Matrix

This document maps acceptance criteria from the spec to the exemplar files that satisfy them.

**Spec**: `docs/plans/003-wf-basics/wf-basics-spec.md`
**Plan**: `docs/plans/003-wf-basics/wf-basics-plan.md`
**Exemplar**: `dev/examples/wf/`

---

## Phase 0 Acceptance Criteria

| AC | Description | Exemplar File(s) | Evidence |
|----|-------------|------------------|----------|
| AC-01 | Template at `dev/examples/wf/template/hello-workflow/` with wf.yaml, schemas/, templates/, phases/ | `template/hello-workflow/wf.yaml`, `template/hello-workflow/schemas/`, `template/hello-workflow/templates/wf.md`, `template/hello-workflow/phases/` | Directories and files exist |
| AC-02 | wf.yaml parses without errors, contains 3 phases: gather, process, report | `template/hello-workflow/wf.yaml` (lines 13-104) | `npx yaml` parses successfully; phases defined at lines 13, 47, 79 |
| AC-03 | All schemas are valid JSON Schema Draft 2020-12 | `template/hello-workflow/schemas/*.schema.json` | `ajv compile --spec=draft2020` passes for all 4 schemas |
| AC-04 | Each phase in run-example-001 has complete structure: wf-phase.yaml, commands/, schemas/, run/ (with inputs/, outputs/, wf-data/) | `runs/run-example-001/phases/{gather,process,report}/` | All directories exist with required files |
| AC-05 | All JSON files pass schema validation | `runs/run-example-001/phases/*/run/outputs/*.json`, `runs/run-example-001/phases/*/run/wf-data/*.json` | All `ajv validate` commands pass |

---

## Detailed File Mapping

### AC-01: Template Structure

| Component | Exemplar Path |
|-----------|---------------|
| Template Root | `template/hello-workflow/` |
| Workflow Definition | `template/hello-workflow/wf.yaml` |
| Schemas Directory | `template/hello-workflow/schemas/` |
| Templates Directory | `template/hello-workflow/templates/` |
| Phases Directory | `template/hello-workflow/phases/` |
| Gather Commands | `template/hello-workflow/phases/gather/commands/main.md` |
| Process Commands | `template/hello-workflow/phases/process/commands/main.md` |
| Report Commands | `template/hello-workflow/phases/report/commands/main.md` |

### AC-02: wf.yaml Content

| Element | Location in wf.yaml |
|---------|---------------------|
| Workflow Name | Line 9: `name: hello-workflow` |
| Version | Line 10: `version: "1.0.0"` |
| Gather Phase | Lines 13-45 |
| Process Phase | Lines 47-77 |
| Report Phase | Lines 79-104 |

### AC-03: JSON Schemas

| Schema | Path | Purpose |
|--------|------|---------|
| wf.schema.json | `template/hello-workflow/schemas/wf.schema.json` | Validates wf.yaml structure |
| wf-phase.schema.json | `template/hello-workflow/schemas/wf-phase.schema.json` | Validates phase state (wf-data/wf-phase.json) |
| gather-data.schema.json | `template/hello-workflow/schemas/gather-data.schema.json` | Validates gather phase output |
| process-data.schema.json | `template/hello-workflow/schemas/process-data.schema.json` | Validates process phase output |

### AC-04: Run Example Structure

#### Gather Phase
| Component | Path |
|-----------|------|
| Phase Config | `runs/run-example-001/phases/gather/wf-phase.yaml` |
| Commands | `runs/run-example-001/phases/gather/commands/main.md` |
| Schemas | `runs/run-example-001/phases/gather/schemas/` |
| Inputs | `runs/run-example-001/phases/gather/run/inputs/files/request.md` |
| Outputs | `runs/run-example-001/phases/gather/run/outputs/acknowledgment.md`, `gather-data.json` |
| WF Data | `runs/run-example-001/phases/gather/run/wf-data/wf-phase.json`, `output-params.json` |

#### Process Phase
| Component | Path |
|-----------|------|
| Phase Config | `runs/run-example-001/phases/process/wf-phase.yaml` |
| Commands | `runs/run-example-001/phases/process/commands/main.md` |
| Schemas | `runs/run-example-001/phases/process/schemas/` |
| Inputs (from_phase) | `runs/run-example-001/phases/process/run/inputs/files/acknowledgment.md`, `data/gather-data.json`, `params.json` |
| Outputs | `runs/run-example-001/phases/process/run/outputs/result.md`, `process-data.json` |
| WF Data | `runs/run-example-001/phases/process/run/wf-data/wf-phase.json`, `output-params.json` |

#### Report Phase
| Component | Path |
|-----------|------|
| Phase Config | `runs/run-example-001/phases/report/wf-phase.yaml` |
| Commands | `runs/run-example-001/phases/report/commands/main.md` |
| Schemas | `runs/run-example-001/phases/report/schemas/` |
| Inputs (from_phase) | `runs/run-example-001/phases/report/run/inputs/files/result.md`, `data/process-data.json`, `params.json` |
| Outputs | `runs/run-example-001/phases/report/run/outputs/final-report.md` |
| WF Data | `runs/run-example-001/phases/report/run/wf-data/wf-phase.json` |

### AC-05: JSON Validation Results

| JSON File | Schema | Validation Status |
|-----------|--------|-------------------|
| gather-data.json | gather-data.schema.json | ✅ Valid |
| process-data.json | process-data.schema.json | ✅ Valid |
| gather/wf-phase.json | wf-phase.schema.json | ✅ Valid |
| process/wf-phase.json | wf-phase.schema.json | ✅ Valid |
| report/wf-phase.json | wf-phase.schema.json | ✅ Valid |

---

## Validation Commands

To re-verify exemplar integrity:

```bash
cd dev/examples/wf

# AC-02: YAML Syntax
cat template/hello-workflow/wf.yaml | npx yaml

# AC-03: Schema Validity
ajv compile --spec=draft2020 -s template/hello-workflow/schemas/wf.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/wf-phase.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/gather-data.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/process-data.schema.json

# AC-05: Data Validation
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/gather-data.schema.json \
  -d runs/run-example-001/phases/gather/run/outputs/gather-data.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/process-data.schema.json \
  -d runs/run-example-001/phases/process/run/outputs/process-data.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/run-example-001/phases/gather/run/wf-data/wf-phase.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/run-example-001/phases/process/run/wf-data/wf-phase.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/run-example-001/phases/report/run/wf-data/wf-phase.json
```

---

## Notes

- **Exemplars are fungible**: As implementation evolves, exemplar files may be updated. This matrix should be updated accordingly.
- **Per ADR-0002**: Exemplars serve as "golden references" for testing and development.
- **Phase 1+**: Automated tests will validate exemplars against schemas on every test run.

---

*Last updated: 2026-01-21*
