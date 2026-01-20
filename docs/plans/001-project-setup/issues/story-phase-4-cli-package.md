# Phase 4: CLI Package

**Type**: Story
**Parent**: Chainglass Project Setup (Feature)
**Phase**: 4 of 6

## Objective

Create the `cg` command-line interface as the primary distribution mechanism for Chainglass. Users install and run Chainglass as a local web server via a single `npx @chainglass/cli web` command. The CLI bundles a Next.js standalone server for portable execution.

## Acceptance Criteria

1. `cg` (no args) shows detailed, actionable help with examples
2. `cg --help` displays command list (web, mcp) with descriptions
3. `cg --version` displays package version
4. `cg web` starts production server from bundled standalone assets
5. `cg web --port 8080` starts server on custom port
6. `cg mcp --help` shows MCP options (stub for Phase 5)
7. `npx @chainglass/cli web` works from any directory (portable)
8. `npm link && cg web` works from any directory
9. Bundle works in isolation (no node_modules required)

## Scope

- **Tasks**: 16
- **Key Deliverables**:
  - CLI entry point (`packages/cli/src/bin/cg.ts`)
  - Web command with standalone server startup
  - MCP command stub (implementation in Phase 5)
  - esbuild config for bundling CLI + standalone web assets
  - Detailed, intuitive help system

## Non-Goals (This Phase)

- MCP server implementation (Phase 5)
- Development server command (`cg dev`) - use `just dev` instead
- Interactive prompts or terminal UI
- Configuration file support
- Progress spinners or fancy terminal UI (chalk for basic colors only)
- Docker image distribution

## Technical Notes

- Next.js `output: 'standalone'` creates portable server
- **Important**: Standalone doesn't include `public/` or `.next/static/` - build must copy these separately
- esbuild bundles `@chainglass/shared` + `chalk`, externalizes `pino`
- Use `chalk` for colored terminal output (startup messages, ready indicator)
- First-run feedback message for user experience (bundle may be 50-100MB)
- Commander.js v13+ for CLI parsing
- Use `createProgram({ testMode: true })` factory pattern for testable CLI (exitOverride + configureOutput)
- `just build` runs the full pipeline: build web → bundle CLI → copy standalone + static folders

## References

- Spec: `docs/plans/001-project-setup/project-setup-spec.md`
- Plan: `docs/plans/001-project-setup/project-setup-plan.md`
- Phase Dossier: `docs/plans/001-project-setup/tasks/phase-4-cli-package/tasks.md`

---
*Generated from phase dossier. See referenced documents for task details.*
