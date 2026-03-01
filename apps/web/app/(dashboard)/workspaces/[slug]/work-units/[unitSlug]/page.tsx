import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { WorkUnitEditor } from '@/features/058-workunit-editor/components/workunit-editor';
import { listUnits, loadUnit, loadUnitContent } from '../../../../../actions/workunit-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string; unitSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkUnitEditorPage({ params, searchParams }: PageProps) {
  const { slug, unitSlug } = await params;
  const sp = await searchParams;
  const worktreePath = typeof sp.worktree === 'string' ? sp.worktree : undefined;
  const returnToWorkflow =
    sp.from === 'workflow' && typeof sp.graph === 'string' ? sp.graph : undefined;

  if (!worktreePath) {
    redirect(`/workspaces/${slug}`);
  }

  const [unitResult, contentResult, unitsResult] = await Promise.all([
    loadUnit(slug, unitSlug, worktreePath),
    loadUnitContent(slug, unitSlug, worktreePath),
    listUnits(slug, worktreePath),
  ]);

  if (unitResult.errors.length > 0 || !unitResult.unit) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {unitResult.errors[0]?.message ?? 'Work unit not found'}
      </div>
    );
  }

  if (contentResult.errors.length > 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {contentResult.errors[0]?.message ?? 'Failed to load unit content'}
      </div>
    );
  }

  const unit = unitResult.unit;

  const scriptFilename =
    unit.type === 'code' ? (unit as { code?: { script?: string } }).code?.script : undefined;

  return (
    <Suspense fallback={<div className="p-4">Loading editor...</div>}>
      <WorkUnitEditor
        workspaceSlug={slug}
        unitSlug={unitSlug}
        unitType={unit.type}
        content={contentResult.content}
        description={unit.description ?? ''}
        version={unit.version}
        scriptFilename={scriptFilename}
        allUnits={unitsResult.units}
        inputs={unit.inputs ?? []}
        outputs={unit.outputs ?? []}
        returnToWorkflow={returnToWorkflow}
        returnWorktree={worktreePath}
        worktreePath={worktreePath}
      />
    </Suspense>
  );
}
