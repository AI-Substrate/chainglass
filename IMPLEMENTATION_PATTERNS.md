# Implementation Patterns — Reference for PR View & File Notes

This document provides concrete patterns for implementing PR View and File Notes features using the documented interfaces.

---

## Pattern 1: Registering a New State Domain

**Example: File Notes Domain**

```typescript
// At application bootstrap
import { IStateService } from '@chainglass/shared';

stateService.registerDomain({
  domain: 'file-notes',
  description: 'Persistent file annotation system with links',
  multiInstance: true,  // Multiple notes, each with an ID
  properties: [
    {
      key: 'content',
      description: 'Note body text',
      typeHint: 'string'
    },
    {
      key: 'links',
      description: 'Array of linked resources (file, workflow, agent)',
      typeHint: 'Link[]'
    },
    {
      key: 'metadata',
      description: 'Created/updated timestamps, author info',
      typeHint: 'NoteMetadata'
    }
  ]
});
```

**State Paths Created:**
- `file-notes:note-uuid-1:content` — First note body
- `file-notes:note-uuid-1:links` — First note links
- `file-notes:note-uuid-1:metadata` — First note metadata
- `file-notes:note-uuid-2:content` — Second note body
- etc.

---

## Pattern 2: Publishing State Changes

**Example: Creating a Note**

```typescript
import { IStateService } from '@chainglass/shared';
import { ICentralEventNotifier } from '@chainglass/shared';

export class FileNoteService {
  constructor(
    private stateService: IStateService,
    private eventNotifier: ICentralEventNotifier
  ) {}

  async createNote(noteId: string, content: string, links: Link[]) {
    // Update state
    this.stateService.publish(`file-notes:${noteId}:content`, content);
    this.stateService.publish(`file-notes:${noteId}:links`, links);
    this.stateService.publish(`file-notes:${noteId}:metadata`, {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'system'
    });

    // Notify SSE subscribers (minimal payload per ADR-0007)
    this.eventNotifier.emit('file-notes', 'note-created', {
      noteId,
      linked: links.length > 0
    });
  }
}
```

---

## Pattern 3: Subscribing to State Changes

**Example: React Hook for File Notes**

```typescript
import { useEffect, useState } from 'react';
import { IStateService } from '@chainglass/shared';

export function useFileNotes(fileId: string) {
  const [notes, setNotes] = useState<Note[]>([]);
  const stateService = useContext(StateServiceContext);

  useEffect(() => {
    // Subscribe to all notes for this file
    const unsubscribe = stateService.subscribe(
      'file-notes:**',  // All file-notes
      (change) => {
        // change = { path, domain, instanceId, property, value, previousValue, timestamp, ... }
        
        // Refetch notes whenever any note property changes
        const allNotes = stateService.list('file-notes:**');
        setNotes(allNotes);
      }
    );

    return unsubscribe;
  }, [stateService, fileId]);

  return notes;
}
```

---

## Pattern 4: Secure File Operations

**Example: Store Notes to Disk**

```typescript
import { IFileSystem, IPathResolver } from '@chainglass/shared';

export class FileNoteStorage {
  constructor(
    private fs: IFileSystem,
    private pathResolver: IPathResolver
  ) {}

  async saveNote(worktreeRoot: string, noteId: string, noteData: Note) {
    // Secure path resolution prevents directory traversal
    const notesDir = this.pathResolver.resolvePath(worktreeRoot, '.chainglass/notes');
    const notePath = this.pathResolver.join(notesDir, `${noteId}.json`);

    // Create directory structure safely
    await this.fs.mkdir(notesDir, { recursive: true });

    // Write note atomically
    const tempPath = this.pathResolver.join(notesDir, `${noteId}.tmp.json`);
    await this.fs.writeFile(tempPath, JSON.stringify(noteData, null, 2));
    await this.fs.rename(tempPath, notePath);
  }

  async loadNotes(worktreeRoot: string): Promise<Note[]> {
    const notesDir = this.pathResolver.resolvePath(worktreeRoot, '.chainglass/notes');
    
    // Check if directory exists
    if (!await this.fs.exists(notesDir)) {
      return [];
    }

    // Glob pattern safely within directory
    const files = await this.fs.glob('*.json', {
      cwd: notesDir,
      absolute: false
    });

    const notes: Note[] = [];
    for (const file of files) {
      const filePath = this.pathResolver.join(notesDir, file);
      const content = await this.fs.readFile(filePath);
      notes.push(JSON.parse(content));
    }

    return notes;
  }
}
```

---

## Pattern 5: SDK Command Registration

**Example: File Note CLI Commands**

```typescript
import { IUSDK } from '@chainglass/shared';
import { z } from 'zod';

export function registerNoteCommands(sdk: IUSDK) {
  // note.create command
  sdk.commands.register({
    id: 'note.create',
    label: 'Create Note',
    domain: 'file-notes',
    when: 'fileExplorer.hasFocus',  // when-clause for availability
    params: z.object({
      fileSlug: z.string(),
      content: z.string(),
      linkType: z.enum(['file', 'workflow', 'agent']).optional()
    }),
    handler: async (params) => {
      const noteService = container.get('FileNoteService');
      await noteService.createNote(generateId(), params.content, [
        {
          type: params.linkType || 'file',
          target: params.fileSlug
        }
      ]);
    }
  });

  // note.list command
  sdk.commands.register({
    id: 'note.list',
    label: 'List Notes',
    domain: 'file-notes',
    params: z.object({
      fileSlug: z.string().optional()
    }),
    handler: async (params) => {
      const noteService = container.get('FileNoteService');
      const notes = await noteService.listNotes(params.fileSlug);
      sdk.toast.success(`Found ${notes.length} notes`);
    }
  });

  // note.delete command
  sdk.commands.register({
    id: 'note.delete',
    label: 'Delete Note',
    domain: 'file-notes',
    params: z.object({
      noteId: z.string()
    }),
    handler: async (params) => {
      const noteService = container.get('FileNoteService');
      await noteService.deleteNote(params.noteId);
    }
  });
}
```

---

## Pattern 6: PR View State Management

**Example: Register PR View Domain and Manage State**

```typescript
import { IStateService, ICentralEventNotifier } from '@chainglass/shared';

// Bootstrap
stateService.registerDomain({
  domain: 'pr-view',
  description: 'GitHub-style PR diff viewing and review tracking',
  multiInstance: true,  // Per worktree
  properties: [
    { key: 'diffs', description: 'Active diff list', typeHint: 'DiffEntry[]' },
    { key: 'reviewed', description: 'Reviewed file set', typeHint: 'string[]' },
    { key: 'comments', description: 'Inline comments', typeHint: 'Comment[]' }
  ]
});

// Mark file as reviewed
export class PRViewService {
  constructor(
    private stateService: IStateService,
    private eventNotifier: ICentralEventNotifier
  ) {}

  markFileReviewed(worktreeId: string, filePath: string, reviewed: boolean) {
    // Get current reviewed list
    const reviewed = this.stateService.get<string[]>(
      `pr-view:${worktreeId}:reviewed`
    ) || [];

    // Update list
    const updated = reviewed.includes(filePath)
      ? reviewed  // Already reviewed
      : [...reviewed, filePath];  // Add to reviewed

    this.stateService.publish(
      `pr-view:${worktreeId}:reviewed`,
      updated
    );

    // Notify observers
    this.eventNotifier.emit('file-changes', 'pr-file-reviewed', {
      worktreeId,
      filePath,
      reviewed: true
    });
  }
}
```

---

## Pattern 7: Event-Driven Updates

**Example: React to File Changes**

```typescript
import { useEffect } from 'react';
import { IStateService } from '@chainglass/shared';

export function usePRViewDiffs(worktreeId: string) {
  const stateService = useContext(StateServiceContext);
  const [diffs, setDiffs] = useState<DiffEntry[]>([]);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Subscribe to diffs for this worktree
    const unsubDiffs = stateService.subscribe(
      `pr-view:${worktreeId}:diffs`,
      (change) => {
        setDiffs(change.value as DiffEntry[]);
      }
    );

    // Subscribe to reviewed files for this worktree
    const unsubReviewed = stateService.subscribe(
      `pr-view:${worktreeId}:reviewed`,
      (change) => {
        setReviewed(new Set(change.value as string[]));
      }
    );

    return () => {
      unsubDiffs();
      unsubReviewed();
    };
  }, [stateService, worktreeId]);

  return { diffs, reviewed };
}
```

---

## Pattern 8: Adapter Pattern for Testing

**Example: Fake File System for Tests**

```typescript
import { IFileSystem, FileSystemError } from '@chainglass/shared';

export class FakeFileSystem implements IFileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  constructor() {
    this.dirs.add('/');
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new FileSystemError(
        `File not found: ${path}`,
        'ENOENT',
        path
      );
    }
    return content;
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (!this.dirs.has(dir)) {
      throw new FileSystemError(
        `Parent directory not found: ${dir}`,
        'ENOENT',
        path
      );
    }
    this.files.set(path, String(content));
  }

  // ... implement other methods ...
}
```

---

## Pattern 9: Same-Instance Guarantee for Agents

**Example: Agent Session Continuity**

```typescript
import { IAgentManagerService } from '@chainglass/shared';

export class AgentSessionManager {
  constructor(private agentManager: IAgentManagerService) {}

  async resumeSession(sessionId: string) {
    // First call creates agent with session ID
    const agent1 = this.agentManager.getWithSessionId(sessionId, {
      name: 'ChatBot',
      type: 'claude',
      workspace: '/path/to/workspace'
    });

    // Second call returns THE SAME object (===)
    const agent2 = this.agentManager.getWithSessionId(sessionId, {
      name: 'ChatBot',
      type: 'claude',
      workspace: '/path/to/workspace'
    });

    // This assertion MUST pass
    assert(agent1 === agent2);  // Same reference

    // Multiple consumers share one instance
    agent1.addEventHandler((event) => console.log('Handler 1', event));
    agent2.addEventHandler((event) => console.log('Handler 2', event));

    // Both handlers fire on run()
    await agent2.run({ prompt: 'Hello' });  // Triggers both handlers
  }
}
```

---

## Pattern 10: Service Error Handling

**Example: Graceful Command Execution**

```typescript
import { IUSDK } from '@chainglass/shared';

// SDK command handler — never crashes caller per DYK-05
sdk.commands.register({
  id: 'myfeature.action',
  label: 'Do Something',
  params: z.object({ foo: z.string() }),
  handler: async (params) => {
    try {
      // This might throw
      const result = await riskyOperation(params.foo);
      sdk.toast.success(`Success: ${result}`);
    } catch (error) {
      // SDK wraps in try/catch anyway, but good practice
      sdk.toast.error(`Failed: ${error.message}`);
    }
  }
});

// Execution wraps everything
await sdk.commands.execute('myfeature.action', { foo: 'bar' });
// - If params invalid: ZodError thrown (before handler)
// - If handler throws: Caught, logged, toast shown (doesn't propagate)
// - If handler succeeds: Normal execution
```

---

## Critical Checklist for Implementation

- [ ] Use `IFileSystem` for all file operations (never `fs` directly)
- [ ] Use `IPathResolver.resolvePath()` for user-supplied paths
- [ ] Register state domain with `IStateService.registerDomain()` at bootstrap
- [ ] Use state paths: `domain:instanceId:property` for multi-instance domains
- [ ] Emit events via `ICentralEventNotifier.emit()` (minimal payload)
- [ ] Subscribe with patterns: `'domain:**'` for all, `'domain:id:prop'` for specific
- [ ] Handle state subscription callbacks — store updated BEFORE notifying
- [ ] Use `IUSDK.commands.register()` for CLI/UI actions
- [ ] Implement graceful error handling in SDK handlers (try/catch)
- [ ] Use `IUSDK.settings` for user preferences (lazy-persisted)
- [ ] For agents: Same-instance guarantee via `getWithSessionId()`
- [ ] For state: Unidirectional dispatch, isolated subscriber errors
- [ ] Return unsubscribe functions from all `subscribe()` calls
- [ ] Test with `FakeFileSystem`, `FakeCentralEventNotifier`, etc.

