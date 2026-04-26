/**
 * CommandPaletteDropdown Tests — Search Mode (Plan 049 Feature 2)
 *
 * Covers file search result rendering, status badges, sort/hidden toggles,
 * match count, loading/error/empty states, click selection, and keyboard nav.
 */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Mock themed icon components — these tests care about CommandPalette behavior, not icon resolution.
vi.mock('@/features/_platform/themes', () => ({
  FileIcon: ({ className }: { className?: string }) => (
    <img className={className} alt="" data-testid="file-icon" />
  ),
}));

import {
  CommandPaletteDropdown,
  type CommandPaletteDropdownHandle,
} from '@/features/_platform/panel-layout/components/command-palette-dropdown';
import type {
  FileChangeInfo,
  FileSearchEntry,
  FileSearchSortMode,
} from '@/features/_platform/panel-layout/types';
import type { MruTracker } from '@/lib/sdk/sdk-provider';
import type { IUSDK } from '@chainglass/shared/sdk';
import { createRef } from 'react';

// --- Fakes ---

const fakeSdk = {
  commands: { list: () => [], isAvailable: () => true },
} as unknown as IUSDK;

const fakeMru = { getOrder: () => [] } as unknown as MruTracker;

const makeEntry = (
  path: string,
  mtime = 1000,
  modified = false,
  lastChanged: number | null = null
): FileSearchEntry => ({ path, mtime, modified, lastChanged });

/** Fake callback that captures calls in a local array for assertion. */
function fakeCallback<T extends unknown[]>(): { fn: (...args: T) => void; calls: T[] } {
  const calls: T[] = [];
  return {
    fn: (...args: T) => {
      calls.push(args);
    },
    calls,
  };
}

/** Fake preventDefault for keyboard events */
function fakePreventDefault(): { fn: () => void; called: boolean } {
  let called = false;
  return {
    fn: () => {
      called = true;
    },
    get called() {
      return called;
    },
  };
}

const defaultSearchProps = {
  sdk: fakeSdk,
  filter: '',
  mru: fakeMru,
  mode: 'search' as const,
  onExecute: (() => {}) as (id: string) => void,
  onClose: () => {},
  inputValue: 'app',
  sortMode: 'recent' as FileSearchSortMode,
  onSortModeChange: () => {},
  includeHidden: false,
  onIncludeHiddenChange: () => {},
  onFileSelect: (() => {}) as (path: string) => void,
  workingChanges: [] as FileChangeInfo[],
};

describe('CommandPaletteDropdown — search mode', () => {
  it('renders file results when search text and results are provided', () => {
    /*
    Test Doc:
    - Why: Core rendering contract — search results must display in dropdown
    - Contract: Results array + non-empty input → file rows visible
    - Usage Notes: FileSearchEntry {path, mtime, modified, lastChanged}
    - Quality Contribution: AC-1, AC-5
    - Worked Example: [{path:'src/app.tsx'}] → 'app.tsx' visible in dropdown
    */
    const results: FileSearchEntry[] = [makeEntry('src/app.tsx'), makeEntry('src/app.test.tsx')];

    render(<CommandPaletteDropdown {...defaultSearchProps} fileSearchResults={results} />);

    expect(screen.getByText('app.tsx')).toBeInTheDocument();
    expect(screen.getByText('app.test.tsx')).toBeInTheDocument();
  });

  it('renders status badge M for modified file', () => {
    const results = [makeEntry('src/app.tsx')];
    const workingChanges: FileChangeInfo[] = [{ path: 'src/app.tsx', status: 'modified' }];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        workingChanges={workingChanges}
      />
    );

    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('renders status badge A for added file', () => {
    const results = [makeEntry('src/new.tsx')];
    const workingChanges: FileChangeInfo[] = [{ path: 'src/new.tsx', status: 'added' }];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        workingChanges={workingChanges}
      />
    );

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders sort toggle with Clock icon for recent mode', () => {
    const results = [makeEntry('src/app.tsx')];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        sortMode="recent"
      />
    );

    expect(screen.getByRole('button', { name: /sort by recently changed/i })).toBeInTheDocument();
  });

  it('renders sort toggle with correct label for alpha-asc mode', () => {
    const results = [makeEntry('src/app.tsx')];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        sortMode="alpha-asc"
      />
    );

    expect(screen.getByRole('button', { name: /sort alphabetically a to z/i })).toBeInTheDocument();
  });

  it('renders hidden toggle with correct label per includeHidden', () => {
    const results = [makeEntry('src/app.tsx')];

    const { rerender } = render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        includeHidden={false}
      />
    );

    expect(screen.getByRole('button', { name: /show hidden files/i })).toBeInTheDocument();

    rerender(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        includeHidden={true}
      />
    );

    expect(screen.getByRole('button', { name: /hide hidden files/i })).toBeInTheDocument();
  });

  it('displays match count in header', () => {
    const results = [
      makeEntry('src/app.tsx'),
      makeEntry('src/app.test.tsx'),
      makeEntry('config/app.config.ts'),
    ];

    render(<CommandPaletteDropdown {...defaultSearchProps} fileSearchResults={results} />);

    expect(screen.getByText('3 files')).toBeInTheDocument();
  });

  it('shows loading state with spinner text', () => {
    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={null}
        fileSearchLoading={true}
      />
    );

    expect(screen.getByText(/scanning files/i)).toBeInTheDocument();
  });

  it('shows error state message', () => {
    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={null}
        fileSearchError="Could not scan files"
      />
    );

    expect(screen.getByText('Could not scan files')).toBeInTheDocument();
  });

  it('shows "No matching files" for empty results', () => {
    render(<CommandPaletteDropdown {...defaultSearchProps} fileSearchResults={[]} />);

    expect(screen.getByText('No matching files')).toBeInTheDocument();
  });

  it('calls onFileSelect when a file result is clicked', async () => {
    /*
    Test Doc:
    - Why: Click selection must navigate to file
    - Contract: Click on result row → onFileSelect called with path
    - Usage Notes: Click delegates to fileNav.handleSelect in BrowserClient
    - Quality Contribution: AC-8
    - Worked Example: Click 'utils.ts' → onFileSelect('src/lib/utils.ts')
    */
    const user = userEvent.setup();
    const fileSelect = fakeCallback<[string]>();
    const results = [makeEntry('src/app.tsx'), makeEntry('src/lib/utils.ts')];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        onFileSelect={fileSelect.fn}
      />
    );

    await user.click(screen.getByText('utils.ts'));
    expect(fileSelect.calls).toEqual([['src/lib/utils.ts']]);
  });

  it('navigates with ArrowDown/ArrowUp and selects with Enter', async () => {
    /*
    Test Doc:
    - Why: Keyboard navigation must work for accessibility and power users
    - Contract: ArrowDown moves selection, Enter triggers onFileSelect
    - Usage Notes: Selection wraps via handleKeyDown imperative ref
    - Quality Contribution: AC-9, AC-10
    - Worked Example: ArrowDown → second item selected, Enter → onFileSelect('src/lib/utils.ts')
    */
    const ref = createRef<CommandPaletteDropdownHandle>();
    const fileSelect = fakeCallback<[string]>();
    const results = [
      makeEntry('src/app.tsx'),
      makeEntry('src/lib/utils.ts'),
      makeEntry('src/index.ts'),
    ];

    render(
      <CommandPaletteDropdown
        ref={ref}
        {...defaultSearchProps}
        fileSearchResults={results}
        onFileSelect={fileSelect.fn}
      />
    );

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');

    // Initially first item selected
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // ArrowDown → second item (wrap in act to flush state)
    const pd1 = fakePreventDefault();
    await act(async () => {
      ref.current?.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: pd1.fn,
      } as unknown as React.KeyboardEvent);
    });

    // Re-query after state update — check aria-selected
    const updatedOptions = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(updatedOptions[1]).toHaveAttribute('aria-selected', 'true');

    // Enter selects the file
    const pd2 = fakePreventDefault();
    await act(async () => {
      ref.current?.handleKeyDown({
        key: 'Enter',
        preventDefault: pd2.fn,
      } as unknown as React.KeyboardEvent);
    });

    expect(fileSelect.calls).toEqual([['src/lib/utils.ts']]);
  });

  it('renders directory path muted and filename emphasized', () => {
    const results = [makeEntry('src/components/AppHeader.tsx')];

    render(<CommandPaletteDropdown {...defaultSearchProps} fileSearchResults={results} />);

    // Directory portion
    expect(screen.getByText('src/components/')).toBeInTheDocument();
    // Filename portion
    expect(screen.getByText('AppHeader.tsx')).toBeInTheDocument();
  });

  it('shows Quick Access hints when input is empty', () => {
    render(
      <CommandPaletteDropdown {...defaultSearchProps} inputValue="" fileSearchResults={null} />
    );

    expect(screen.getByText('Quick Access')).toBeInTheDocument();
    expect(screen.getByText('Type to search files')).toBeInTheDocument();
  });

  it('renders context menu with file actions on right-click', async () => {
    /*
    Test Doc:
    - Why: AC-13 — context menu must expose file actions
    - Contract: Right-click on result → menu with Copy Full Path, Copy Relative Path, Copy Content, Download
    - Usage Notes: Uses Radix ContextMenu components consistent with file-tree pattern
    - Quality Contribution: AC-13
    - Worked Example: Right-click result → 4 menu items visible
    */
    const user = userEvent.setup();
    const copyFullPath = fakeCallback<[string]>();
    const copyRelativePath = fakeCallback<[string]>();
    const copyContent = fakeCallback<[string]>();
    const download = fakeCallback<[string]>();
    const results = [makeEntry('src/lib/utils.ts')];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        onCopyFullPath={copyFullPath.fn}
        onCopyRelativePath={copyRelativePath.fn}
        onCopyContent={copyContent.fn}
        onDownload={download.fn}
      />
    );

    // Right-click the file result to open context menu
    const fileRow = screen.getByRole('option');
    await user.pointer({ target: fileRow, keys: '[MouseRight]' });

    // All four actions should be visible
    expect(screen.getByText('Copy Full Path')).toBeInTheDocument();
    expect(screen.getByText('Copy Relative Path')).toBeInTheDocument();
    expect(screen.getByText('Copy Content')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });
});

describe('CommandPaletteDropdown — semantic-mode spawning state (Plan 084)', () => {
  /*
   * AC-02 / AC-03: when the long-lived fs2 mcp child for the worktree is being
   * spawned, the dropdown shows "Loading FlowSpace, please wait…" instead of
   * the generic "Searching…". Subsequent warm calls fall back to "Searching…".
   */

  const semanticBase = {
    sdk: fakeSdk,
    filter: '',
    mru: fakeMru,
    mode: 'semantic' as const,
    onExecute: (() => {}) as (id: string) => void,
    onClose: () => {},
    inputValue: '$ command palette',
    codeSearchAvailability: 'available' as const,
  };

  it('renders the Loading FlowSpace message when codeSearchSpawning is true', () => {
    render(
      <CommandPaletteDropdown
        {...semanticBase}
        codeSearchSpawning={true}
        codeSearchLoading={true}
      />
    );

    expect(screen.getByText(/Loading FlowSpace, please wait/)).toBeInTheDocument();
    expect(screen.getByText(/first search loads the code graph/)).toBeInTheDocument();
    // The generic "Searching…" should NOT appear during the spawn window.
    expect(screen.queryByText(/^Searching\.\.\./)).not.toBeInTheDocument();
  });

  it('renders the Searching message when codeSearchLoading is true and not spawning', () => {
    render(
      <CommandPaletteDropdown
        {...semanticBase}
        codeSearchSpawning={false}
        codeSearchLoading={true}
      />
    );

    expect(screen.getByText(/Searching\.\.\./)).toBeInTheDocument();
    expect(screen.queryByText(/Loading FlowSpace/)).not.toBeInTheDocument();
  });

  it('renders the empty hint when no query is present (no spawning UI)', () => {
    render(
      <CommandPaletteDropdown
        {...semanticBase}
        inputValue="$"
        codeSearchSpawning={false}
        codeSearchLoading={false}
      />
    );

    expect(screen.getByText('FlowSpace semantic search')).toBeInTheDocument();
    expect(screen.queryByText(/Loading FlowSpace/)).not.toBeInTheDocument();
  });
});
