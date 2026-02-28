'use client';

/**
 * WorkspaceAddForm - Form for adding new workspaces.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Uses Server Actions with useActionState for form handling.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ActionState, addWorkspace } from '../../../app/actions/workspace-actions';

const initialState: ActionState = {
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Adding...' : 'Add Workspace'}
    </Button>
  );
}

export function WorkspaceAddForm() {
  const [state, formAction] = useActionState(addWorkspace, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            placeholder="My Project"
            required
            defaultValue={state.fields?.name ?? ''}
            key={`name-${state.success}`}
            aria-describedby={state.errors?.name ? 'name-error' : undefined}
          />
          {state.errors?.name && (
            <p id="name-error" className="text-sm text-destructive">
              {state.errors.name[0]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="path">Path</Label>
          <Input
            id="path"
            name="path"
            placeholder="/home/user/project"
            required
            defaultValue={state.fields?.path ?? ''}
            key={`path-${state.success}`}
            aria-describedby={state.errors?.path ? 'path-error' : undefined}
          />
          {state.errors?.path && (
            <p id="path-error" className="text-sm text-destructive">
              {state.errors.path[0]}
            </p>
          )}
        </div>
      </div>

      {state.errors?._form && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.errors._form.map((error, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Error messages have no unique ID
            <p key={i}>{error}</p>
          ))}
        </div>
      )}

      {state.success && state.message && (
        <div className="rounded-md bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-400">
          {state.message}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
