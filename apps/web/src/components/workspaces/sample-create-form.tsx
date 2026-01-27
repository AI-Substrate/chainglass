'use client';

/**
 * SampleCreateForm - Form for creating new samples.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Uses Server Actions with useActionState for form handling.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ActionState, addSample } from '../../../app/actions/workspace-actions';

interface SampleCreateFormProps {
  workspaceSlug: string;
  worktreePath: string;
}

const initialState: ActionState = {
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Adding...' : 'Add Sample'}
    </Button>
  );
}

export function SampleCreateForm({ workspaceSlug, worktreePath }: SampleCreateFormProps) {
  const [state, formAction] = useActionState(addSample, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <input type="hidden" name="worktreePath" value={worktreePath} />

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="My Sample"
          required
          aria-describedby={state.errors?.name ? 'name-error' : undefined}
        />
        {state.errors?.name && (
          <p id="name-error" className="text-sm text-destructive">
            {state.errors.name[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="A brief description of this sample..."
          rows={3}
          aria-describedby={state.errors?.description ? 'description-error' : undefined}
        />
        {state.errors?.description && (
          <p id="description-error" className="text-sm text-destructive">
            {state.errors.description[0]}
          </p>
        )}
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
