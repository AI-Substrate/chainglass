'use client';

/**
 * New Worktree Form - Client Component
 *
 * Part of Plan 069: New Worktree Creation Flow - Phase 3
 *
 * Per Workshop 003: 4 page states (idle, blocking_error, created, created_with_bootstrap_error).
 * Per DYK D2: Hard navigation via window.location.assign() on success.
 * Per DYK D3: Client-side live preview via pure normalizeSlug/buildWorktreeName.
 */

import type { PreviewCreateWorktreeResult } from '@chainglass/workflow';
import { buildWorktreeName, normalizeSlug } from '@chainglass/workflow/services/worktree-name';
import { useActionState } from 'react';
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  type CreateWorktreePageState,
  createNewWorktree,
} from '../../../app/actions/workspace-actions';

// ==================== Props ====================

interface NewWorktreeFormProps {
  workspaceSlug: string;
  workspaceName: string;
  mainRepoPath: string;
  initialPreview?: PreviewCreateWorktreeResult;
}

// ==================== Submit Button ====================

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? 'Creating Worktree…' : 'Create Worktree'}
      </button>
      {pending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Creating worktree and running bootstrap hook…</span>
        </div>
      )}
    </div>
  );
}

// ==================== Main Form ====================

export function NewWorktreeForm({
  workspaceSlug,
  workspaceName,
  mainRepoPath,
  initialPreview,
}: NewWorktreeFormProps) {
  const initialState: CreateWorktreePageState = {
    kind: 'idle',
    preview: initialPreview,
  };

  const [state, formAction] = useActionState(createNewWorktree, initialState);
  const [nameInput, setNameInput] = useState(
    state.kind === 'blocking_error' ? state.fields.requestedName : ''
  );

  // Per DYK D3: Client-side live preview using pure functions
  const normalized = normalizeSlug(nameInput);
  const previewOrdinal = initialPreview?.ordinal ?? 1;
  const livePreviewName = normalized ? buildWorktreeName(previewOrdinal, normalized) : null;

  // Per DYK D2: Hard navigation on success
  useEffect(() => {
    if (state.kind === 'created') {
      window.location.assign(state.redirectTo);
    }
  }, [state]);

  // ==================== Created with Bootstrap Error ====================
  if (state.kind === 'created_with_bootstrap_error') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-3">
          <h2 className="font-semibold text-yellow-800 dark:text-yellow-200">
            Worktree created, but bootstrap failed
          </h2>
          <div className="text-sm space-y-1">
            <p>
              <span className="font-medium">Branch:</span> {state.branchName}
            </p>
            <p>
              <span className="font-medium">Path:</span> {state.worktreePath}
            </p>
          </div>
          {state.bootstrapLogTail && (
            <details className="text-sm">
              <summary className="cursor-pointer text-yellow-700 dark:text-yellow-300 hover:underline">
                Bootstrap output
              </summary>
              <pre className="mt-2 rounded bg-black/10 dark:bg-black/30 p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                {state.bootstrapLogTail}
              </pre>
            </details>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.assign(state.redirectTo)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Open Worktree Anyway
          </button>
          <span className="text-sm text-muted-foreground self-center">
            The worktree is ready — the bootstrap hook just didn't complete.
          </span>
        </div>
      </div>
    );
  }

  // ==================== Created (redirecting) ====================
  if (state.kind === 'created') {
    return (
      <div className="rounded-lg border p-4 text-center text-muted-foreground">
        <p>Worktree created. Navigating to {state.branchName}…</p>
      </div>
    );
  }

  // ==================== Form (idle + blocking_error) ====================
  const activePreview =
    state.kind === 'blocking_error' && state.preview ? state.preview : initialPreview;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />

      {/* Blocking Error Banner */}
      {state.kind === 'blocking_error' && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <h3 className="font-semibold text-destructive">Could not create worktree</h3>
          <p className="text-sm text-destructive">{state.message}</p>
          {state.logTail && (
            <pre className="mt-2 rounded bg-black/10 dark:bg-black/30 p-3 text-xs overflow-x-auto whitespace-pre-wrap">
              {state.logTail}
            </pre>
          )}
        </div>
      )}

      {/* Name Input */}
      <div className="space-y-2">
        <label htmlFor="requestedName" className="text-sm font-medium">
          Worktree name
        </label>
        <input
          id="requestedName"
          name="requestedName"
          type="text"
          placeholder="my-feature"
          required
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Enter a slug like <code>my-feature</code> or paste a full name like{' '}
          <code>069-my-feature</code>. The final name is confirmed on submit.
        </p>
      </div>

      {/* Live Preview Card */}
      {(livePreviewName || activePreview) && (
        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Preview</h3>
          <div className="text-sm space-y-1">
            <p>
              <span className="font-medium">Branch:</span>{' '}
              <code className="rounded bg-muted px-1 py-0.5">
                {livePreviewName ?? activePreview?.branchName ?? '—'}
              </code>
            </p>
            {activePreview?.worktreePath && (
              <p>
                <span className="font-medium">Path:</span>{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {activePreview.worktreePath}
                </code>
              </p>
            )}
            {activePreview?.hasBootstrapHook && (
              <p className="text-xs text-muted-foreground">
                ⚙️ A bootstrap hook will run after creation
              </p>
            )}
          </div>
        </div>
      )}

      {/* Advanced Details */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
          Advanced details
        </summary>
        <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="font-medium">Workspace:</span> {workspaceName}
          </p>
          <p>
            <span className="font-medium">Main repo:</span> {mainRepoPath}
          </p>
          <p>
            <span className="font-medium">Base branch:</span> main
          </p>
          <p>
            <span className="font-medium">Hook:</span>{' '}
            {activePreview?.hasBootstrapHook
              ? '.chainglass/new-worktree.sh detected'
              : 'None detected'}
          </p>
        </div>
      </details>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <a
          href={`/workspaces/${workspaceSlug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
