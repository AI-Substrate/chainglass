/** Normalized icon theme manifest matching VSCode icon theme format */
export interface IconThemeManifest {
  /** Exact filename → icon definition key (e.g., "package.json" → "nodejs") */
  fileNames: Record<string, string>;
  /** File extension → icon definition key (e.g., "py" → "python") */
  fileExtensions: Record<string, string>;
  /** VSCode language ID → icon definition key (e.g., "typescript" → "typescript") */
  languageIds: Record<string, string>;
  /** Folder name → icon definition key (collapsed state) */
  folderNames: Record<string, string>;
  /** Folder name → icon definition key (expanded state) */
  folderNamesExpanded: Record<string, string>;
  /** Icon definition key → icon metadata */
  iconDefinitions: Record<string, { iconPath: string }>;
  /** Light-mode overrides (same structure, partial) */
  light: {
    fileNames?: Record<string, string>;
    fileExtensions?: Record<string, string>;
    languageIds?: Record<string, string>;
    folderNames?: Record<string, string>;
    folderNamesExpanded?: Record<string, string>;
  };
  /** Default file icon definition key */
  file: string;
  /** Default folder icon definition key (collapsed) */
  folder: string;
  /** Default folder icon definition key (expanded) */
  folderExpanded: string;
  /** Root folder icon definition key (collapsed, optional) */
  rootFolder?: string;
  /** Root folder icon definition key (expanded, optional) */
  rootFolderExpanded?: string;
}

/** Result of resolving a filename or folder name to an icon */
export interface IconResolution {
  /** Icon definition key (e.g., "typescript", "folder-src-open") */
  iconName: string;
  /** Icon path from the manifest's iconDefinitions (e.g., "./../icons/typescript.svg") */
  iconPath: string;
  /** How the icon was resolved */
  source: 'fileName' | 'fileExtension' | 'languageId' | 'default';
}

/** Identifier for an icon theme */
export type IconThemeId = string;
