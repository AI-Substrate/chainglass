'use client';

/**
 * FileTree — Lazy-loading file tree with expand/collapse, filter, refresh,
 * and inline file/folder CRUD (create, rename, delete).
 *
 * Pure presentational: receives entries as props, fires callbacks for
 * file selection, directory expansion, refresh, and CRUD operations.
 *
 * Phase 4: File Browser — Plan 041
 * Phase 2: Add File/Folder Features — Plan 068
 * DYK-P4-01: Lazy per-directory (onExpand callback)
 * DYK-P4-03: Scales to huge repos
 */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { NoteIndicatorDot } from '@/features/071-file-notes/components/note-indicator-dot';
import { FileIcon, FolderIcon } from '@/features/_platform/themes';
import { useResponsive } from '@/hooks/useResponsive';
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  FilePlus,
  FileText,
  FolderPlus,
  FolderTree,
  Pencil,
  RefreshCw,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { FileEntry } from '../services/directory-listing';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';
import { InlineEditInput } from './inline-edit-input';

// --- Types ---

/** Inline edit state for create/rename modes (DYK-P2-05: separate from delete) */
type EditState =
  | { mode: 'create-file' | 'create-folder'; parentDir: string }
  | { mode: 'rename'; targetPath: string }
  | null;

/** Target for delete confirmation dialog (DYK-P2-05: independent of editState) */
type DeleteTarget = {
  path: string;
  name: string;
  type: 'file' | 'directory';
} | null;

/** Bundled mutation handlers passed to TreeItem when CRUD callbacks exist */
interface TreeMutationHandlers {
  editState: EditState;
  hasCreateFile: boolean;
  hasCreateFolder: boolean;
  hasRename: boolean;
  hasDelete: boolean;
  onStartCreate: (parentDir: string, mode: 'create-file' | 'create-folder') => void;
  onStartRename: (targetPath: string) => void;
  onCancelEdit: () => void;
  onConfirmCreate: (parentDir: string, name: string) => void;
  onConfirmRename: (oldPath: string, newName: string, type: 'file' | 'directory') => void;
  onRequestDelete: (path: string, name: string, type: 'file' | 'directory') => void;
}

// --- Public Interface ---

/** Handle exposed via ref for external access to tree state */
export interface FileTreeHandle {
  getExpandedDirs: () => string[];
}

export interface FileTreeProps {
  entries: FileEntry[];
  selectedFile?: string;
  changedFiles?: string[];
  /** Set of file paths that have open notes — renders blue indicator dot */
  filesWithNotes?: Set<string>;
  /** Paths of newly added files/dirs — get green fade-in animation */
  newlyAddedPaths?: Set<string>;
  onSelect: (filePath: string) => void;
  onDoubleSelect?: (filePath: string, wasSelected: boolean) => void;
  onExpand: (dirPath: string) => void;
  childEntries?: Record<string, FileEntry[]>;
  /** Programmatically expand these paths (merged into internal state) */
  expandPaths?: string[];
  /** Called when expanded dirs change (for external tracking) */
  onExpandedDirsChange?: (dirs: string[]) => void;
  onCopyFullPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onCopyContent?: (filePath: string) => void;
  onCopyTree?: (dirPath: string) => void;
  onDownload?: (filePath: string) => void;
  /** Called when "Add Note" is selected from context menu */
  onAddNote?: (filePath: string) => void;
  /** CRUD callbacks — when provided, enables mutation UI (hover buttons, context menu, keyboard shortcuts) */
  onCreateFile?: (parentDir: string, name: string) => void;
  onCreateFolder?: (parentDir: string, name: string) => void;
  onRename?: (oldPath: string, newName: string, type: 'file' | 'directory') => void;
  onDelete?: (path: string) => void;
}

// --- FileTree Component ---

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  {
    entries,
    selectedFile,
    changedFiles,
    filesWithNotes,
    newlyAddedPaths,
    onSelect,
    onDoubleSelect,
    onExpand,
    childEntries = {},
    expandPaths,
    onExpandedDirsChange,
    onCopyFullPath,
    onCopyRelativePath,
    onCopyContent,
    onCopyTree,
    onDownload,
    onAddNote,
    onCreateFile,
    onCreateFolder,
    onRename,
    onDelete,
  },
  ref
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand to selected file on initial render
    if (!selectedFile) return new Set();
    const parts = selectedFile.split('/');
    const paths = new Set<string>();
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      paths.add(current);
    }
    return paths;
  });

  const [editState, setEditState] = useState<EditState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  // Expose expanded dirs to parent via ref (DYK #4)
  useImperativeHandle(
    ref,
    () => ({
      getExpandedDirs: () => [...expanded],
    }),
    [expanded]
  );

  // Merge externally-requested expand paths into internal state
  useEffect(() => {
    if (!expandPaths || expandPaths.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const p of expandPaths) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [expandPaths]);

  // Notify parent when expanded dirs change
  useEffect(() => {
    onExpandedDirsChange?.([...expanded]);
  }, [expanded, onExpandedDirsChange]);

  const handleDirClick = (dirPath: string) => {
    const next = new Set(expanded);
    if (next.has(dirPath)) {
      next.delete(dirPath);
    } else {
      next.add(dirPath);
      if (!childEntries[dirPath]) {
        onExpand(dirPath);
      }
    }
    setExpanded(next);
  };

  // Build mutation handlers only when at least one CRUD callback exists
  const hasMutations = !!(onCreateFile || onCreateFolder || onRename || onDelete);

  const mutations: TreeMutationHandlers | undefined = hasMutations
    ? {
        editState,
        hasCreateFile: !!onCreateFile,
        hasCreateFolder: !!onCreateFolder,
        hasRename: !!onRename,
        hasDelete: !!onDelete,
        onStartCreate: (parentDir, mode) => {
          setEditState({ mode, parentDir });
          // Auto-expand folder if collapsed
          if (parentDir && !expanded.has(parentDir)) {
            const next = new Set(expanded);
            next.add(parentDir);
            if (!childEntries[parentDir]) {
              onExpand(parentDir);
            }
            setExpanded(next);
          }
        },
        onStartRename: (targetPath) => {
          setEditState({ mode: 'rename', targetPath });
        },
        onCancelEdit: () => {
          setEditState(null);
        },
        onConfirmCreate: (parentDir, name) => {
          if (editState?.mode === 'create-file') {
            onCreateFile?.(parentDir, name);
          } else if (editState?.mode === 'create-folder') {
            onCreateFolder?.(parentDir, name);
          }
          setEditState(null);
        },
        onConfirmRename: (oldPath, newName, type) => {
          onRename?.(oldPath, newName, type);
          setEditState(null);
        },
        onRequestDelete: (path, name, type) => {
          setEditState(null);
          setDeleteTarget({ path, name, type });
        },
      }
    : undefined;

  // F2 and Enter keyboard shortcuts for rename (T007)
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onRename || editState) return;
      if (e.key !== 'F2' && e.key !== 'Enter') return;

      const target = e.target as HTMLElement;
      // Ignore action buttons (refresh, new file, new folder) — FT-001
      if (target.closest('[data-tree-action]')) return;
      const treeItem = target.closest('[data-tree-path]');
      if (!treeItem) return;

      const path = treeItem.getAttribute('data-tree-path');
      if (!path) return;

      e.preventDefault();
      e.stopPropagation();
      setEditState({ mode: 'rename', targetPath: path });
    },
    [onRename, editState]
  );

  if (entries.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No files found</div>;
  }

  // Root-level inline create input (parentDir is '' for root)
  const rootCreateInput =
    mutations?.editState &&
    'parentDir' in mutations.editState &&
    mutations.editState.parentDir === '' ? (
      <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: '22px' }}>
        {mutations.editState.mode === 'create-folder' ? (
          <FolderIcon name="" expanded={false} className="h-4 w-4 shrink-0" />
        ) : (
          <FileIcon filename="" className="h-4 w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <InlineEditInput
            placeholder={mutations.editState.mode === 'create-file' ? 'File name' : 'Folder name'}
            onConfirm={(name) => mutations.onConfirmCreate('', name)}
            onCancel={mutations.onCancelEdit}
            commitOnBlur={false}
          />
        </div>
      </div>
    ) : null;

  return (
    <div className="text-sm" onKeyDown={hasMutations ? handleTreeKeyDown : undefined}>
      {/* Root row for root-level creation (DYK-P2-02) */}
      {mutations && (
        <div className="group flex items-center gap-1 px-2 py-0.5 hover:bg-accent">
          <FolderIcon name="" expanded={true} className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate text-xs text-muted-foreground">.</span>
          {onCreateFile && (
            <button
              type="button"
              onClick={() => mutations.onStartCreate('', 'create-file')}
              className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="New file at root"
            >
              <FilePlus className="h-3 w-3" />
            </button>
          )}
          {onCreateFolder && (
            <button
              type="button"
              onClick={() => mutations.onStartCreate('', 'create-folder')}
              className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="New folder at root"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      {rootCreateInput}
      {entries.map((entry) => (
        <TreeItem
          key={entry.path}
          entry={entry}
          depth={0}
          expanded={expanded}
          selectedFile={selectedFile}
          changedFiles={changedFiles}
          filesWithNotes={filesWithNotes}
          newlyAddedPaths={newlyAddedPaths}
          childEntries={childEntries}
          onSelect={onSelect}
          onDoubleSelect={onDoubleSelect}
          onDirClick={handleDirClick}
          onExpand={onExpand}
          onCopyFullPath={onCopyFullPath}
          onCopyRelativePath={onCopyRelativePath}
          onCopyContent={onCopyContent}
          onCopyTree={onCopyTree}
          onDownload={onDownload}
          onAddNote={onAddNote}
          mutations={mutations}
        />
      ))}
      {/* Delete confirmation dialog — rendered at tree level (DYK-P2-05) */}
      {deleteTarget && (
        <DeleteConfirmationDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          itemName={deleteTarget.name}
          itemType={deleteTarget.type}
          onConfirm={() => {
            onDelete?.(deleteTarget.path);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
});

// --- TreeItem Sub-Component ---

function TreeItem({
  entry,
  depth,
  expanded,
  selectedFile,
  changedFiles,
  filesWithNotes,
  newlyAddedPaths,
  childEntries,
  onSelect,
  onDoubleSelect,
  onDirClick,
  onExpand,
  onCopyFullPath,
  onCopyRelativePath,
  onCopyContent,
  onCopyTree,
  onDownload,
  onAddNote,
  mutations,
}: {
  entry: FileEntry;
  depth: number;
  expanded: Set<string>;
  selectedFile?: string;
  changedFiles?: string[];
  filesWithNotes?: Set<string>;
  newlyAddedPaths?: Set<string>;
  childEntries: Record<string, FileEntry[]>;
  onSelect: (path: string) => void;
  onDoubleSelect?: (path: string, wasSelected: boolean) => void;
  onDirClick: (path: string) => void;
  onExpand: (path: string) => void;
  onCopyFullPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onCopyContent?: (filePath: string) => void;
  onCopyTree?: (dirPath: string) => void;
  onDownload?: (filePath: string) => void;
  onAddNote?: (filePath: string) => void;
  mutations?: TreeMutationHandlers;
}) {
  const { useMobilePatterns } = useResponsive();
  const isExpanded = expanded.has(entry.path);
  const isSelected = selectedFile === entry.path;
  const isChanged = changedFiles?.includes(entry.path);
  const isNewlyAdded = newlyAddedPaths?.has(entry.path);
  const children = childEntries[entry.path];
  const isRenaming =
    mutations?.editState?.mode === 'rename' && mutations.editState.targetPath === entry.path;
  const isCreatingHere =
    mutations?.editState &&
    'parentDir' in mutations.editState &&
    mutations.editState.parentDir === entry.path;

  if (entry.type === 'directory') {
    return (
      <div data-tree-path={entry.path}>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled at tree level via handleTreeKeyDown */}
        <div
          onClick={isRenaming ? undefined : () => onDirClick(entry.path)}
          className={`group relative flex w-full items-center gap-1 px-2 text-left hover:bg-accent cursor-pointer ${
            isSelected ? 'bg-accent' : ''
          } ${isNewlyAdded ? 'tree-entry-new' : ''}${useMobilePatterns ? ' min-h-[36px] py-1.5' : ' py-1'}`}
          style={{ paddingLeft: `${depth * 16 + 8}px`, touchAction: 'manipulation' }}
        >
          {isRenaming ? (
            // Rename mode: keep icons, replace name with inline input (DYK-P2-04)
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {isExpanded ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <FolderIcon name={entry.name} expanded={true} className="h-4 w-4 shrink-0" />
                </>
              ) : (
                <>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <FolderIcon name={entry.name} expanded={false} className="h-4 w-4 shrink-0" />
                </>
              )}
              <div className="flex-1 min-w-0">
                <InlineEditInput
                  initialValue={entry.name}
                  onConfirm={(newName) =>
                    mutations?.onConfirmRename(entry.path, newName, 'directory')
                  }
                  onCancel={() => mutations?.onCancelEdit()}
                  commitOnBlur={true}
                  selectOnMount={true}
                />
              </div>
            </div>
          ) : (
            // Normal mode: clickable button with context menu + hover buttons
            <>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onDirClick(entry.path)}
                    className="flex items-center gap-1 min-w-0 flex-1"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <FolderIcon
                          name={entry.name}
                          expanded={true}
                          className="h-4 w-4 shrink-0"
                        />
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <FolderIcon
                          name={entry.name}
                          expanded={false}
                          className="h-4 w-4 shrink-0"
                        />
                      </>
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {mutations?.hasCreateFile && (
                    <ContextMenuItem
                      onSelect={() => mutations.onStartCreate(entry.path, 'create-file')}
                    >
                      <FilePlus className="h-3.5 w-3.5 mr-2" />
                      New File
                    </ContextMenuItem>
                  )}
                  {mutations?.hasCreateFolder && (
                    <ContextMenuItem
                      onSelect={() => mutations.onStartCreate(entry.path, 'create-folder')}
                    >
                      <FolderPlus className="h-3.5 w-3.5 mr-2" />
                      New Folder
                    </ContextMenuItem>
                  )}
                  {(mutations?.hasCreateFile || mutations?.hasCreateFolder) && (
                    <ContextMenuSeparator />
                  )}
                  <ContextMenuItem onSelect={() => onCopyFullPath?.(entry.path)}>
                    <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
                    Copy Full Path
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => onCopyRelativePath?.(entry.path)}>
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    Copy Relative Path
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => onCopyTree?.(entry.path)}>
                    <FolderTree className="h-3.5 w-3.5 mr-2" />
                    Copy Tree From Here
                  </ContextMenuItem>
                  {(mutations?.hasRename || mutations?.hasDelete) && <ContextMenuSeparator />}
                  {mutations?.hasRename && (
                    <ContextMenuItem onSelect={() => mutations.onStartRename(entry.path)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Rename
                    </ContextMenuItem>
                  )}
                  {mutations?.hasDelete && (
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() =>
                        mutations.onRequestDelete(entry.path, entry.name, 'directory')
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
              <button
                type="button"
                data-tree-action="refresh"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand(entry.path);
                }}
                className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Refresh ${entry.name}`}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              {mutations?.hasCreateFile && (
                <button
                  type="button"
                  data-tree-action="create-file"
                  onClick={(e) => {
                    e.stopPropagation();
                    mutations.onStartCreate(entry.path, 'create-file');
                  }}
                  className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`New file in ${entry.name}`}
                >
                  <FilePlus className="h-3 w-3" />
                </button>
              )}
              {mutations?.hasCreateFolder && (
                <button
                  type="button"
                  data-tree-action="create-folder"
                  onClick={(e) => {
                    e.stopPropagation();
                    mutations.onStartCreate(entry.path, 'create-folder');
                  }}
                  className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`New folder in ${entry.name}`}
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
        {/* Inline create input at top of children (T003) */}
        {isCreatingHere && mutations?.editState && 'mode' in mutations.editState && (
          <div
            className="flex items-center gap-1 px-2 py-1"
            style={{ paddingLeft: `${(depth + 1) * 16 + 8 + 14}px` }}
          >
            {mutations.editState.mode === 'create-folder' ? (
              <FolderIcon name="" expanded={false} className="h-4 w-4 shrink-0" />
            ) : (
              <FileIcon filename="" className="h-4 w-4 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <InlineEditInput
                placeholder={
                  mutations.editState.mode === 'create-file' ? 'File name' : 'Folder name'
                }
                onConfirm={(name) => mutations.onConfirmCreate(entry.path, name)}
                onCancel={() => mutations.onCancelEdit()}
                commitOnBlur={false}
              />
            </div>
          </div>
        )}
        {isExpanded && children && (
          <div>
            {children.map((child) => (
              <TreeItem
                key={child.path}
                entry={child}
                depth={depth + 1}
                expanded={expanded}
                selectedFile={selectedFile}
                changedFiles={changedFiles}
                filesWithNotes={filesWithNotes}
                newlyAddedPaths={newlyAddedPaths}
                childEntries={childEntries}
                onSelect={onSelect}
                onDirClick={onDirClick}
                onExpand={onExpand}
                onCopyFullPath={onCopyFullPath}
                onCopyRelativePath={onCopyRelativePath}
                onCopyContent={onCopyContent}
                onCopyTree={onCopyTree}
                onDownload={onDownload}
                onAddNote={onAddNote}
                mutations={mutations}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- File Item ---

  // Scroll selected file into view on mount — center so it's not at the edge
  const scrollRef = useCallback(
    (el: HTMLElement | null) => {
      if (el && isSelected) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
    [isSelected]
  );
  const selectedOnMouseDownRef = useRef(isSelected);

  // Rename mode for file: keep icon, replace name with inline input (DYK-P2-04)
  if (isRenaming) {
    return (
      <div
        ref={scrollRef}
        data-tree-path={entry.path}
        className={`relative flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent ${
          isSelected ? 'bg-accent font-medium' : ''
        } ${isNewlyAdded ? 'tree-entry-new' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8 + 14}px` }}
      >
        {isSelected && (
          <span className="absolute left-0.5 text-amber-500 font-black text-sm">▶</span>
        )}
        <FileIcon filename={entry.name} className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <InlineEditInput
            initialValue={entry.name}
            onConfirm={(newName) => mutations?.onConfirmRename(entry.path, newName, 'file')}
            onCancel={() => mutations?.onCancelEdit()}
            commitOnBlur={true}
            selectOnMount={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div data-tree-path={entry.path}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={scrollRef as React.Ref<HTMLButtonElement>}
            type="button"
            onMouseDown={() => {
              selectedOnMouseDownRef.current = isSelected;
            }}
            onClick={(event) => {
              onSelect(entry.path);
              if (event.detail === 2) {
                onDoubleSelect?.(entry.path, selectedOnMouseDownRef.current);
              }
            }}
            className={`relative flex w-full items-center gap-1 px-2 text-left hover:bg-accent${useMobilePatterns ? ' min-h-[36px] py-1.5' : ' py-1'} ${
              isSelected ? 'bg-accent font-medium' : ''
            } ${isChanged ? 'text-amber-600 dark:text-amber-400' : ''} ${isNewlyAdded ? 'tree-entry-new' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 8 + 14}px`, touchAction: 'manipulation' }}
          >
            {isSelected && (
              <span className="absolute left-0.5 text-amber-500 font-black text-sm">▶</span>
            )}
            <NoteIndicatorDot hasNotes={filesWithNotes?.has(entry.path) ?? false} />
            <FileIcon filename={entry.name} className="h-4 w-4 shrink-0" />
            <span className={`truncate ${isSelected ? 'text-base' : ''}`}>{entry.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onAddNote && (
            <>
              <ContextMenuItem onSelect={() => onAddNote(entry.path)}>
                <StickyNote className="h-3.5 w-3.5 mr-2" />
                Add Note
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={() => onCopyFullPath?.(entry.path)}>
            <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
            Copy Full Path
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCopyRelativePath?.(entry.path)}>
            <FileText className="h-3.5 w-3.5 mr-2" />
            Copy Relative Path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onCopyContent?.(entry.path)}>
            <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
            Copy Content
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onDownload?.(entry.path)}>
            <Download className="h-3.5 w-3.5 mr-2" />
            Download
          </ContextMenuItem>
          {(mutations?.hasRename || mutations?.hasDelete) && <ContextMenuSeparator />}
          {mutations?.hasRename && (
            <ContextMenuItem onSelect={() => mutations.onStartRename(entry.path)}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Rename
            </ContextMenuItem>
          )}
          {mutations?.hasDelete && (
            <ContextMenuItem
              variant="destructive"
              onSelect={() => mutations.onRequestDelete(entry.path, entry.name, 'file')}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
