'use client';

/**
 * PanelHeader — Shared header for panel sections.
 *
 * Renders title + optional icon-only mode buttons + optional action buttons.
 * Used by LeftPanel for mode switching and refresh.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * DYK-05: Icon-only with tooltip (title attr) for compact header at min-width.
 */

import type { ReactNode } from 'react';
import type { PanelMode } from '../types';

export interface PanelHeaderMode {
  key: PanelMode;
  icon: ReactNode;
  label: string;
}

export interface PanelHeaderAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export interface PanelHeaderProps {
  title: string;
  subtitle?: ReactNode;
  modes?: PanelHeaderMode[];
  activeMode?: PanelMode;
  onModeChange?: (mode: PanelMode) => void;
  actions?: PanelHeaderAction[];
}

export function PanelHeader({
  title,
  subtitle,
  modes,
  activeMode,
  onModeChange,
  actions,
}: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2 shrink-0 sticky top-0 bg-background z-10">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase">{title}</span>
        {subtitle && <span data-testid="panel-header-subtitle">{subtitle}</span>}
        {modes?.map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => onModeChange?.(mode.key)}
            title={mode.label}
            aria-label={mode.label}
            className={`rounded p-1 transition-colors ${
              activeMode === mode.key
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode.icon}
          </button>
        ))}
      </div>
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              title={action.label}
              aria-label={action.label}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
