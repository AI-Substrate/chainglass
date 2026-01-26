'use client';

/**
 * Single Run View Page
 *
 * Displays vertical phase flow with active phase highlight and question input.
 * Shows RunHeader with status summary, RunFlowContent for phases, and
 * NodeDetailPanel for phase details including QuestionInput for blocked phases.
 *
 * @see Plan 011: UI Mockups (T014, AC-08, AC-10, AC-13, AC-14-18)
 */

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { QuestionInput } from '@/components/phases/question-input';
import { RunFlowContent } from '@/components/runs/run-flow-content';
import { RunHeader } from '@/components/runs/run-header';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { WorkflowBreadcrumb } from '@/components/ui/workflow-breadcrumb';
import { useResponsive } from '@/hooks/useResponsive';
import { cn } from '@/lib/utils';

import { DEMO_RUNS, type RunDetail, getRunById } from '@/data/fixtures/runs.fixture';
import type { PhaseJSON } from '@/data/fixtures/workflows.fixture';

interface PageProps {
  params: Promise<{ slug: string; runId: string }>;
}

export default function SingleRunPage({ params }: PageProps) {
  const [paramsState, setParamsState] = useState<{ slug: string; runId: string } | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<PhaseJSON | null>(null);
  const { useMobilePatterns } = useResponsive();

  const handlePhaseSelect = useCallback((phase: PhaseJSON | null) => {
    setSelectedPhase(phase);
  }, []);

  const handleAnswerSubmit = useCallback(
    (questionId: string, answer: string | string[] | boolean) => {
      console.log('Answer submitted:', { questionId, answer });
      // In real app, this would update the run state
      // For mockup, just close the panel
      setSelectedPhase(null);
    },
    []
  );

  // Handle async params
  if (!paramsState) {
    params.then((p) => setParamsState(p));
    return <div className="container mx-auto py-6">Loading...</div>;
  }

  const { slug, runId } = paramsState;
  const run = getRunById(runId);

  if (!run) {
    return (
      <div className="container mx-auto py-6 text-center">
        <h1 className="text-2xl font-bold">Run not found</h1>
        <p className="text-muted-foreground mt-2">The run &ldquo;{runId}&rdquo; does not exist.</p>
        <Link
          href={`/workflows/${slug}/runs`}
          className="text-primary hover:underline mt-4 inline-block"
        >
          Back to Runs
        </Link>
      </div>
    );
  }

  // Only show sheet on mobile, desktop uses the side panel
  const showMobileSheet = useMobilePatterns && selectedPhase !== null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <WorkflowBreadcrumb workflowSlug={slug} runId={runId} />

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/workflows/${slug}/runs`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Run: {runId}</h1>
      </div>

      <RunHeader run={run.runSummary} />

      <div className="grid lg:grid-cols-[1fr_350px] gap-6">
        {/* Phase Flow */}
        <div className="border rounded-lg bg-background min-h-[500px]">
          <RunFlowContent
            phases={run.phases}
            onPhaseSelect={handlePhaseSelect}
            selectedPhase={selectedPhase?.name}
          />
        </div>

        {/* Phase Detail Panel (desktop) */}
        <div className="hidden lg:block">
          <PhaseDetailCard phase={selectedPhase} onAnswerSubmit={handleAnswerSubmit} />
        </div>
      </div>

      {/* Phase Detail Sheet (mobile only) */}
      {useMobilePatterns && (
        <Sheet open={showMobileSheet} onOpenChange={(open) => !open && setSelectedPhase(null)}>
          <SheetContent side="bottom" className="h-[80vh]">
            <SheetHeader>
              <SheetTitle>{selectedPhase?.name}</SheetTitle>
              {selectedPhase?.description && (
                <SheetDescription>{selectedPhase.description}</SheetDescription>
              )}
            </SheetHeader>
            <div className="mt-4">
              <PhaseDetailContent phase={selectedPhase} onAnswerSubmit={handleAnswerSubmit} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// ============ Phase Detail Components ============

interface PhaseDetailCardProps {
  phase: PhaseJSON | null;
  onAnswerSubmit: (questionId: string, answer: string | string[] | boolean) => void;
}

function PhaseDetailCard({ phase, onAnswerSubmit }: PhaseDetailCardProps) {
  if (!phase) {
    return (
      <div className="border rounded-lg p-6 text-center text-muted-foreground">
        <p>Select a phase to view details</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{phase.name}</h3>
        <StatusBadge status={phase.status} showIcon />
      </div>

      <PhaseDetailContent phase={phase} onAnswerSubmit={onAnswerSubmit} />
    </div>
  );
}

interface PhaseDetailContentProps {
  phase: PhaseJSON | null;
  onAnswerSubmit: (questionId: string, answer: string | string[] | boolean) => void;
}

function PhaseDetailContent({ phase, onAnswerSubmit }: PhaseDetailContentProps) {
  if (!phase) return null;

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  const inputs = phase.inputs ?? [];
  const outputs = phase.outputs ?? [];
  const commands = phase.commands ?? [];

  return (
    <div className="space-y-4">
      {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Order</p>
          <p className="font-medium">Phase {phase.order + 1}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Facilitator</p>
          <p className="font-medium capitalize">{phase.facilitator}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Started</p>
          <p className="font-medium">{formatTime(phase.startedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Duration</p>
          <p className="font-medium">{formatDuration(phase.duration)}</p>
        </div>
      </div>

      {/* Commands/Prompts */}
      {commands.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span className="text-amber-500">⚙️</span> Prompts
          </h4>
          <div className="space-y-2">
            {commands.map((cmd) => (
              <ArtifactPreview
                key={cmd.name}
                name={cmd.name}
                description={cmd.description}
                content={cmd.content}
                from="workflow"
                type="markdown"
              />
            ))}
          </div>
        </div>
      )}

      {/* Inputs */}
      {inputs.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span className="text-blue-500">📥</span> Inputs
          </h4>
          <div className="space-y-2">
            {inputs.map((input) => (
              <ArtifactPreview
                key={input.name}
                name={input.name}
                description={input.description}
                content={input.content}
                from={input.from}
                type={input.type}
              />
            ))}
          </div>
        </div>
      )}

      {/* Outputs */}
      {outputs.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span className="text-emerald-500">📤</span> Outputs
          </h4>
          <div className="space-y-2">
            {outputs.map((output) => (
              <ArtifactPreview
                key={output.name}
                name={output.name}
                description={output.description}
                content={output.content}
                from={output.from}
                type={output.type}
              />
            ))}
          </div>
        </div>
      )}

      {/* Question Input for blocked phases */}
      {phase.status === 'blocked' && phase.question && (
        <div className="pt-4 border-t">
          <QuestionInput question={phase.question} onSubmit={onAnswerSubmit} />
        </div>
      )}
    </div>
  );
}

// ============ Artifact Preview Component ============

interface ArtifactPreviewProps {
  name: string;
  description?: string;
  content?: string;
  from?: 'user' | 'agent' | 'workflow';
  type?: string;
}

function ArtifactPreview({ name, description, content, from, type }: ArtifactPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const fromColors = {
    user: 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20',
    agent: 'border-cyan-200 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-900/20',
    workflow: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
  };

  const fromIcons = {
    user: '👤',
    agent: '🤖',
    workflow: '⚙️',
  };

  const bgColor = from
    ? fromColors[from]
    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50';
  const icon = from ? fromIcons[from] : '📄';

  return (
    <div className={cn('border rounded-lg overflow-hidden', bgColor)}>
      <button
        type="button"
        onClick={() => content && setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-black/5 dark:hover:bg-white/5"
        disabled={!content}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">{icon}</span>
          <code className="text-xs font-mono truncate">{name}</code>
          {type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
              {type}
            </span>
          )}
        </div>
        {content && <span className="text-xs text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>}
        {!content && from === 'agent' && (
          <span className="text-xs text-muted-foreground italic">pending</span>
        )}
      </button>

      {isExpanded && content && (
        <div className="border-t px-3 py-2 bg-white dark:bg-slate-950">
          <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[300px]">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
