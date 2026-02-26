/**
 * CommandPaletteDropdown Tests — Search Mode (Plan 049 Feature 2)
 *
 * Covers file search result rendering, status badges, sort/hidden toggles,
 * match count, loading/error/empty states, click selection, and keyboard nav.
 */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  CommandPaletteDropdown,
  type CommandPaletteDropdownHandle,
} from '@/features/_platform/panel-layout/components/command-palette-dropdown';
import type {
  FileChangeInfo,
  FileSearchEntry,
  FileSearchSortMode,
} from '@/features/_platform/panel-layout/types';
import type { IUSDK } from '@chainglass/shared/sdk';
import type { MruTracker } from '@/lib/sdk/sdk-provider';
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

const defaultSearchProps = {
  sdk: fakeSdk,
  filter: '',
  mru: fakeMru,
  mode: 'search' as const,
  onExecute: vi.fn(),
  onClose: vi.fn(),
  inputValue: 'app',
  sortMode: 'recent' as FileSearchSortMode,
  onSortModeChange: vi.fn(),
  includeHidden: false,
  onIncludeHiddenChange: vi.fn(),
  onFileSelect: vi.fn(),
  workingChanges: [] as FileChangeInfo[],
};

describe('CommandPaletteDropdown — search mode', () => {
  it('renders file results when search text and results are provided', () => {
    const results: FileSearchEntry[] = [
      makeEntry('src/app.tsx'),
      makeEntry('src/app.test.tsx'),
    ];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
      />
    );

    expect(screen.getByText('app.tsx')).toBeInTheDocument();
    expect(screen.getByText('app.test.tsx')).toBeInTheDocument();
  });

  it('renders status badge M for modified file', () => {
    const results = [makeEntry('src/app.tsx')];
    const workingChanges: FileChangeInfo[] = [
      { path: 'src/app.tsx', status: 'modified' },
    ];

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
    const workingChanges: FileChangeInfo[] = [
      { path: 'src/new.tsx', status: 'added' },
    ];

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

    expect(
      screen.getByRole('button', { name: /sort by recently changed/i })
    ).toBeInTheDocument();
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

    expect(
      screen.getByRole('button', { name: /sort alphabetically a to z/i })
    ).toBeInTheDocument();
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

    expect(
      screen.getByRole('button', { name: /show hidden files/i })
    ).toBeInTheDocument();

    rerender(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        includeHidden={true}
      />
    );

    expect(
      screen.getByRole('button', { name: /hide hidden files/i })
    ).toBeInTheDocument();
  });

  it('displays match count in header', () => {
    const results = [
      makeEntry('src/app.tsx'),
      makeEntry('src/app.test.tsx'),
      makeEntry('config/app.config.ts'),
    ];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
      />
    );

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
    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={[]}
      />
    );

    expect(screen.getByText('No matching files')).toBeInTheDocument();
  });

  it('calls onFileSelect when a file result is clicked', async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const results = [makeEntry('src/app.tsx'), makeEntry('src/lib/utils.ts')];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
        onFileSelect={onFileSelect}
      />
    );

    await user.click(screen.getByText('utils.ts'));
    expect(onFileSelect).toHaveBeenCalledWith('src/lib/utils.ts');
  });

  it('navigates with ArrowDown/ArrowUp and selects with Enter', async () => {
    const ref = createRef<CommandPaletteDropdownHandle>();
    const onFileSelect = vi.fn();
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
        onFileSelect={onFileSelect}
      />
    );

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');

    // Initially first item selected
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // ArrowDown → second item (wrap in act to flush state)
    await act(async () => {
      ref.current!.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    // Re-query after state update — check aria-selected
    const updatedOptions = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(updatedOptions[1]).toHaveAttribute('aria-selected', 'true');

    // Enter selects the file
    await act(async () => {
      ref.current!.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onFileSelect).toHaveBeenCalledWith('src/lib/utils.ts');
  });

  it('renders directory path muted and filename emphasized', () => {
    const results = [makeEntry('src/components/AppHeader.tsx')];

    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        fileSearchResults={results}
      />
    );

    // Directory portion
    expect(screen.getByText('src/components/')).toBeInTheDocument();
    // Filename portion
    expect(screen.getByText('AppHeader.tsx')).toBeInTheDocument();
  });

  it('shows Quick Access hints when input is empty', () => {
    render(
      <CommandPaletteDropdown
        {...defaultSearchProps}
        inputValue=""
        fileSearchResults={null}
      />
    );

    expect(screen.getByText('Quick Access')).toBeInTheDocument();
    expect(screen.getByText('Type to search files')).toBeInTheDocument();
  });
});
