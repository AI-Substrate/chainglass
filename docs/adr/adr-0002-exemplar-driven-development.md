---
title: "ADR-0002: Exemplar-Driven Development"
status: "Accepted"
date: "2026-01-21"
authors: "Chainglass Team"
tags: ["architecture", "decision", "testing", "exemplars", "fixtures", "development-workflow"]
supersedes: ""
superseded_by: ""
---

# ADR-0002: Exemplar-Driven Development

## Status

**Accepted**

## Context

Chainglass implements a filesystem-based workflow system where all state lives in files and directories tracked by git. This design philosophy creates a unique testing challenge: how do we validate that code correctly produces and consumes the expected filesystem structures?

Traditional testing approaches face significant friction with filesystem-based systems:

- **Generated fixtures** test in-memory objects but miss actual file I/O behavior, encoding issues, and path handling edge cases
- **Mock-based testing** is explicitly banned by project architecture rules (fakes-only policy) and doesn't test real filesystem semantics
- **Database snapshots** contradict the explicit design non-goal of "no database; filesystem is the storage layer"

Key constraints driving this decision:

1. **Filesystem-First Design**: All workflow state lives in files - YAML configs, JSON schemas, phase outputs, run metadata
2. **Git as Version Control**: Workflows are versioned through git, requiring human-readable, diffable file formats
3. **Agent-Friendly Output**: AI agents consume JSON output and must understand expected structures
4. **Deterministic Testing**: Project testing philosophy requires reproducible, deterministic tests
5. **Schema-Enforced Contracts**: JSON outputs must validate against schemas; tests must verify this validation works

Without a standardized approach, each developer would create ad-hoc test fixtures, leading to inconsistent testing patterns, duplicated effort, and tests that don't accurately reflect production behavior.

## Decision

We adopt **Exemplar-Driven Development** as the standard pattern for building and testing filesystem-based features. This means:

1. **Exemplars as Golden References**: Static, committed exemplar files serve as the canonical "ground truth" for expected filesystem structures. These exemplars are:
   - Version controlled in `dev/examples/` directories
   - Human-inspectable and editable
   - Validated by the test suite
   - Used as documentation through concrete examples

2. **Exemplar Completeness**: Exemplars must cover the full range of states:
   - **Complete successful runs**: All phases finished, all outputs present
   - **Partially completed runs**: Mid-workflow state (some phases complete, others pending)
   - **Failed/error state runs**: Invalid inputs, schema failures, missing files
   - **Edge cases**: Empty collections, boundary values, special characters

3. **Bidirectional Validation**: The relationship between code and exemplars is bidirectional:
   - **Code validates exemplars**: Test suite runs against exemplar files to ensure they match schemas
   - **Exemplars validate code**: Code output is compared against exemplar structure
   - When tests fail, either **code OR exemplar** may need updating (conscious decision)

4. **Tools Point at Exemplars**: CLI commands and MCP tools use exemplar directories for integration testing:
   - `cg wf compose hello-workflow` can use exemplar template
   - `cg phase validate gather --run-dir <exemplar>` validates against real structure
   - Contract tests verify tools produce exemplar-equivalent output

5. **Exemplar-First Development Sequence**: For new features:
   - Create exemplar files BEFORE writing implementation code
   - Write tests that validate against exemplar
   - Implement code to produce exemplar-matching output
   - Exemplar serves as executable specification

## Consequences

### Positive

- **POS-001**: Exemplars provide unambiguous, concrete documentation of expected filesystem structures that developers can inspect directly, eliminating ambiguity in specifications
- **POS-002**: Tests using static exemplars are fully deterministic and reproducible across environments, aligning with project testing philosophy and eliminating flaky tests
- **POS-003**: Version-controlled exemplars create an audit trail of structural changes, making it clear when and why expected outputs evolved
- **POS-004**: Exemplars serve triple duty as test fixtures, documentation, and integration test targets, reducing duplication of effort across development activities
- **POS-005**: File-based exemplars are format-agnostic and portable, working with any programming language or tool that can read files
- **POS-006**: Developers new to the project can immediately understand expected structures by browsing exemplar directories rather than reading abstract specifications

### Negative

- **NEG-001**: Exemplar files must be maintained when schemas or structures change, creating additional maintenance burden that must be budgeted into feature work
- **NEG-002**: Comprehensive exemplars (success, partial, failure states) require significant upfront effort before implementation can begin
- **NEG-003**: Large numbers of exemplar files can increase repository size, though this is mitigated by limiting to representative examples
- **NEG-004**: When tests fail, developers must determine whether to fix code or update exemplar, requiring domain knowledge to make the correct choice
- **NEG-005**: Exemplars can become stale if not validated regularly, requiring CI integration to detect drift between code and exemplars

## Alternatives Considered

### Alternative 1: Generated Fixtures at Test Runtime

- **ALT-001**: **Description**: Use fixture generation libraries (Faker.js, Fishery, FactoryBot-style) to create workflow structures dynamically in test setup hooks
- **ALT-002**: **Rejection Reason**: Generated fixtures test in-memory objects, not actual filesystem operations. The workflow system's core value is filesystem-based state management; generated fixtures would miss file encoding issues, path handling edge cases, and YAML/JSON parsing behavior. Additionally, randomized generation contradicts the project's deterministic testing requirement.

### Alternative 2: Mock-Based Testing Without Real Filesystem

- **ALT-003**: **Description**: Use mocking libraries (`vi.mock()`, `jest.mock()`) to intercept filesystem operations and return canned responses without disk I/O
- **ALT-004**: **Rejection Reason**: Explicitly banned by project architecture rules. Architecture.md mandates fakes-only testing: "| Anti-Pattern | `vi.mock()` in tests | Not behavior-focused | Use fakes |". Mocks don't capture real filesystem semantics (permissions, encodings, atomicity) and create tests tightly coupled to implementation details.

### Alternative 3: Database Snapshots Approach

- **ALT-005**: **Description**: Store workflow state in SQLite or embedded database, using database snapshot files as fixtures for testing
- **ALT-006**: **Rejection Reason**: Fundamentally incompatible with system design. The spec explicitly states "No Database Backend: No database; filesystem is the storage layer" (wf-basics-spec.md Non-Goals). Binary database files aren't git-diffable, human-editable, or aligned with the "git provides versioning" philosophy.

### Alternative 4: Hybrid Approach (Static + Generated)

- **ALT-007**: **Description**: Use committed static exemplars for happy paths, supplemented by generated fixtures for edge cases (error states, boundary conditions)
- **ALT-008**: **Rejection Reason**: Adds complexity with two testing patterns before it's proven necessary. Current acceptance criteria can all be validated with static exemplars. The hybrid approach may be valuable later for testing all 30+ error codes systematically, but follows YAGNI - don't add complexity until proven necessary.

## Implementation Notes

- **IMP-001**: Exemplar directories follow the pattern `dev/examples/<feature>/` with `template/` for templates and `runs/` for run states. Each feature area maintains its own exemplar set.
- **IMP-002**: The CI pipeline must validate exemplars against schemas on every commit. Failed exemplar validation blocks merge, ensuring exemplars never drift from schema definitions.
- **IMP-003**: When adding new failure scenarios, create dedicated exemplar directories (e.g., `runs/run-missing-input-001/`, `runs/run-schema-failure-001/`) rather than modifying success exemplars.
- **IMP-004**: Exemplar creation is Phase 0 work for any filesystem-based feature. Implementation cannot begin until exemplars exist and pass schema validation.
- **IMP-005**: Test documentation (Test Doc format) must reference which exemplar the test validates against, creating traceability between tests and expected structures.
- **IMP-006**: When code changes break exemplar validation, the developer must explicitly decide: update the exemplar (expected change) or fix the code (regression). This decision must be documented in commit messages.

## References

- **REF-001**: [Spec](../plans/003-wf-basics/wf-basics-spec.md)
- **REF-002**: [Plan](../plans/003-wf-basics/wf-basics-plan.md)
- **REF-003**: [ADR-0001: MCP Tool Design Patterns](./adr-0001-mcp-tool-design-patterns.md) - Establishes `check_health` as tool exemplar pattern
- **REF-004**: [Constitution](../project-rules/constitution.md) - Defines fakes-only testing policy and reference implementations
- **REF-005**: [Idioms](../project-rules/idioms.md) - Documents Fake Implementation Pattern with test helpers
- **REF-006**: [Phase 0 Tasks](../plans/003-wf-basics/tasks/phase-0-development-exemplar/tasks.md) - First implementation of exemplar-driven development
