'use client';

/**
 * LeftPanel — Mode-switching sidebar wrapper.
 *
 * Renders PanelHeader for mode toggle + refresh, and the active
 * child content based on current mode. Children keyed by PanelMode.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 */

import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PanelMode } from '../types';
import { PanelHeader } from './panel-header';

export interface LeftPanelMode {
  key: PanelMode;
  icon: ReactNode;
  label: string;
}

export interface LeftPanelModeHeader {
  title: string;
  subtitle?: ReactNode;
  onRefresh?: () => void;
  refreshLabel?: string;
}

export interface LeftPanelProps {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  modes: LeftPanelMode[];
  onRefresh: () => void;
  subtitle?: ReactNode;
  modeHeaders?: Partial<Record<PanelMode, LeftPanelModeHeader>>;
  children: Partial<Record<PanelMode, ReactNode>>;
}

export function LeftPanel({
  mode,
  onModeChange,
  modes,
  onRefresh,
  subtitle,
  modeHeaders,
  children,
}: LeftPanelProps) {
  // Hide mode buttons when only one mode available
  const showModes = modes.length > 1 ? modes : undefined;
  const modeHeader = modeHeaders?.[mode];
  const refresh = modeHeader?.onRefresh ?? onRefresh;

  return (
    <div className="flex flex-col h-full text-sm">
      <PanelHeader
        title={modeHeader?.title ?? 'Files'}
        subtitle={modeHeader ? modeHeader.subtitle : subtitle}
        modes={showModes}
        activeMode={mode}
        onModeChange={onModeChange}
        actions={[
          {
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            label: modeHeader?.refreshLabel ?? 'Refresh',
            onClick: refresh,
          },
        ]}
      />
      <div className="flex-1 overflow-y-auto">{children[mode]}</div>
    </div>
  );
}
