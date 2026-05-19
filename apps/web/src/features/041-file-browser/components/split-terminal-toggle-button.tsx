'use client';

/**
 * SplitTerminalToggleButton — toggles the browse-page inline terminal split.
 *
 * Plan 084 split-terminal-view T004.
 *
 * On false→true: dispatches `overlay:close-all` BEFORE calling `onChange(true)`
 * so any open right-edge overlay (terminal, activity-log, PR view, notes, agent)
 * closes — leaving exactly one terminal client attached in steady state. The
 * component does NOT subscribe to `overlay:close-all`; it is layout, not overlay
 * (KF-05).
 *
 * Styling matches the existing buttons in ExplorerPanel.rightActions (History,
 * QuestionPopperIndicator). PanelRight icon is the established dock-affordance
 * idiom (C-08).
 */

import { PanelRight } from 'lucide-react';

export interface SplitTerminalToggleButtonProps {
  value: boolean;
  onChange: (next: boolean) => void;
}

export function SplitTerminalToggleButton({
  value,
  onChange,
}: SplitTerminalToggleButtonProps) {
  const handleClick = () => {
    if (!value) {
      window.dispatchEvent(new CustomEvent('overlay:close-all'));
    }
    onChange(!value);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label="Toggle inline terminal"
      title={value ? 'Hide inline terminal' : 'Show inline terminal'}
      onClick={handleClick}
      className={
        value
          ? 'p-1.5 rounded-md bg-accent text-foreground transition-colors'
          : 'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
      }
    >
      <PanelRight className="h-4 w-4" />
    </button>
  );
}
