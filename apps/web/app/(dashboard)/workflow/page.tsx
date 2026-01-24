import { WorkflowContent } from '@/components/workflow';
import { DEMO_FLOW } from '@/data/fixtures';

/**
 * WorkflowPage - Workflow visualization demo page
 *
 * Server component that renders the WorkflowContent client component
 * with initial flow data from fixtures.
 */
export default function WorkflowPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Workflow Visualization</h1>
        <p className="text-muted-foreground mt-2">
          Interactive workflow diagram with custom node types. Click nodes to select, drag to pan,
          scroll to zoom.
        </p>
      </div>

      <WorkflowContent initialFlow={DEMO_FLOW} />
    </div>
  );
}
