export { resolveFileIcon, resolveFolderIcon } from './lib/icon-resolver';
export { FileIcon } from './components/file-icon';
export { FolderIcon } from './components/folder-icon';
export { IconThemeProvider, useIconManifest } from './components/icon-theme-provider';
export { registerThemesSDK } from './sdk/register';
export type {
  IconThemeManifest,
  IconResolution,
  IconThemeId,
} from './types';
export { DEFAULT_ICON_THEME, ICON_BASE_PATH } from './constants';
