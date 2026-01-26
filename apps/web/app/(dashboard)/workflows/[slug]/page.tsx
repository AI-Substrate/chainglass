'use client';

/**
 * Single Workflow View Page
 *
 * Displays workflow template with phase layout and checkpoint timeline.
 * Allows viewing workflow structure before starting runs.
 *
 * @see Plan 011: UI Mockups (T010, T018)
 */

import { useState } from 'react';
import Link from 'next/link';
import { Play, History, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowBreadcrumb } from '@/components/ui/workflow-breadcrumb';
import { RunFlowContent } from '@/components/runs/run-flow-content';
import { CheckpointTimeline } from '@/components/checkpoints/checkpoint-timeline';
import { DEMO_WORKFLOWS } from '@/data/fixtures/workflows.fixture';
import { DEMO_CHECKPOINTS, getRunSummariesForWorkflow } from '@/data/fixtures/runs.fixture';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function SingleWorkflowPage({ params }: PageProps) {
  const [activeTab, setActiveTab] = useState('phases');

  // Unwrap params (Next.js 16 async params)
  const resolvedParams = { slug: '' };

  // Note: In a real app, we'd use React.use() or async component
  // For mockup, we'll find by slug from URL
  // This is a client component workaround for demo purposes

  return (
    <SingleWorkflowContent params={params} />
  );
}

function SingleWorkflowContent({ params }: { params: Promise<{ slug: string }> }) {
  const [activeTab, setActiveTab] = useState('phases');
  const [slug, setSlug] = useState<string | null>(null);

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

  return (
    <div className="container mx-auto py-6 space-y-6">
      <WorkflowBreadcrumb workflowSlug={workflow.slug} />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{workflow.slug}</h1>
          {workflow.description && (
            <p className="text-muted-foreground">{workflow.description}</p>
          )}
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
          <div className="border rounded-lg bg-background">
            <RunFlowContent phases={workflow.phases} isTemplate />
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
