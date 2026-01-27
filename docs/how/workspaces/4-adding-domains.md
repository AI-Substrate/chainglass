# Adding New Domains

Step-by-step guide for adding new domain types (e.g., agents, workflows, prompts) using the Sample domain as a template.

## Overview

Each domain follows the same pattern:
1. **Entity** - Data class with private constructor + `create()` factory
2. **Adapter Interface** - CRUD operations contract
3. **Adapter Implementation** - Real filesystem I/O
4. **Fake Adapter** - Three-part test API
5. **Error Codes** - Domain-specific error handling
6. **Service** - Business logic layer
7. **Contract Tests** - Verify Fake-Real parity
8. **DI Registration** - Wire into containers

## Step 1: Create the Entity

Location: `packages/workflow/src/entities/<domain>.ts`

```typescript
import slugify from 'slugify';

export interface YourDomainInput {
  readonly name: string;
  readonly description: string;
  readonly slug?: string;         // Optional for loading existing
  readonly createdAt?: Date;      // Optional for loading existing
  readonly updatedAt?: Date;
}

export interface YourDomainJSON {
  slug: string;
  name: string;
  description: string;
  createdAt: string;  // ISO-8601
  updatedAt: string;  // ISO-8601
}

export class YourDomain {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(
    slug: string,
    name: string,
    description: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.slug = slug;
    this.name = name;
    this.description = description;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(input: YourDomainInput): YourDomain {
    const slug = input.slug ?? slugify(input.name, { lower: true, strict: true });
    const createdAt = input.createdAt ?? new Date();
    const updatedAt = input.updatedAt ?? createdAt;
    return new YourDomain(slug, input.name, input.description, createdAt, updatedAt);
  }

  toJSON(): YourDomainJSON {
    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
```

**Key patterns:**
- Private constructor enforces creation via `create()`
- Optional fields allow both new creation and loading from storage
- `toJSON()` uses camelCase, ISO-8601 dates

## Step 2: Create the Adapter Interface

Location: `packages/workflow/src/interfaces/<domain>-adapter.interface.ts`

```typescript
import type { YourDomain } from '../entities/<domain>.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

export type YourDomainErrorCode = 'E090' | 'E091' | 'E092'; // Reserve a range

export interface YourDomainSaveResult {
  ok: boolean;
  item?: YourDomain;
  created?: boolean;
  errorCode?: YourDomainErrorCode;
  errorMessage?: string;
}

export interface YourDomainRemoveResult {
  ok: boolean;
  errorCode?: YourDomainErrorCode;
  errorMessage?: string;
}

export interface IYourDomainAdapter {
  load(ctx: WorkspaceContext, slug: string): Promise<YourDomain>;
  save(ctx: WorkspaceContext, item: YourDomain): Promise<YourDomainSaveResult>;
  list(ctx: WorkspaceContext): Promise<YourDomain[]>;
  remove(ctx: WorkspaceContext, slug: string): Promise<YourDomainRemoveResult>;
  exists(ctx: WorkspaceContext, slug: string): Promise<boolean>;
}
```

**Key patterns:**
- All methods receive `WorkspaceContext` for storage location
- Result types for save/remove (not exceptions for control flow)
- `load()` throws if not found (caller should check `exists()` first)

## Step 3: Create Error Codes

Location: `packages/workflow/src/errors/<domain>-errors.ts`

```typescript
export const YourDomainErrorCodes = {
  NOT_FOUND: 'E090' as YourDomainErrorCode,
  ALREADY_EXISTS: 'E091' as YourDomainErrorCode,
  INVALID_DATA: 'E092' as YourDomainErrorCode,
} as const;

export class YourDomainNotFoundError extends Error {
  readonly code = YourDomainErrorCodes.NOT_FOUND;
  constructor(readonly slug: string, readonly storagePath: string) {
    super(`YourDomain '${slug}' not found`);
    this.name = 'YourDomainNotFoundError';
  }
}

// Similar for ExistsError, InvalidDataError...

export const YourDomainErrors = {
  notFound: (slug: string, path: string) => ({
    code: YourDomainErrorCodes.NOT_FOUND,
    message: `YourDomain '${slug}' not found`,
    action: 'Run: cg yourdomain list',
    path,
  }),
  // ...
};
```

**Error code allocation:** Check existing ranges in `sample-errors.ts` and `workspace-errors.ts`.

## Step 4: Implement Real Adapter

Location: `packages/workflow/src/adapters/<domain>.adapter.ts`

Extend `WorkspaceDataAdapterBase` for common functionality:

```typescript
import { WorkspaceDataAdapterBase } from './workspace-data-adapter-base.js';
import { YourDomain } from '../entities/<domain>.js';

export class YourDomainAdapter
  extends WorkspaceDataAdapterBase
  implements IYourDomainAdapter
{
  readonly domain = 'yourdomains'; // storage subdirectory

  async load(ctx: WorkspaceContext, slug: string): Promise<YourDomain> {
    const path = this.getEntityPath(ctx, slug);
    const result = await this.readJson<YourDomainJSON>(path);
    if (!result.ok || !result.data) {
      throw new YourDomainNotFoundError(slug, path);
    }
    return YourDomain.create({
      ...result.data,
      createdAt: new Date(result.data.createdAt),
      updatedAt: new Date(result.data.updatedAt),
    });
  }

  async save(ctx: WorkspaceContext, item: YourDomain): Promise<YourDomainSaveResult> {
    await this.ensureStructure(ctx);
    const path = this.getEntityPath(ctx, item.slug);
    const exists = await this.fs.exists(path);
    const json = { ...item.toJSON(), updatedAt: new Date().toISOString() };
    await this.writeJson(path, json);
    return { ok: true, item, created: !exists };
  }

  async list(ctx: WorkspaceContext): Promise<YourDomain[]> {
    const dir = this.getDomainPath(ctx);
    if (!(await this.fs.exists(dir))) return [];
    const files = await this.fs.readdir(dir);
    const items: YourDomain[] = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const result = await this.readJson<YourDomainJSON>(`${dir}/${file}`);
      if (result.ok && result.data) {
        items.push(YourDomain.create({
          ...result.data,
          createdAt: new Date(result.data.createdAt),
          updatedAt: new Date(result.data.updatedAt),
        }));
      }
    }
    return items;
  }

  // remove(), exists() similar...
}
```

**Storage location:** `<worktree>/.chainglass/data/<domain>/<slug>.json`

## Step 5: Create Fake Adapter

Location: `packages/workflow/src/fakes/fake-<domain>-adapter.ts`

Three-part API for testing:

```typescript
export class FakeYourDomainAdapter implements IYourDomainAdapter {
  // Part 1: State setup
  private items = new Map<string, Map<string, YourDomainJSON>>();

  seedItem(ctx: WorkspaceContext, item: YourDomain): void {
    const key = ctx.worktreePath;
    if (!this.items.has(key)) this.items.set(key, new Map());
    this.items.get(key)!.set(item.slug, item.toJSON());
  }

  // Part 2: Call inspection
  get saveCallCount(): number { return this._saveCount; }
  private _saveCount = 0;

  // Part 3: Error injection
  private _forceError: YourDomainErrorCode | null = null;
  forceError(code: YourDomainErrorCode | null): void {
    this._forceError = code;
  }

  // Interface implementation
  async load(ctx: WorkspaceContext, slug: string): Promise<YourDomain> {
    if (this._forceError) throw new Error(`Forced error: ${this._forceError}`);
    const data = this.items.get(ctx.worktreePath)?.get(slug);
    if (!data) throw new YourDomainNotFoundError(slug, ctx.worktreePath);
    return YourDomain.create({...data, createdAt: new Date(data.createdAt), updatedAt: new Date(data.updatedAt)});
  }

  // save(), list(), remove(), exists()...
}
```

## Step 6: Create Service Layer

Location: `packages/workflow/src/services/<domain>.service.ts`

```typescript
export interface IYourDomainService {
  add(ctx: WorkspaceContext, name: string, description: string): Promise<YourDomainAddResult>;
  list(ctx: WorkspaceContext): Promise<YourDomainListResult>;
  get(ctx: WorkspaceContext, slug: string): Promise<YourDomainInfoResult>;
  remove(ctx: WorkspaceContext, slug: string): Promise<YourDomainRemoveResult>;
}

export class YourDomainService implements IYourDomainService {
  constructor(
    private readonly adapter: IYourDomainAdapter,
    private readonly logger: ILogger
  ) {}

  async add(ctx: WorkspaceContext, name: string, description: string): Promise<YourDomainAddResult> {
    const item = YourDomain.create({ name, description });
    if (await this.adapter.exists(ctx, item.slug)) {
      return { ok: false, errorCode: 'E091', errorMessage: `Already exists: ${item.slug}` };
    }
    const result = await this.adapter.save(ctx, item);
    return { ok: result.ok, item: result.item };
  }
  // ...
}
```

## Step 7: Add DI Tokens

Location: `packages/shared/src/di-tokens.ts`

```typescript
export const WORKSPACE_DI_TOKENS = {
  // ... existing tokens ...
  YOUR_DOMAIN_ADAPTER: 'IYourDomainAdapter',
  YOUR_DOMAIN_SERVICE: 'IYourDomainService',
} as const;
```

## Step 8: Register in Containers

CLI container (`apps/cli/src/lib/container.ts`):

```typescript
container.bind(WORKSPACE_DI_TOKENS.YOUR_DOMAIN_ADAPTER).to(YourDomainAdapter);
container.bind(WORKSPACE_DI_TOKENS.YOUR_DOMAIN_SERVICE).to(YourDomainService);
```

Web container (`apps/web/src/lib/di-container.ts`): Similar pattern.

## Step 9: Write Contract Tests

Location: `test/contracts/<domain>-adapter.contract.test.ts`

```typescript
function createContractTests(
  name: string,
  createAdapter: () => IYourDomainAdapter & { seedItem?: ... }
) {
  describe(`${name} contract`, () => {
    it('save then load returns same data', async () => {
      const adapter = createAdapter();
      const item = YourDomain.create({ name: 'Test', description: 'Desc' });
      await adapter.save(ctx, item);
      const loaded = await adapter.load(ctx, item.slug);
      expect(loaded.slug).toBe(item.slug);
    });
    // More contract tests...
  });
}

// Run against both implementations
createContractTests('FakeYourDomainAdapter', () => new FakeYourDomainAdapter());
createContractTests('YourDomainAdapter', () => new YourDomainAdapter(fs, pathResolver));
```

## Checklist

- [ ] Entity with private constructor + `create()` + `toJSON()`
- [ ] Adapter interface with CRUD + Result types
- [ ] Error codes (allocate E0XX range)
- [ ] Real adapter extending `WorkspaceDataAdapterBase`
- [ ] Fake adapter with three-part API
- [ ] Service with business logic
- [ ] DI tokens in `@chainglass/shared`
- [ ] Container registrations (CLI + Web)
- [ ] Contract tests ensuring Fake-Real parity
- [ ] Export from package index files

## Reference Files

| Component | Sample Implementation |
|-----------|----------------------|
| Entity | `packages/workflow/src/entities/sample.ts` |
| Interface | `packages/workflow/src/interfaces/sample-adapter.interface.ts` |
| Errors | `packages/workflow/src/errors/sample-errors.ts` |
| Adapter | `packages/workflow/src/adapters/sample.adapter.ts` |
| Fake | `packages/workflow/src/fakes/fake-sample-adapter.ts` |
| Service | `packages/workflow/src/services/sample.service.ts` |
| Contract Tests | `test/contracts/sample-adapter.contract.test.ts` |
