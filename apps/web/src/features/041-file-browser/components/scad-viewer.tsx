'use client';

/**
 * ScadViewer — Preview mode for .scad files.
 *
 * Fetches the server-compiled STL from /api/workspaces/[slug]/files/scad
 * and renders it on the shared ModelStage. Distinct states — "OpenSCAD not
 * installed" (501) is NOT the same as "compile failed" (422, stderr shown)
 * and neither collapses into an empty preview.
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { useEffect, useState } from 'react';
import type * as THREE from 'three';
import { ModelStage, stlToObject } from './model-viewer';

type ScadState =
  | { status: 'loading' }
  | { status: 'ready'; object: THREE.Object3D }
  | { status: 'not-installed'; detail: string }
  | { status: 'compile-error'; detail: string }
  | { status: 'error'; detail: string };

export interface ScadViewerProps {
  /** Full compile-route URL including worktree, file, and cache-busting mtime. */
  compileUrl: string;
}

export function ScadViewer({ compileUrl }: ScadViewerProps) {
  const [state, setState] = useState<ScadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(compileUrl);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          const detail = body.detail ?? `Compile request failed (${res.status})`;
          if (cancelled) return;
          if (res.status === 501) setState({ status: 'not-installed', detail });
          else if (res.status === 422) setState({ status: 'compile-error', detail });
          else setState({ status: 'error', detail });
          return;
        }
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        setState({ status: 'ready', object: stlToObject(buffer) });
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'error',
            detail: e instanceof Error ? e.message : 'Failed to fetch compiled model',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compileUrl]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <AsciiSpinner active={true} />
        <p className="text-xs">Compiling with OpenSCAD…</p>
      </div>
    );
  }
  if (state.status === 'not-installed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
        <p className="text-sm">OpenSCAD is not installed on this machine</p>
        <p className="text-xs font-mono">{state.detail}</p>
      </div>
    );
  }
  if (state.status === 'compile-error') {
    return (
      <div className="flex flex-col h-full gap-2 p-4 overflow-auto">
        <p className="text-sm text-muted-foreground">OpenSCAD compile failed</p>
        <pre className="text-xs font-mono whitespace-pre-wrap text-red-600 dark:text-red-400">
          {state.detail}
        </pre>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
        <p className="text-sm">Preview unavailable</p>
        <p className="text-xs font-mono">{state.detail}</p>
      </div>
    );
  }
  return (
    <div className="h-full w-full min-h-0" data-testid="scad-viewer">
      {/* OpenSCAD output is Z-up */}
      <ModelStage object={state.object} zUp />
    </div>
  );
}
