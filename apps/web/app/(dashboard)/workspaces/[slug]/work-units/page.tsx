import { Suspense } from 'react';

import { UnitList } from '@/features/058-workunit-editor/components/unit-list';
import { listUnits } from '../../../../actions/workunit-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function WorkUnitsPage({ params }: PageProps) {
  const { slug } = await params;
  const result = await listUnits(slug);

  if (result.errors.length > 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {result.errors[0]?.message ?? 'Failed to load work units'}
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-4">Loading work units...</div>}>
      <UnitList workspaceSlug={slug} units={result.units} />
    </Suspense>
  );
}
