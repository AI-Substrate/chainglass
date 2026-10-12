/**
 * The preview URL for an Office document (a PDF converted server-side, see
 * services/office-preview.ts), built from its raw-file URL. `version` (the file's mtime) changes
 * the URL when the file changes, so an open preview re-fetches and shows the new version.
 */
export function officePreviewUrl(rawFileUrl: string, version?: string): string {
  const url = rawFileUrl.replace('/files/raw?', '/files/office-preview?');
  return version ? `${url}&_v=${encodeURIComponent(version)}` : url;
}
