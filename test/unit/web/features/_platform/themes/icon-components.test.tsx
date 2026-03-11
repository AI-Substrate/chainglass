import type { IconThemeManifest } from '@/features/_platform/themes/types';
import { render, waitFor } from '@testing-library/react';
import { generateManifest } from 'material-icon-theme';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next-themes to control resolvedTheme in tests
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

function buildTestManifest(): IconThemeManifest {
  const raw = generateManifest();
  return {
    fileNames: raw.fileNames ?? {},
    fileExtensions: raw.fileExtensions ?? {},
    languageIds: raw.languageIds ?? {},
    folderNames: raw.folderNames ?? {},
    folderNamesExpanded: raw.folderNamesExpanded ?? {},
    iconDefinitions: raw.iconDefinitions ?? {},
    light: {
      fileNames: raw.light?.fileNames,
      fileExtensions: raw.light?.fileExtensions,
      languageIds: raw.light?.languageIds,
      folderNames: raw.light?.folderNames,
      folderNamesExpanded: raw.light?.folderNamesExpanded,
    },
    file: raw.file ?? 'file',
    folder: raw.folder ?? 'folder',
    folderExpanded: raw.folderExpanded ?? 'folder-open',
    rootFolder: raw.rootFolder,
    rootFolderExpanded: raw.rootFolderExpanded,
  };
}

// Use real imports — tests exercise the real IconThemeProvider with mocked fetch
const { IconThemeProvider } = await import(
  '@/features/_platform/themes/components/icon-theme-provider'
);
const { FileIcon } = await import('@/features/_platform/themes/components/file-icon');
const { FolderIcon } = await import('@/features/_platform/themes/components/folder-icon');

const manifest = buildTestManifest();

function mockFetchSuccess() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(manifest), { status: 200 })
  );
}

function mockFetchFailure() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not found', { status: 404 }));
}

function Wrapper({ children }: { children: ReactNode }) {
  return <IconThemeProvider>{children}</IconThemeProvider>;
}

beforeEach(() => {
  mockFetchSuccess();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IconThemeProvider', () => {
  it('fetches manifest and provides it to children', async () => {
    const { container } = render(
      <Wrapper>
        <FileIcon filename="package.json" />
      </Wrapper>
    );
    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/icons/material-icon-theme/manifest.json');
  });

  it('renders nothing for icon components while loading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <Wrapper>
        <FileIcon filename="app.tsx" />
      </Wrapper>
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing for icon components on fetch failure', async () => {
    mockFetchFailure();
    const { container } = render(
      <Wrapper>
        <FileIcon filename="app.tsx" />
      </Wrapper>
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('FileIcon', () => {
  it('renders an img with correct src for a TypeScript file', async () => {
    const { container } = render(
      <Wrapper>
        <FileIcon filename="app.tsx" className="h-4 w-4" />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toMatch(/\.svg$/);
      expect(img?.getAttribute('class')).toBe('h-4 w-4');
    });
  });

  it('renders correct icon for package.json (fileName match)', async () => {
    const { container } = render(
      <Wrapper>
        <FileIcon filename="package.json" />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('nodejs');
    });
  });

  it('renders generic file icon for unknown extension', async () => {
    const { container } = render(
      <Wrapper>
        <FileIcon filename="unknown.xyz123" />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('/file.svg');
    });
  });

  it('sets draggable to false', async () => {
    const { container } = render(
      <Wrapper>
        <FileIcon filename="app.tsx" />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('draggable')).toBe('false');
    });
  });
});

describe('FolderIcon', () => {
  it('renders src folder icon (collapsed)', async () => {
    const { container } = render(
      <Wrapper>
        <FolderIcon name="src" expanded={false} />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('folder-src');
    });
  });

  it('renders src folder icon (expanded)', async () => {
    const { container } = render(
      <Wrapper>
        <FolderIcon name="src" expanded={true} />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('folder-src-open');
    });
  });

  it('renders default folder icon for unknown folder', async () => {
    const { container } = render(
      <Wrapper>
        <FolderIcon name="random-unknown-xyz" expanded={false} />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('/folder.svg');
    });
  });

  it('renders default folder-open for unknown expanded folder', async () => {
    const { container } = render(
      <Wrapper>
        <FolderIcon name="random-unknown-xyz" expanded={true} />
      </Wrapper>
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toContain('folder-open');
    });
  });
});
