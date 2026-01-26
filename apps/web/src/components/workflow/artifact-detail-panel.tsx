'use client';

/**
 * ArtifactDetailPanel - Side panel showing details of selected template artifacts
 *
 * Displays markdown content for prompts and input files, or metadata
 * for agent-generated outputs (which don't have content in templates).
 *
 * Color scheme:
 * - Amber: Workflow template files (main.md prompts)
 * - Purple: User-provided inputs (request.md)
 * - Cyan: Agent-generated outputs (response.md)
 *
 * @see Plan 011: UI Mockups
 */

import { Bot, FileJson, FileText, Settings, Terminal, User, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PhaseCommandDefinition, PhaseIODefinition } from '@/data/fixtures/workflows.fixture';
import { cn } from '@/lib/utils';

export type SelectedArtifactType = 'command' | 'artifact';

export interface SelectedArtifact {
  id: string;
  type: SelectedArtifactType;
  data: PhaseCommandDefinition | (PhaseIODefinition & { direction?: 'input' | 'output' });
}

export interface ArtifactDetailPanelProps {
  artifact: SelectedArtifact | null;
  onClose: () => void;
  className?: string;
}

/**
 * Get icon for the artifact based on type and authorship
 */
function getArtifactIcon(artifact: SelectedArtifact) {
  if (artifact.type === 'command') {
    const data = artifact.data as PhaseCommandDefinition;
    const isMainPrompt = data.name === 'main.md';
    return isMainPrompt ? (
      <Terminal className="h-4 w-4 text-amber-500" />
    ) : (
      <Settings className="h-4 w-4 text-amber-500" />
    );
  }

  const data = artifact.data as PhaseIODefinition & { direction?: 'input' | 'output' };
  const from = data.from;
  const fileType = data.type;

  // Show authorship icon first
  if (from === 'user') {
    return <User className="h-4 w-4 text-purple-500" />;
  }
  if (from === 'agent') {
    return <Bot className="h-4 w-4 text-cyan-500" />;
  }

  // Fallback to file type icon
  if (fileType === 'json') {
    return <FileJson className="h-4 w-4 text-blue-500" />;
  }
  return <FileText className="h-4 w-4 text-blue-500" />;
}

/**
 * Get header color based on artifact type and authorship
 */
function getHeaderColor(artifact: SelectedArtifact): string {
  if (artifact.type === 'command') {
    return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  }

  const data = artifact.data as PhaseIODefinition & { direction?: 'input' | 'output' };
  const from = data.from;

  if (from === 'user') {
    return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
  }
  if (from === 'agent') {
    return 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800';
  }

  // Default for unattributed files
  return 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800';
}

/**
 * Get label for authorship
 */
function getFromLabel(from?: string): { icon: string; label: string; color: string } | null {
  switch (from) {
    case 'workflow':
      return {
        icon: '⚙️',
        label: 'Workflow Template',
        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      };
    case 'user':
      return {
        icon: '👤',
        label: 'User Input',
        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      };
    case 'agent':
      return {
        icon: '🤖',
        label: 'Agent Generated',
        color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
      };
    default:
      return null;
  }
}

export function ArtifactDetailPanel({ artifact, onClose, className }: ArtifactDetailPanelProps) {
  if (!artifact) return null;

  const isCommand = artifact.type === 'command';
  const commandData = isCommand ? (artifact.data as PhaseCommandDefinition) : null;
  const artifactData = !isCommand
    ? (artifact.data as PhaseIODefinition & { direction?: 'input' | 'output' })
    : null;

  const name = commandData?.name ?? artifactData?.name ?? 'Unknown';
  const description = commandData?.description ?? artifactData?.description;
  const content = commandData?.content ?? artifactData?.content;
  const from = commandData?.from ?? artifactData?.from;
  const fromInfo = getFromLabel(from);
  const isAgentGenerated = from === 'agent';

  return (
    <Card className={cn('flex flex-col h-full border-l', className)}>
      <CardHeader
        className={cn(
          'flex flex-row items-center justify-between space-y-0 pb-2 border-b',
          getHeaderColor(artifact)
        )}
      >
        <div className="flex items-center gap-2">
          {getArtifactIcon(artifact)}
          <CardTitle className="text-sm font-mono">{name}</CardTitle>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-auto">
        <div className="p-4 space-y-4">
          {/* Metadata */}
          <div className="space-y-2">
            {description && <p className="text-sm text-muted-foreground">{description}</p>}

            <div className="flex flex-wrap gap-2 text-xs">
              {fromInfo && (
                <span className={cn('px-2 py-0.5 rounded-full', fromInfo.color)}>
                  {fromInfo.icon} {fromInfo.label}
                </span>
              )}

              {artifactData?.type && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {artifactData.type}
                </span>
              )}

              {artifactData?.required !== undefined && (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full',
                    artifactData.required
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  )}
                >
                  {artifactData.required ? 'required' : 'optional'}
                </span>
              )}

              {commandData?.path && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-mono">
                  {commandData.path}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          {content ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 border-b text-xs text-muted-foreground">
                Content Preview
              </div>
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[500px] bg-white dark:bg-slate-950">
                {content}
              </pre>
            </div>
          ) : isAgentGenerated ? (
            <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50 text-center">
              <Bot className="h-8 w-8 mx-auto mb-2 text-cyan-500 opacity-50" />
              <p className="text-sm text-muted-foreground">
                This file is generated by the agent during workflow execution.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Content will be available when viewing a run.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50 text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-slate-400 opacity-50" />
              <p className="text-sm text-muted-foreground">No content preview available.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
