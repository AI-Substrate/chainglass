'use client';

import { useTheme } from 'next-themes';
import { ICON_BASE_PATH } from '../constants';
import { resolveFileIcon } from '../lib/icon-resolver';
import { useIconManifest } from './icon-theme-provider';

interface FileIconProps {
  filename: string;
  className?: string;
}

/**
 * Renders a themed file-type icon for the given filename.
 * Uses the manifest-driven resolver to map filenames to SVG icons.
 * Respects light/dark theme via useTheme().
 * Returns null while the manifest is loading.
 */
export function FileIcon({ filename, className }: FileIconProps) {
  const { manifest, isLoading, themeId } = useIconManifest();
  const { resolvedTheme } = useTheme();

  if (isLoading || !manifest) return null;

  const theme = resolvedTheme === 'light' ? 'light' : undefined;
  const resolution = resolveFileIcon(filename, manifest, theme);
  const src = `${ICON_BASE_PATH}/${themeId}/${resolution.iconName}.svg`;

  return <img src={src} alt="" className={className} draggable={false} />;
}
