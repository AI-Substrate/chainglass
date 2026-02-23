/**
 * WorkspaceCard — Landing page card for a single workspace.
 *
 * Server Component (no 'use client'). Star toggle via <form action>.
 * Accent color rendered as left border. Fallback avatar when emoji empty.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 * DYK-P3-02: Server Component with progressive enhancement
 * DYK-P3-05: Fallback first-letter avatar
 * DYK-P3-01: Agent summary optional
 */

import { workspaceHref } from '@/lib/workspace-url';
import type { WorkspacePreferences } from '@chainglass/workflow';
import { WORKSPACE_COLOR_PALETTE } from '@chainglass/workflow';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { toggleWorkspaceStar } from '../../../../app/actions/workspace-actions';

export interface WorkspaceCardProps {
  slug: string;
  name: string;
  path: string;
  preferences: WorkspacePreferences;
  worktreeCount: number;
  worktreeNames?: string[];
  agentSummary?: { running: number; attention: number };
}

function getColorHex(colorName: string): string | undefined {
  const entry = WORKSPACE_COLOR_PALETTE.find((c) => c.name === colorName);
  return entry?.light;
}

export function WorkspaceCard({
  slug,
  name,
  path,
  preferences,
  worktreeCount,
  worktreeNames,
  agentSummary,
}: WorkspaceCardProps) {
  const emoji = preferences.emoji;
  const colorHex = getColorHex(preferences.color);
  const href = workspaceHref(slug, '');

  const borderStyle = colorHex ? { borderLeftColor: colorHex, borderLeftWidth: '4px' } : undefined;

  return (
    <div className="relative" style={borderStyle}>
      <Link
        href={href}
        className="block rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-lg hover:bg-accent hover:border-primary/40 cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              {emoji || (
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div>
              <h3 className="font-semibold">{name}</h3>
              <p className="text-xs text-muted-foreground">
                {worktreeCount <= 3 && worktreeNames?.length
                  ? worktreeNames.join(' · ')
                  : `${worktreeCount} worktrees`}
              </p>
            </div>
          </div>
        </div>

        {agentSummary && (agentSummary.running > 0 || agentSummary.attention > 0) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {agentSummary.running > 0 && (
              <span className="text-muted-foreground">
                {agentSummary.running} agent{agentSummary.running === 1 ? '' : 's'} running
              </span>
            )}
            {agentSummary.attention > 0 && <span className="text-amber-500">◆</span>}
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">{path}</p>
      </Link>

      <form action={toggleWorkspaceStar} className="absolute right-3 top-3 z-10">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="starred" value={preferences.starred ? 'false' : 'true'} />
        <button
          type="submit"
          className="rounded p-1 text-muted-foreground hover:text-yellow-500"
          aria-label={preferences.starred ? 'Unstar workspace' : 'Star workspace'}
        >
          <Star
            className={`h-4 w-4 ${preferences.starred ? 'fill-yellow-500 text-yellow-500' : ''}`}
          />
        </button>
      </form>
    </div>
  );
}
