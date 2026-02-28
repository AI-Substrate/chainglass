# Fix Tasks: Phase 1 — Domain Finalization & Template Schema

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add main barrel re-exports for interfaces, schemas, and fakes
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/048-wf-web/packages/workflow/src/index.ts`
- **Issue**: ITemplateService, IInstanceService, TemplateManifest, InstanceMetadata, Zod schemas, FakeTemplateService, FakeInstanceService, and call-tracking types are not re-exported from the main package barrel. Downstream consumers importing from `@chainglass/workflow` cannot access these types.
- **Fix**: Add re-export blocks to `src/index.ts` following the existing pattern. Three groups:
- **Patch hint**:
  ```diff
  + // Template/Instance schemas (Plan 048)
  + export {
  +   TemplateNodeEntrySchema,
  +   TemplateUnitEntrySchema,
  +   TemplateManifestSchema,
  + } from './schemas/workflow-template.schema.js';
  + export type {
  +   TemplateNodeEntry,
  +   TemplateUnitEntry,
  +   TemplateManifest,
  + } from './schemas/workflow-template.schema.js';
  + export {
  +   InstanceUnitEntrySchema,
  +   InstanceMetadataSchema,
  + } from './schemas/instance-metadata.schema.js';
  + export type {
  +   InstanceUnitEntry,
  +   InstanceMetadata,
  + } from './schemas/instance-metadata.schema.js';
  +
  + // Template/Instance interfaces (Plan 048)
  + export type {
  +   ITemplateService,
  +   ListWorkflowsResult,
  +   ShowWorkflowResult,
  +   SaveFromResult,
  +   InstantiateResult,
  +   ListInstancesResult,
  +   RefreshResult,
  + } from './interfaces/index.js';
  + export type {
  +   IInstanceService,
  +   InstanceStatus,
  +   GetStatusResult,
  + } from './interfaces/index.js';
  +
  + // Template/Instance fakes (Plan 048)
  + export { FakeTemplateService } from './fakes/index.js';
  + export type { SaveFromCall, InstantiateCall, RefreshCall } from './fakes/index.js';
  + export { FakeInstanceService } from './fakes/index.js';
  + export type { GetStatusCall } from './fakes/index.js';
  ```

### FT-002: Update domain.md — resolve ownership contradiction
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md`
- **Issue**: § "Does NOT Own" says *"Workflow template registry and lifecycle — belongs to @chainglass/workflow package"* but the plan assigns all template/instance files to this domain. § Contracts table is missing ITemplateService and IInstanceService. § Composition is missing new components. § Source Location doesn't cover packages/workflow/.
- **Fix**: Apply all four updates:
  1. Remove "Workflow template registry and lifecycle" from "Does NOT Own" and add to "Owns": *"Workflow template and instance lifecycle — saveFrom, instantiate, refresh, status queries (via @chainglass/workflow package)"*
  2. Add to § Contracts:
     - `ITemplateService | Interface | CLI, web, tests | Template CRUD — saveFrom, listWorkflows, showWorkflow, instantiate, listInstances, refresh`
     - `IInstanceService | Interface | CLI, web, tests | Instance status queries — getStatus`
  3. Add to § Composition:
     - `TemplateManifestSchema | Template directory validation | Zod, z.infer<>`
     - `InstanceMetadataSchema | Instance.yaml validation | Zod, z.infer<>`
     - `FakeTemplateService | Test double for ITemplateService | Call tracking + return builders`
     - `FakeInstanceService | Test double for IInstanceService | Call tracking + return builders`
  4. Add to § Source Location:
     - `packages/workflow/src/schemas/workflow-template.schema.ts | Template manifest Zod schema | Plan 048`
     - `packages/workflow/src/schemas/instance-metadata.schema.ts | Instance metadata Zod schema | Plan 048`
     - `packages/workflow/src/interfaces/template-service.interface.ts | ITemplateService contract | Plan 048`
     - `packages/workflow/src/interfaces/instance-service.interface.ts | IInstanceService contract | Plan 048`
     - `packages/workflow/src/fakes/fake-template-service.ts | Test double | Plan 048`
     - `packages/workflow/src/fakes/fake-instance-service.ts | Test double | Plan 048`
  5. Update § History with Plan 048 entry

### FT-003: Update domain-map.md node label
- **Severity**: HIGH (via F009 escalation — required for domain compliance)
- **File(s)**: `/home/jak/substrate/048-wf-web/docs/domains/domain-map.md`
- **Issue**: posGraph node label lists 4 contracts but not the 2 new ones (ITemplateService, IInstanceService)
- **Fix**: Update the Mermaid node label and health summary table
- **Patch hint**:
  ```diff
  -    posGraph["📊 _platform/positional-graph<br/>IPositionalGraphService<br/>IOrchestrationService<br/>IEventHandlerService<br/>IWorkUnitService"]:::infra
  +    posGraph["📊 _platform/positional-graph<br/>IPositionalGraphService<br/>IOrchestrationService<br/>IEventHandlerService<br/>IWorkUnitService<br/>ITemplateService<br/>IInstanceService"]:::infra
  ```

## Medium Fixes

### FT-004: Fix FakeTemplateService.reset() to clear preset results
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/048-wf-web/packages/workflow/src/fakes/fake-template-service.ts`
- **Issue**: reset() clears call-tracking and collections but not the three preset result fields
- **Fix**: Add preset result resets
- **Patch hint**:
  ```diff
    reset(): void {
      this.saveFromCalls.length = 0;
      this.listWorkflowsCalls.length = 0;
      this.showWorkflowCalls.length = 0;
      this.instantiateCalls.length = 0;
      this.listInstancesCalls.length = 0;
      this.refreshCalls.length = 0;
      this.workflows = [];
      this.instances.clear();
  +   this.saveFromResult = { data: null, errors: [] };
  +   this.instantiateResult = { data: null, errors: [] };
  +   this.refreshResult = { data: null, errors: [] };
    }
  ```

## Low / Optional Fixes

### FT-005: Extract duplicated slugPattern regex
- **Severity**: LOW
- **File(s)**: `packages/workflow/src/schemas/workflow-template.schema.ts`, `packages/workflow/src/schemas/instance-metadata.schema.ts`
- **Issue**: Same `slugPattern = /^[a-z][a-z0-9-]*$/` in both files
- **Fix**: Extract to a shared file (e.g., `packages/workflow/src/schemas/shared-patterns.ts`) and import in both

### FT-006: Align contract test factory signature
- **Severity**: MEDIUM (optional — functional divergence from pattern)
- **File(s)**: `test/contracts/template-service.contract.ts`, `test/contracts/instance-service.contract.ts`
- **Issue**: Uses `(createContext: () => { service, name })` instead of existing `(name: string, createService: () => T)` pattern
- **Fix**: Align signature to match existing contract tests if desired; functional as-is

## Re-Review Checklist

- [ ] FT-001: Main barrel exports added (interfaces, schemas, fakes)
- [ ] FT-002: domain.md updated (ownership, contracts, composition, source location)
- [ ] FT-003: domain-map.md node label updated
- [ ] FT-004: FakeTemplateService.reset() clears preset results
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
