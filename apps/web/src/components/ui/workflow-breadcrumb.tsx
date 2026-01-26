/**
 * WorkflowBreadcrumb - Context-aware breadcrumb navigation
 *
 * Shows navigation hierarchy: Workflows > [Workflow] > Runs > [Run ID]
 *
 * @see Plan 011: UI Mockups (AC-24, AC-25)
 */

import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface WorkflowBreadcrumbProps {
  /** Workflow slug (optional) */
  workflowSlug?: string;
  /** Run ID (optional) */
  runId?: string;
  /** Current page label (for last segment) */
  currentPage?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Build breadcrumb segments based on context
 */
function buildSegments(props: WorkflowBreadcrumbProps): BreadcrumbSegment[] {
  const { workflowSlug, runId, currentPage } = props;
  const segments: BreadcrumbSegment[] = [];

  // Always start with Workflows
  segments.push({
    label: 'Workflows',
    href: '/workflows',
  });

  if (workflowSlug) {
    // Add workflow segment
    if (runId || currentPage) {
      // Link if not the last segment
      segments.push({
        label: workflowSlug,
        href: `/workflows/${workflowSlug}`,
      });
    } else {
      // Current page
      segments.push({ label: workflowSlug });
    }

    // Add Runs segment if we have a runId
    if (runId) {
      segments.push({
        label: 'Runs',
        href: `/workflows/${workflowSlug}/runs`,
      });

      // Add run ID as final segment
      if (currentPage) {
        segments.push({
          label: runId,
          href: `/workflows/${workflowSlug}/runs/${runId}`,
        });
        segments.push({ label: currentPage });
      } else {
        segments.push({ label: runId });
      }
    } else if (currentPage && !runId) {
      // Direct sub-page of workflow (e.g., Runs list)
      segments.push({ label: currentPage });
    }
  }

  return segments;
}

/**
 * WorkflowBreadcrumb provides hierarchical navigation for workflow pages.
 *
 * @example
 * // On All Workflows page
 * <WorkflowBreadcrumb />
 *
 * // On Single Workflow page
 * <WorkflowBreadcrumb workflowSlug="ci-cd-pipeline" />
 *
 * // On Runs list page
 * <WorkflowBreadcrumb workflowSlug="ci-cd-pipeline" currentPage="Runs" />
 *
 * // On Single Run page
 * <WorkflowBreadcrumb workflowSlug="ci-cd-pipeline" runId="run-001" />
 */
export function WorkflowBreadcrumb(props: WorkflowBreadcrumbProps) {
  const { className } = props;
  const segments = buildSegments(props);

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <BreadcrumbItem key={`${segment.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>}

              {isLast || !segment.href ? (
                <BreadcrumbPage>{segment.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={segment.href}>{segment.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
