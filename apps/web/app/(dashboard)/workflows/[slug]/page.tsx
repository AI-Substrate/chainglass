'use client';

/**
 * Single Workflow View Page
 *
 * Displays workflow template with phase layout and checkpoint timeline.
 * Allows viewing workflow structure before starting runs.
 * Clicking on artifacts shows their details in a side panel.
 *
 * @see Plan 011: UI Mockups (T010, T018)
 */

import type { Node } from '@xyflow/react';
import { Eye, History, Play } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { CheckpointTimeline } from '@/components/checkpoints/checkpoint-timeline';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowBreadcrumb } from '@/components/ui/workflow-breadcrumb';
import {
  ArtifactDetailPanel,
  type SelectedArtifact,
} from '@/components/workflow/artifact-detail-panel';
import { WorkflowFlowContent } from '@/components/workflow/workflow-flow-content';
import { DEMO_CHECKPOINTS, getRunSummariesForWorkflow } from '@/data/fixtures/runs.fixture';
import { DEMO_WORKFLOWS, type PhaseJSON } from '@/data/fixtures/workflows.fixture';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function SingleWorkflowPage({ params }: PageProps) {
  return <SingleWorkflowContent params={params} />;
}

function SingleWorkflowContent({ params }: { params: Promise<{ slug: string }> }) {
  const [activeTab, setActiveTab] = useState('phases');
  const [slug, setSlug] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<SelectedArtifact | null>(null);

  // Handle async params
  if (!slug) {
    params.then((p) => setSlug(p.slug));
    return <div className="container mx-auto py-6">Loading...</div>;
  }

  const workflow = DEMO_WORKFLOWS.find((w) => w.slug === slug);
  const runs = getRunSummariesForWorkflow(slug);

  if (!workflow) {
    return (
      <div className="container mx-auto py-6 text-center">
        <h1 className="text-2xl font-bold">Workflow not found</h1>
        <p className="text-muted-foreground mt-2">
          The workflow &ldquo;{slug}&rdquo; does not exist.
        </p>
        <Link href="/workflows" className="text-primary hover:underline mt-4 inline-block">
          Back to Workflows
        </Link>
      </div>
    );
  }

  /**
   * Handle node click in the flow diagram
   * Extracts artifact data and opens the detail panel
   */
  const handleNodeClick = (node: Node) => {
    const nodeType = node.type;

    if (nodeType === 'command') {
      // Find the command definition from the workflow
      const phaseName = node.data.phaseId as string;
      const phase = workflow.phases.find((p) => p.name === phaseName);
      const command = phase?.commands?.find((c) => c.name === node.data.name);

      if (command) {
        setSelectedArtifact({
          id: node.id,
          type: 'command',
          data: command,
        });
      }
    } else if (nodeType === 'artifact') {
      // Find the artifact definition from the workflow
      const phaseName = node.data.phaseId as string;
      const direction = node.data.direction as 'input' | 'output';
      const phase = workflow.phases.find((p) => p.name === phaseName);

      const artifacts = direction === 'input' ? phase?.inputs : phase?.outputs;
      const artifact = artifacts?.find((a) => a.name === node.data.name);

      if (artifact) {
        setSelectedArtifact({
          id: node.id,
          type: 'artifact',
          data: { ...artifact, direction },
        });
      }
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <WorkflowBreadcrumb workflowSlug={workflow.slug} />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{workflow.slug}</h1>
          {workflow.description && <p className="text-muted-foreground">{workflow.description}</p>}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/workflows/${workflow.slug}/runs`}>
              <Eye className="h-4 w-4 mr-2" />
              View Runs ({runs.length})
            </Link>
          </Button>
          <Button>
            <Play className="h-4 w-4 mr-2" />
            Start Run
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="phases" className="gap-2">
            <Eye className="h-4 w-4" />
            Phases
          </TabsTrigger>
          <TabsTrigger value="checkpoints" className="gap-2">
            <History className="h-4 w-4" />
            Checkpoints
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phases" className="mt-4">
          <div className="flex gap-0 border rounded-lg bg-background overflow-hidden h-[700px]">
            {/* Flow diagram */}
            <div className={selectedArtifact ? 'flex-1' : 'w-full'}>
              <WorkflowFlowContent phases={workflow.phases} onNodeClick={handleNodeClick} />
            </div>

            {/* Detail panel */}
            {selectedArtifact && (
              <div className="w-[400px] border-l">
                <ArtifactDetailPanel
                  artifact={selectedArtifact}
                  onClose={() => setSelectedArtifact(null)}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="checkpoints" className="mt-4">
          <CheckpointTimeline
            checkpoints={DEMO_CHECKPOINTS}
            onView={(cp) => console.log('View checkpoint:', cp.version)}
            onStartRun={(cp) => console.log('Start run from:', cp.version)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
