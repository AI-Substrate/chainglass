/**
 * Settings Page — /workspaces/[slug]/settings
 *
 * Server Component that renders the SDK settings page.
 * Per Plan 047 Phase 5, Task T004.
 */

import { SettingsPage } from '../../../../../src/features/settings/components/settings-page';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SettingsRoute({ params }: PageProps) {
  const { slug } = await params;

  return <SettingsPage slug={slug} />;
}
