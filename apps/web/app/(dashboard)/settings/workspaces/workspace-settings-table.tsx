'use client';

/**
 * WorkspaceSettingsTable — Client table for workspace preference management.
 *
 * Inline emoji/color editing via popover pickers.
 * Star toggle + remove button per workspace.
 *
 * Phase 5: Attention System — Plan 041
 */

import { ColorPicker } from '@/features/041-file-browser/components/color-picker';
import { EmojiPicker } from '@/features/041-file-browser/components/emoji-picker';
import { Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  removeWorkspace,
  toggleWorkspaceStar,
  updateWorkspacePreferences,
} from '../../../actions/workspace-actions';
import type { ActionState } from '../../../actions/workspace-actions';

interface WorkspaceItem {
  slug: string;
  name: string;
  path: string;
  emoji: string;
  color: string;
  starred: boolean;
}

interface Props {
  workspaces: WorkspaceItem[];
}

export function WorkspaceSettingsTable({ workspaces }: Props) {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-sm">
            <th className="px-4 py-3 font-medium">Emoji</th>
            <th className="px-4 py-3 font-medium">Color</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Path</th>
            <th className="px-4 py-3 font-medium text-center">Star</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {workspaces.map((ws) => (
            <WorkspaceRow key={ws.slug} workspace={ws} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceRow({ workspace }: { workspace: WorkspaceItem }) {
  const router = useRouter();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handlePreferenceUpdate = async (field: string, value: string) => {
    const formData = new FormData();
    formData.set('slug', workspace.slug);
    formData.set(field, value);

    const initialState: ActionState = { success: false, errors: {} };
    const result = await updateWorkspacePreferences(initialState, formData);

    if (result.success) {
      toast.success(`Updated ${field}`);
      router.refresh();
    } else {
      toast.error(result.errors?._form?.[0] ?? `Failed to update ${field}`);
    }
  };

  const handleStarToggle = async () => {
    const formData = new FormData();
    formData.set('slug', workspace.slug);
    formData.set('action', workspace.starred ? 'unstar' : 'star');
    await toggleWorkspaceStar(formData);
    router.refresh();
  };

  const handleRemove = async () => {
    if (!confirm(`Remove workspace "${workspace.name}"? This cannot be undone.`)) return;
    setRemoving(true);

    const formData = new FormData();
    formData.set('slug', workspace.slug);

    const initialState: ActionState = { success: false, errors: {} };
    const result = await removeWorkspace(initialState, formData);

    if (result.success) {
      toast.success(`Removed ${workspace.name}`);
      router.refresh();
    } else {
      toast.error(result.errors?._form?.[0] ?? 'Failed to remove workspace');
      setRemoving(false);
    }
  };

  return (
    <tr className="hover:bg-muted/30">
      {/* Emoji cell — clickable to open picker */}
      <td className="relative px-4 py-3">
        <button
          type="button"
          onClick={() => setEmojiOpen((p) => !p)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-muted"
          aria-label={`Change emoji for ${workspace.name}`}
        >
          {workspace.emoji || '·'}
        </button>
        {emojiOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border bg-popover p-3 shadow-lg">
            <EmojiPicker
              current={workspace.emoji}
              onSelect={(emoji) => {
                setEmojiOpen(false);
                handlePreferenceUpdate('emoji', emoji);
              }}
            />
          </div>
        )}
      </td>

      {/* Color cell — clickable to open picker */}
      <td className="relative px-4 py-3">
        <button
          type="button"
          onClick={() => setColorOpen((p) => !p)}
          className="h-6 w-6 rounded-full border-2 border-muted hover:scale-110"
          style={{ backgroundColor: workspace.color ? undefined : '#94a3b8' }}
          aria-label={`Change color for ${workspace.name}`}
        >
          {workspace.color && (
            <span className="block h-full w-full rounded-full" data-color={workspace.color} />
          )}
        </button>
        {colorOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border bg-popover p-3 shadow-lg">
            <ColorPicker
              current={workspace.color}
              onSelect={(color) => {
                setColorOpen(false);
                handlePreferenceUpdate('color', color);
              }}
            />
          </div>
        )}
      </td>

      <td className="px-4 py-3 font-medium">{workspace.name}</td>
      <td className="px-4 py-3">
        <code className="rounded bg-muted px-2 py-0.5 text-xs">{workspace.path}</code>
      </td>

      {/* Star toggle */}
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={handleStarToggle}
          className="rounded p-1 text-muted-foreground hover:text-yellow-500"
          aria-label={workspace.starred ? `Unstar ${workspace.name}` : `Star ${workspace.name}`}
        >
          <Star
            className={`h-4 w-4 ${workspace.starred ? 'fill-yellow-500 text-yellow-500' : ''}`}
          />
        </button>
      </td>

      {/* Remove */}
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="rounded p-1 text-muted-foreground hover:text-red-500 disabled:opacity-50"
          aria-label={`Remove ${workspace.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
