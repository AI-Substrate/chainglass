'use client';

/**
 * ImageEditorLazy — dynamic-import wrapper for ImageEditor.
 *
 * Keeps perfect-freehand + the canvas editor out of the initial bundle; only
 * consumers that actually open Edit mode download the editor chunk (AC-10).
 * Mirrors markdown-wysiwyg-editor-lazy.tsx. The props type is imported
 * type-only, so referencing it here does not pull the heavy chunk.
 *
 * Plan 086: In-browser Image Editor — T010
 */

import dynamic from 'next/dynamic';

import type { ImageEditorProps } from './image-editor';

export type { ImageEditorProps };

export const ImageEditorLazy = dynamic<ImageEditorProps>(
  () => import('./image-editor').then((m) => ({ default: m.ImageEditor })),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded bg-muted p-4" />,
  }
);
