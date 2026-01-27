# Workshop: Next.js Server Actions for Form Mutations

**Type**: Integration Pattern
**Plan**: 014-workspaces
**Spec**: [workspaces-spec.md](../workspaces-spec.md)
**Created**: 2026-01-27
**Status**: Draft

**Related Documents**:
- [Phase 6 Tasks & Alignment Brief](../tasks/phase-6-web-ui/tasks.md)
- [CLI Command Flows Workshop](./cli-command-flows.md)
- [Next.js Server Actions Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

---

## Purpose

This workshop defines the **complete pattern** for using Next.js 16 Server Actions with React 19 hooks for all form mutations in the workspaces feature. It provides a practical reference for implementing create/update/delete operations without API routes, using `useActionState`, `useFormStatus`, Zod validation, and cache revalidation.

**What this clarifies**: How to replace traditional API route mutations (POST/DELETE) with Server Actions, gaining simpler code, better progressive enhancement, and cleaner separation of concerns.

**What decisions this drives**: Architecture for all mutations in Phase 6 (workspace add/remove, sample add/delete), testing approach, error handling patterns.

## Key Questions Addressed

1. **What are Server Actions and why use them instead of API routes for mutations?**
2. **How do Server Actions integrate with React 19 `useActionState` and `useFormStatus`?**
3. **What's the exact pattern for workspace/sample CRUD with Server Actions?**
4. **How do we handle validation, errors, and success states?**
5. **How does `revalidatePath()` trigger UI updates after mutations?**
6. **How do we test Server Actions compared to API routes?**
7. **What does a before/after comparison look like?**

---

## What Are Server Actions?

### Definition

**Server Actions** are asynchronous server-side functions that can be called directly from React components. Introduced in Next.js 13.4, fully stabilized in Next.js 15, and enhanced in Next.js 16 with React 19.

```typescript
// apps/web/app/actions/workspace-actions.ts
'use server'; // <-- This directive marks the file as Server Actions

import { revalidatePath } from 'next/cache';

export async function addWorkspace(prevState: any, formData: FormData) {
  // This runs on the server only, never in the browser
  const name = formData.get('name') as string;
  const path = formData.get('path') as string;
  
  // ... service call, validation, etc.
  
  revalidatePath('/workspaces'); // <-- Triggers UI update
  return { success: true, workspace };
}
```

### Server Actions vs API Routes

| Aspect | API Routes (Traditional) | Server Actions (Modern) |
|--------|--------------------------|-------------------------|
| **File Location** | `app/api/workspaces/route.ts` | `app/actions/workspace-actions.ts` |
| **Client Code** | `fetch('/api/workspaces', { method: 'POST', body: JSON.stringify(data) })` | `<form action={addWorkspace}>` or `useActionState(addWorkspace)` |
| **Validation** | Manual in route handler | Zod schema in action |
| **Error Handling** | HTTP status codes + JSON | Return value with `success` field |
| **Cache Invalidation** | Manual `revalidatePath()` call | Built-in via action |
| **Progressive Enhancement** | Requires JavaScript | Works without JavaScript |
| **Type Safety** | Separate types for request/response | Single function signature |
| **Testing** | HTTP mocking (supertest, etc.) | Direct function call |
| **Bundle Size** | Client + server code | Server-only |

### Why Server Actions for This Feature?

**Decision Context (DYK-P6-05)**:
- GET routes remain as API routes (sidebar data fetching)
- All mutations (POST/DELETE) use Server Actions
- Simpler code, better DX, progressive enhancement

**Benefits**:
1. **Simpler**: No need to define API route, request/response types, fetch logic
2. **Type-safe**: TypeScript inference works end-to-end
3. **Better UX**: Form works without JS (progressive enhancement)
4. **Easier testing**: Call action directly in tests (no HTTP mocking)
5. **Built-in revalidation**: `revalidatePath()` triggers Next.js cache invalidation

---

## React 19 Hooks Integration

### `useActionState` Hook

**Purpose**: Manage form state and handle Server Action responses.

**Signature**:
```typescript
const [state, formAction, isPending] = useActionState(serverAction, initialState);
```

**Example**:
```typescript
'use client';

import { useActionState } from 'react';
import { addWorkspace } from '@/app/actions/workspace-actions';

export function WorkspaceAddForm() {
  const initialState = { success: false, errors: {} };
  const [state, formAction, isPending] = useActionState(addWorkspace, initialState);

  return (
    <form action={formAction}>
      <input name="name" required />
      <input name="path" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Adding...' : 'Add Workspace'}
      </button>
      {state.success && <p>Workspace added!</p>}
      {state.errors?.name && <p className="error">{state.errors.name}</p>}
    </form>
  );
}
```

**Key Points**:
- `state`: Current state returned by the action (success, errors, data)
- `formAction`: Wrapped action to pass to form's `action` prop
- `isPending`: Boolean indicating if action is running
- Server Action receives `(prevState, formData)` as arguments

### `useFormStatus` Hook

**Purpose**: Access form submission state from child components (for pending state).

**Signature**:
```typescript
const { pending, data, method, action } = useFormStatus();
```

**Example**:
```typescript
'use client';

import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Adding...' : 'Add Workspace'}
    </button>
  );
}

export function WorkspaceAddForm() {
  return (
    <form action={addWorkspace}>
      <input name="name" required />
      <input name="path" required />
      <SubmitButton /> {/* Child component uses useFormStatus */}
    </form>
  );
}
```

**Key Points**:
- Must be used in a component that's a child of `<form>`
- Cannot be used in the same component as the form
- `pending` is `true` during action execution
- Useful for disabling submit buttons, showing spinners

---

## Pattern 1: Add Workspace (Server Action)

### Server Action Implementation

```typescript
// apps/web/app/actions/workspace-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { container } from '@/lib/di-container';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';

// 1. Define Zod schema for validation
const addWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  path: z.string().min(1, 'Path is required'),
});

// 2. Define state type for useActionState
export type AddWorkspaceState = {
  success: boolean;
  workspace?: {
    slug: string;
    name: string;
    path: string;
  };
  errors?: {
    name?: string;
    path?: string;
    _form?: string;
  };
};

// 3. Server Action function
export async function addWorkspace(
  prevState: AddWorkspaceState,
  formData: FormData
): Promise<AddWorkspaceState> {
  // Parse form data
  const rawData = {
    name: formData.get('name'),
    path: formData.get('path'),
  };

  // Validate with Zod
  const validated = addWorkspaceSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors as any,
    };
  }

  // Resolve service from DI container
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  // Call service
  const result = await workspaceService.add(
    validated.data.name,
    validated.data.path
  );

  // Handle service result
  if (!result.success) {
    return {
      success: false,
      errors: {
        _form: result.errors?.[0]?.message || 'Failed to add workspace',
      },
    };
  }

  // Revalidate cache to trigger UI update
  revalidatePath('/workspaces');
  
  return {
    success: true,
    workspace: {
      slug: result.data.slug,
      name: result.data.name,
      path: result.data.path,
    },
  };
}
```

### Form Component

```typescript
// apps/web/src/components/workspaces/workspace-add-form.tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addWorkspace } from '@/app/actions/workspace-actions';
import type { AddWorkspaceState } from '@/app/actions/workspace-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
    >
      {pending ? 'Adding...' : 'Add Workspace'}
    </button>
  );
}

export function WorkspaceAddForm() {
  const initialState: AddWorkspaceState = { success: false };
  const [state, formAction, isPending] = useActionState(addWorkspace, initialState);

  return (
    <div className="max-w-md">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Workspace Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
            placeholder="My Project"
          />
          {state.errors?.name && (
            <p className="mt-1 text-sm text-red-600">{state.errors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="path" className="block text-sm font-medium">
            Folder Path
          </label>
          <input
            id="path"
            name="path"
            type="text"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
            placeholder="/home/user/my-project"
          />
          {state.errors?.path && (
            <p className="mt-1 text-sm text-red-600">{state.errors.path}</p>
          )}
        </div>

        {state.errors?._form && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">
            {state.errors._form}
          </div>
        )}

        {state.success && (
          <div className="rounded bg-green-50 p-3 text-sm text-green-700">
            Workspace "{state.workspace?.name}" added successfully!
          </div>
        )}

        <SubmitButton />
      </form>
    </div>
  );
}
```

---

## Pattern 2: Delete Sample (Server Action with Confirmation)

### Server Action Implementation

```typescript
// apps/web/app/actions/workspace-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { container } from '@/lib/di-container';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { ISampleService, IWorkspaceService } from '@chainglass/workflow';

export type DeleteSampleState = {
  success: boolean;
  errors?: {
    _form?: string;
  };
};

export async function deleteSample(
  workspaceSlug: string,
  worktreePath: string,
  sampleSlug: string,
  prevState: DeleteSampleState
): Promise<DeleteSampleState> {
  // Resolve services
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sampleService = container.resolve<ISampleService>(
    WORKSPACE_DI_TOKENS.SAMPLE_SERVICE
  );

  // Build WorkspaceContext
  const contextResult = await workspaceService.resolveContextFromParams(
    workspaceSlug,
    worktreePath
  );

  if (!contextResult.success) {
    return {
      success: false,
      errors: {
        _form: 'Failed to resolve workspace context',
      },
    };
  }

  // Delete sample
  const result = await sampleService.delete(contextResult.data, sampleSlug);

  if (!result.success) {
    return {
      success: false,
      errors: {
        _form: result.errors?.[0]?.message || 'Failed to delete sample',
      },
    };
  }

  // Revalidate to update UI
  revalidatePath(`/workspaces/${workspaceSlug}/samples`);
  
  return { success: true };
}
```

### Delete Button Component with Confirmation

```typescript
// apps/web/src/components/workspaces/sample-delete-button.tsx
'use client';

import { useActionState, useTransition } from 'react';
import { deleteSample } from '@/app/actions/workspace-actions';
import type { DeleteSampleState } from '@/app/actions/workspace-actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

type Props = {
  workspaceSlug: string;
  worktreePath: string;
  sampleSlug: string;
  sampleName: string;
};

export function SampleDeleteButton({
  workspaceSlug,
  worktreePath,
  sampleSlug,
  sampleName,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const initialState: DeleteSampleState = { success: false };
  
  // Bind action with workspace/sample context
  const boundAction = deleteSample.bind(null, workspaceSlug, worktreePath, sampleSlug);
  const [state, formAction] = useActionState(boundAction, initialState);

  const handleConfirm = () => {
    startTransition(() => {
      const formData = new FormData();
      formAction(formData);
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
          disabled={isPending}
        >
          <Trash2 className="h-4 w-4" />
          {isPending ? 'Deleting...' : 'Delete'}
        </button>
      </AlertDialogTrigger>
      
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Sample</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{sampleName}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {state.errors?._form && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">
            {state.errors._form}
          </div>
        )}
        
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700"
            disabled={isPending}
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

## Pattern 3: Add Sample (Server Action with Context)

### Server Action Implementation

```typescript
// apps/web/app/actions/workspace-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { container } from '@/lib/di-container';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { ISampleService, IWorkspaceService } from '@chainglass/workflow';

const addSampleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  content: z.string().min(1, 'Content is required'),
  workspaceSlug: z.string(),
  worktreePath: z.string(),
});

export type AddSampleState = {
  success: boolean;
  sample?: {
    slug: string;
    name: string;
  };
  errors?: {
    name?: string;
    content?: string;
    _form?: string;
  };
};

export async function addSample(
  prevState: AddSampleState,
  formData: FormData
): Promise<AddSampleState> {
  // Parse and validate
  const rawData = {
    name: formData.get('name'),
    content: formData.get('content'),
    workspaceSlug: formData.get('workspaceSlug'),
    worktreePath: formData.get('worktreePath'),
  };

  const validated = addSampleSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors as any,
    };
  }

  // Resolve services
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sampleService = container.resolve<ISampleService>(
    WORKSPACE_DI_TOKENS.SAMPLE_SERVICE
  );

  // Build context
  const contextResult = await workspaceService.resolveContextFromParams(
    validated.data.workspaceSlug,
    validated.data.worktreePath
  );

  if (!contextResult.success) {
    return {
      success: false,
      errors: { _form: 'Failed to resolve workspace context' },
    };
  }

  // Add sample
  const result = await sampleService.add(
    contextResult.data,
    validated.data.name,
    validated.data.content
  );

  if (!result.success) {
    return {
      success: false,
      errors: {
        _form: result.errors?.[0]?.message || 'Failed to add sample',
      },
    };
  }

  // Revalidate
  revalidatePath(`/workspaces/${validated.data.workspaceSlug}/samples`);
  
  return {
    success: true,
    sample: {
      slug: result.data.slug,
      name: result.data.name,
    },
  };
}
```

### Form Component

```typescript
// apps/web/src/components/workspaces/sample-create-form.tsx
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { addSample } from '@/app/actions/workspace-actions';
import type { AddSampleState } from '@/app/actions/workspace-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
    >
      {pending ? 'Creating...' : 'Create Sample'}
    </button>
  );
}

type Props = {
  workspaceSlug: string;
  worktreePath: string;
};

export function SampleCreateForm({ workspaceSlug, worktreePath }: Props) {
  const initialState: AddSampleState = { success: false };
  const [state, formAction] = useActionState(addSample, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form on success
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {/* Hidden fields for context */}
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <input type="hidden" name="worktreePath" value={worktreePath} />

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Sample Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="mt-1 block w-full rounded border px-3 py-2"
          placeholder="My Sample"
        />
        {state.errors?.name && (
          <p className="mt-1 text-sm text-red-600">{state.errors.name}</p>
        )}
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={4}
          className="mt-1 block w-full rounded border px-3 py-2"
          placeholder="Sample content..."
        />
        {state.errors?.content && (
          <p className="mt-1 text-sm text-red-600">{state.errors.content}</p>
        )}
      </div>

      {state.errors?._form && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">
          {state.errors._form}
        </div>
      )}

      {state.success && (
        <div className="rounded bg-green-50 p-3 text-sm text-green-700">
          Sample "{state.sample?.name}" created successfully!
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
```

---

## Cache Revalidation with `revalidatePath` and `revalidateTag`

### `revalidatePath()`

**Purpose**: Invalidate Next.js cache for a specific path, triggering re-fetch on next visit.

**Usage**:
```typescript
import { revalidatePath } from 'next/cache';

// Revalidate single page
revalidatePath('/workspaces');

// Revalidate with layout
revalidatePath('/workspaces', 'layout');

// Revalidate dynamic route
revalidatePath(`/workspaces/${slug}/samples`);
```

**When to use**:
- After mutations that affect a specific page
- Want to update Server Components on the page
- Simpler than tags when path is known

### `revalidateTag()`

**Purpose**: Invalidate cache for all requests tagged with a specific tag.

**Usage**:
```typescript
// In Server Action
import { revalidateTag } from 'next/cache';

export async function addWorkspace(/* ... */) {
  // ... mutation logic
  
  revalidateTag('workspaces-list');
  return { success: true };
}

// In API Route or Server Component
export async function GET() {
  const workspaces = await fetchWorkspaces();
  
  return new Response(JSON.stringify(workspaces), {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
    // Tag the response
    next: { tags: ['workspaces-list'] },
  });
}
```

**When to use**:
- Multiple pages depend on the same data
- Want granular cache control
- Don't know exact paths to revalidate

### Our Pattern (Path-Based)

**Decision**: Use `revalidatePath()` for all mutations in this feature.

**Rationale**:
- Simpler - we know exact paths to revalidate
- Sufficient for workspace/sample CRUD
- Tags add complexity without clear benefit here

**Examples**:
```typescript
// After adding workspace
revalidatePath('/workspaces');

// After removing workspace
revalidatePath('/workspaces');
revalidatePath(`/workspaces/${slug}`); // Detail page

// After sample mutation
revalidatePath(`/workspaces/${workspaceSlug}/samples`);
```

---

## Error Handling Patterns

### Validation Errors (Zod)

```typescript
const validated = addWorkspaceSchema.safeParse(rawData);
if (!validated.success) {
  return {
    success: false,
    errors: validated.error.flatten().fieldErrors,
  };
}
```

**Display in UI**:
```typescript
{state.errors?.name && (
  <p className="mt-1 text-sm text-red-600">{state.errors.name}</p>
)}
```

### Service Errors (Result Type)

```typescript
const result = await workspaceService.add(name, path);

if (!result.success) {
  return {
    success: false,
    errors: {
      _form: result.errors?.[0]?.message || 'Operation failed',
    },
  };
}
```

**Display in UI**:
```typescript
{state.errors?._form && (
  <div className="rounded bg-red-50 p-3 text-sm text-red-700">
    {state.errors._form}
  </div>
)}
```

### Error State Type Pattern

```typescript
export type ActionState = {
  success: boolean;
  data?: T;
  errors?: {
    [field: string]: string | string[]; // Field-specific errors
    _form?: string; // General error
  };
};
```

**Benefits**:
- Field errors: `errors.name`, `errors.path`
- Form-level errors: `errors._form`
- Success state: `success` boolean + optional `data`

---

## Testing Server Actions

### Direct Function Call (No HTTP Mocking)

**Old Way (API Route)**:
```typescript
// ❌ Complex - requires HTTP mocking
import request from 'supertest';
import { app } from '@/app';

test('adds workspace', async () => {
  const response = await request(app)
    .post('/api/workspaces')
    .send({ name: 'Test', path: '/tmp/test' })
    .expect(201);
  
  expect(response.body.workspace.slug).toBe('test');
});
```

**New Way (Server Action)**:
```typescript
// ✅ Simple - direct function call
import { addWorkspace } from '@/app/actions/workspace-actions';
import type { AddWorkspaceState } from '@/app/actions/workspace-actions';

test('adds workspace', async () => {
  const formData = new FormData();
  formData.set('name', 'Test');
  formData.set('path', '/tmp/test');
  
  const initialState: AddWorkspaceState = { success: false };
  const result = await addWorkspace(initialState, formData);
  
  expect(result.success).toBe(true);
  expect(result.workspace?.slug).toBe('test');
});
```

### Testing with Fakes

```typescript
import { container } from 'tsyringe';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import { FakeWorkspaceRegistryAdapter } from '@chainglass/workflow/fakes';
import { addWorkspace } from '@/app/actions/workspace-actions';

describe('addWorkspace Server Action', () => {
  beforeEach(() => {
    // Create child container with fakes
    const childContainer = container.createChildContainer();
    childContainer.register(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER, {
      useValue: new FakeWorkspaceRegistryAdapter(),
    });
    // ... register other dependencies
  });

  test('validates required fields', async () => {
    const formData = new FormData();
    formData.set('name', ''); // Invalid
    formData.set('path', '/tmp/test');
    
    const result = await addWorkspace({ success: false }, formData);
    
    expect(result.success).toBe(false);
    expect(result.errors?.name).toBeDefined();
  });

  test('creates workspace successfully', async () => {
    const formData = new FormData();
    formData.set('name', 'Test Workspace');
    formData.set('path', '/tmp/test');
    
    const result = await addWorkspace({ success: false }, formData);
    
    expect(result.success).toBe(true);
    expect(result.workspace?.slug).toBe('test-workspace');
  });

  test('handles service errors', async () => {
    const formData = new FormData();
    formData.set('name', 'Test');
    formData.set('path', '/invalid/../path'); // Invalid path
    
    const result = await addWorkspace({ success: false }, formData);
    
    expect(result.success).toBe(false);
    expect(result.errors?._form).toContain('path');
  });
});
```

### Component Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceAddForm } from '@/components/workspaces/workspace-add-form';
import { addWorkspace } from '@/app/actions/workspace-actions';

// Mock the Server Action
vi.mock('@/app/actions/workspace-actions', () => ({
  addWorkspace: vi.fn(),
}));

test('renders form and submits', async () => {
  (addWorkspace as any).mockResolvedValue({
    success: true,
    workspace: { slug: 'test', name: 'Test', path: '/tmp/test' },
  });

  render(<WorkspaceAddForm />);
  
  fireEvent.change(screen.getByLabelText('Workspace Name'), {
    target: { value: 'Test' },
  });
  fireEvent.change(screen.getByLabelText('Folder Path'), {
    target: { value: '/tmp/test' },
  });
  
  fireEvent.click(screen.getByText('Add Workspace'));
  
  await waitFor(() => {
    expect(screen.getByText(/added successfully/i)).toBeInTheDocument();
  });
});
```

---

## Before/After Comparison

### Scenario: Add Workspace Form

#### Before (API Route Approach)

**API Route**:
```typescript
// apps/web/app/api/workspaces/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const addWorkspaceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = addWorkspaceSchema.parse(body);
    
    const workspaceService = container.resolve(/* ... */);
    const result = await workspaceService.add(validated.name, validated.path);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.errors?.[0]?.message },
        { status: 400 }
      );
    }
    
    revalidatePath('/workspaces');
    return NextResponse.json({ workspace: result.data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ errors: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**Client Component**:
```typescript
// apps/web/src/components/workspaces/workspace-add-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function WorkspaceAddForm() {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Failed to add workspace');
        return;
      }
      
      setName('');
      setPath('');
      router.refresh();
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Adding...' : 'Add Workspace'}
      </button>
    </form>
  );
}
```

**Lines of Code**: ~80 lines (route + component)

---

#### After (Server Action Approach)

**Server Action**:
```typescript
// apps/web/app/actions/workspace-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const addWorkspaceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

export async function addWorkspace(prevState: any, formData: FormData) {
  const validated = addWorkspaceSchema.safeParse({
    name: formData.get('name'),
    path: formData.get('path'),
  });
  
  if (!validated.success) {
    return { success: false, errors: validated.error.flatten().fieldErrors };
  }
  
  const workspaceService = container.resolve(/* ... */);
  const result = await workspaceService.add(validated.data.name, validated.data.path);
  
  if (!result.success) {
    return { success: false, errors: { _form: result.errors?.[0]?.message } };
  }
  
  revalidatePath('/workspaces');
  return { success: true, workspace: result.data };
}
```

**Client Component**:
```typescript
// apps/web/src/components/workspaces/workspace-add-form.tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addWorkspace } from '@/app/actions/workspace-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Adding...' : 'Add Workspace'}
    </button>
  );
}

export function WorkspaceAddForm() {
  const [state, formAction] = useActionState(addWorkspace, { success: false });

  return (
    <form action={formAction}>
      <input name="name" required />
      {state.errors?.name && <p className="error">{state.errors.name}</p>}
      
      <input name="path" required />
      {state.errors?.path && <p className="error">{state.errors.path}</p>}
      
      {state.errors?._form && <p className="error">{state.errors._form}</p>}
      {state.success && <p className="success">Workspace added!</p>}
      
      <SubmitButton />
    </form>
  );
}
```

**Lines of Code**: ~45 lines (action + component)

---

### Comparison Summary

| Aspect | API Route | Server Action | Improvement |
|--------|-----------|---------------|-------------|
| **Lines of Code** | ~80 | ~45 | 44% reduction |
| **Files** | 2 (route + component) | 2 (action + component) | Same |
| **HTTP Layer** | Manual fetch, status codes | Automatic | Simpler |
| **Error Handling** | Try/catch + response.ok checks | Return value | Cleaner |
| **Loading State** | Manual useState | useFormStatus hook | Built-in |
| **Form Reset** | Manual state updates | Auto-reset or ref | Easier |
| **Revalidation** | Manual router.refresh() | Built-in revalidatePath() | Automatic |
| **Progressive Enhancement** | No | Yes | Better UX |
| **Type Safety** | Separate request/response types | Single function | Stronger |
| **Testing** | HTTP mocking required | Direct function call | Much easier |

---

## Quick Reference

### Server Action File Structure

```
apps/web/
├── app/
│   ├── actions/
│   │   ├── workspace-actions.ts  ← All workspace/sample Server Actions
│   │   └── ...
│   ├── api/
│   │   ├── workspaces/
│   │   │   └── route.ts          ← GET only (list, ?include=worktrees)
│   │   └── ...
│   └── (dashboard)/
│       └── workspaces/
│           └── page.tsx           ← Uses Server Actions
└── src/
    └── components/
        └── workspaces/
            ├── workspace-add-form.tsx       ← useActionState
            ├── sample-create-form.tsx       ← useActionState
            └── sample-delete-button.tsx     ← useActionState + AlertDialog
```

### Action Naming Convention

```typescript
// Verb-first, entity-last
export async function addWorkspace(...)
export async function removeWorkspace(...)
export async function addSample(...)
export async function deleteSample(...)
```

### State Type Template

```typescript
export type ActionNameState = {
  success: boolean;
  data?: YourDataType;
  errors?: {
    fieldName?: string;
    anotherField?: string;
    _form?: string; // General error
  };
};
```

### Form Pattern Template

```typescript
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { yourAction } from '@/app/actions/...';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>...</button>;
}

export function YourForm() {
  const [state, formAction] = useActionState(yourAction, { success: false });
  
  return (
    <form action={formAction}>
      <input name="field" />
      {state.errors?.field && <p>{state.errors.field}</p>}
      {state.success && <p>Success!</p>}
      <SubmitButton />
    </form>
  );
}
```

### Revalidation Quick Reference

```typescript
// After mutation in Server Action
revalidatePath('/workspaces');                    // List page
revalidatePath(`/workspaces/${slug}`);            // Detail page
revalidatePath(`/workspaces/${slug}/samples`);    // Samples page

// With layout option (revalidates entire layout tree)
revalidatePath('/workspaces', 'layout');
```

---

## Open Questions

### Q1: Should we use optimistic updates for better UX?

**STATUS**: OPEN

**Options**:
- **Option A**: Use `useOptimistic` hook for instant UI feedback before server confirms
- **Option B**: Stick with standard `useActionState` flow (current approach)

**Considerations**:
- Optimistic updates add complexity
- Need rollback logic if server action fails
- Best for high-latency scenarios (ours is local file I/O, fast)

**Recommendation**: Start with standard flow (Option B), add optimistic updates later if UX feedback indicates need.

---

### Q2: Should we extract reusable form components?

**STATUS**: OPEN

**Options**:
- **Option A**: Extract `<FormField>`, `<FormError>`, `<FormSuccess>` components
- **Option B**: Keep inline in each form (current approach)

**Trade-offs**:
- Option A: More abstraction, DRY
- Option B: More explicit, easier to customize

**Recommendation**: Start with Option B (inline), extract if 3+ forms share identical patterns.

---

### Q3: How to handle long-running actions (e.g., git operations)?

**STATUS**: RESOLVED

**Decision**: Use loading states via `useFormStatus` and `isPending`.

**Rationale**:
- Git worktree detection is fast (< 1s typically)
- File I/O operations are fast (local disk)
- No need for background jobs or streaming responses
- Standard pending state is sufficient

---

## Summary

**Key Decisions**:
1. ✅ Use Server Actions for all mutations (POST/DELETE)
2. ✅ Keep GET routes as API routes (data fetching)
3. ✅ Use `useActionState` + `useFormStatus` for forms
4. ✅ Zod validation in actions
5. ✅ `revalidatePath()` for cache invalidation (not tags)
6. ✅ Test actions with direct function calls (no HTTP mocking)

**Benefits Achieved**:
- 44% reduction in code
- Simpler error handling
- Built-in progressive enhancement
- Easier testing
- Better type safety

**Next Steps**:
- Implement T004 (Server Actions) in Phase 6
- Update form components to use patterns from this workshop
- Write tests following direct-call pattern
- Validate revalidation behavior works as expected

**References**:
- [Next.js Server Actions Docs](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [React useActionState Hook](https://react.dev/reference/react/useActionState)
- [React useFormStatus Hook](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [Phase 6 Tasks](../tasks/phase-6-web-ui/tasks.md)
