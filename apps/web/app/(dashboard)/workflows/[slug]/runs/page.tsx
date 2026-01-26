'use client';

/**
 * All Runs Page for a Workflow
 *
 * Shows RunList filtered by workflow slug with navigation to run details.
 *
 * @see Plan 011: UI Mockups (T011)
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WorkflowBreadcrumb } from '@/components/ui/workflow-breadcrumb';
import { RunList } from '@/components/runs/run-list';
import { DEMO_WORKFLOWS } from '@/data/fixtures/workflows.fixture';
import { getRunSummariesForWorkflow } from '@/data/fixtures/runs.fixture';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function WorkflowRunsPage({ params }: PageProps) {
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
      <WorkflowBreadcrumb workflowSlug={workflow.slug} currentPage="Runs" />

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/workflows/${workflow.slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Runs: {workflow.slug}
          </h1>
          <p className="text-muted-foreground">
            {runs.length} run{runs.length !== 1 ? 's' : ''} total
          </p>
        </div>
      </div>

      <RunList runs={runs} workflowSlug={workflow.slug} />
    </div>
  );
}
