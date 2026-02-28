import { Suspense } from 'react';

import { WorkUnitEditor } from '@/features/058-workunit-editor/components/workunit-editor';
import { listUnits, loadUnit, loadUnitContent } from '../../../../../actions/workunit-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string; unitSlug: string }>;
}

export default async function WorkUnitEditorPage({ params }: PageProps) {
  const { slug, unitSlug } = await params;

  const [unitResult, contentResult, unitsResult] = await Promise.all([
    loadUnit(slug, unitSlug),
    loadUnitContent(slug, unitSlug),
    listUnits(slug),
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

  // Extract script filename for code units
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
      />
    </Suspense>
  );
}
