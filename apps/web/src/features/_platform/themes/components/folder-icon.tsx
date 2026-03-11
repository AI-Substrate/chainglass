'use client';

import { useTheme } from 'next-themes';
import { ICON_BASE_PATH } from '../constants';
import { resolveFolderIcon } from '../lib/icon-resolver';
import { useIconManifest } from './icon-theme-provider';

interface FolderIconProps {
  name: string;
  expanded: boolean;
  className?: string;
}

/**
 * Renders a themed folder icon for the given folder name.
 * Uses the manifest-driven resolver with expanded/collapsed variants.
 * Respects light/dark theme via useTheme().
 * Returns null while the manifest is loading.
 */
export function FolderIcon({ name, expanded, className }: FolderIconProps) {
  const { manifest, isLoading, themeId } = useIconManifest();
  const { resolvedTheme } = useTheme();

  if (isLoading || !manifest) return null;

  const theme = resolvedTheme === 'light' ? 'light' : undefined;
  const resolution = resolveFolderIcon(name, expanded, manifest, theme);
  const src = `${ICON_BASE_PATH}/${themeId}/${resolution.iconName}.svg`;

  return <img src={src} alt="" className={className} draggable={false} />;
}
