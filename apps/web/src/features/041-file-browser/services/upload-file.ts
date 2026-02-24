import type { IFileSystem } from '@chainglass/shared/interfaces';
import type { IPathResolver } from '@chainglass/shared/interfaces';
import { PathSecurityError } from '@chainglass/shared/interfaces';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

export interface UploadFileOptions {
  worktreePath: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export interface UploadFileResult {
  ok: boolean;
  filePath?: string;
  error?: 'too-large' | 'security' | 'write-failed' | 'no-file';
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/json': 'json',
};

function extensionFromFilename(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return name.slice(dot + 1).toLowerCase();
  return undefined;
}

function generateTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')
    .slice(0, 15);
}

export async function uploadFileService(options: UploadFileOptions): Promise<UploadFileResult> {
  const { worktreePath, fileName, mimeType, content, fileSystem, pathResolver } = options;

  // Size check (before any I/O)
  if (content.length > MAX_UPLOAD_SIZE) {
    return { ok: false, error: 'too-large' };
  }

  // Resolve and validate destination directory
  let destDir: string;
  try {
    destDir = pathResolver.resolvePath(worktreePath, 'scratch/paste');
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Determine file extension
  const ext = extensionFromFilename(fileName) || MIME_TO_EXT[mimeType] || 'bin';

  // Generate timestamp filename
  const timestamp = generateTimestamp();
  const baseName = `${timestamp}.${ext}`;

  // Ensure scratch/paste/ exists
  await fileSystem.mkdir(destDir, { recursive: true });

  // Resolve collision
  let finalName = baseName;
  let counter = 1;
  while (await fileSystem.exists(`${destDir}/${finalName}`)) {
    finalName = `${timestamp}-${counter}.${ext}`;
    counter++;
  }

  // Resolve full path for security validation
  const relativePath = `scratch/paste/${finalName}`;
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, relativePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Atomic write: tmp → rename
  const tmpPath = `${absolutePath}.tmp`;
  try {
    await fileSystem.writeFile(tmpPath, content);
    await fileSystem.rename(tmpPath, absolutePath);
  } catch {
    return { ok: false, error: 'write-failed' };
  }

  return { ok: true, filePath: relativePath };
}
