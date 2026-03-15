'use client';

/**
 * Copilot Session Badges — renders copilot session metadata as compact badges.
 *
 * Each badge shows: window index, model, effort, token usage, percentage, time ago.
 * Percentage is color-coded: green (<50%), yellow (50-75%), orange (75-90%), red (90%+).
 * Multiple badges flow inline separated by ║, wrapping as needed.
 *
 * Plan 075: tmux Copilot Status Bar
 */

import type { CopilotSessionBadge } from '../hooks/use-copilot-session-badges';

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function getPctColorClass(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-red-500';
  if (pct >= 75) return 'text-orange-500';
  if (pct >= 50) return 'text-yellow-500';
  return 'text-green-500';
}

function formatModel(model: string | null): string {
  if (!model) return '?';
  return model.replace('claude-', '').replace('gpt-', 'gpt');
}

interface CopilotSessionBadgesProps {
  badges: CopilotSessionBadge[];
}

export function CopilotSessionBadges({ badges }: CopilotSessionBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 flex-wrap border-t border-border/50 px-3 py-1"
      data-testid="copilot-session-badges"
    >
      {badges.map((badge, index) => {
        const modelStr = formatModel(badge.model);
        const effortStr = badge.reasoningEffort ? ` (${badge.reasoningEffort})` : '';
        const tokensStr = `${formatTokens(badge.promptTokens)}/${formatTokens(badge.contextWindow)}`;
        const pctStr = badge.pct !== null ? `${badge.pct}%` : '—';
        const pctClass = getPctColorClass(badge.pct);
        const timeStr = badge.lastActivityAgo ?? '';

        return (
          <span key={badge.windowIndex} className="inline-flex items-center whitespace-nowrap">
            {index > 0 && <span className="text-border mx-1 text-[10px]">║</span>}
            <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              <span className="text-foreground/70">{badge.windowIndex}:copilot:</span>
              <span>
                {modelStr}
                {effortStr}
              </span>
              <span className="text-border">│</span>
              <span>{tokensStr}</span>
              <span className={pctClass}>({pctStr})</span>
              {timeStr && (
                <>
                  <span className="text-border">│</span>
                  <span>{timeStr}</span>
                </>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
