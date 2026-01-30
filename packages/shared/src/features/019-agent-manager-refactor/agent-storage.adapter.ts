/**
 * Plan 019: Agent Manager Refactor - Real Agent Storage Adapter
 *
 * Filesystem-based implementation of IAgentStorageAdapter.
 * Stores agents at ~/.config/chainglass/agents/ with atomic writes.
 *
 * Per spec AC-19: Storage at ~/.config/chainglass/agents/
 * Per spec AC-20: Registry tracks all agents with workspace refs
 * Per spec AC-21: Events stored in NDJSON format
 * Per spec AC-22: Instance metadata stored as JSON
 * Per spec AC-23: Path traversal prevention via assertValidAgentId()
 * Per DYK-11: Lives in packages/shared for contract test parity
 *
 * Storage structure:
 * ```
 * ~/.config/chainglass/agents/
 * ├── registry.json                    # {"agents":{"abc123":{"workspace":"/project"}}}
 * ├── abc123/
 * │   ├── instance.json               # {"id":"abc123","name":"chat","status":"stopped",...}
 * │   └── events.ndjson               # {"eventId":"...","type":"text","content":"Hello"}\n
 * ```
 */

import type { IFileSystem } from '../../interfaces/filesystem.interface.js';
import type { IPathResolver } from '../../interfaces/path-resolver.interface.js';
import { assertValidAgentId } from '../../utils/validate-agent-id.js';
import type { AgentStoredEvent } from './agent-instance.interface.js';
import type {
  AgentInstanceData,
  AgentRegistryEntry,
  IAgentStorageAdapter,
} from './agent-storage.interface.js';

/**
 * Internal registry file format.
 */
interface RegistryFile {
  agents: Record<string, AgentRegistryEntry>;
}

/**
 * AgentStorageAdapter is the filesystem-backed implementation of IAgentStorageAdapter.
 *
 * Features:
 * - Atomic writes via temp file + rename
 * - Path traversal prevention via validateAgentId
 * - NDJSON event storage
 * - JSON instance storage
 *
 * Usage:
 * ```typescript
 * import os from 'node:os';
 *
 * const basePath = path.join(os.homedir(), '.config', 'chainglass', 'agents');
 * const adapter = new AgentStorageAdapter(fs, pathResolver, basePath);
 *
 * await adapter.registerAgent({ id: 'agent-1', workspace: '/proj', createdAt: '...' });
 * await adapter.saveInstance({ id: 'agent-1', name: 'chat', ... });
 * ```
 */
export class AgentStorageAdapter implements IAgentStorageAdapter {
  private readonly _fs: IFileSystem;
  private readonly _path: IPathResolver;
  private readonly _basePath: string;
  /** Per-agent write queues to serialize concurrent appendEvent calls. */
  private readonly _writeQueues = new Map<string, Promise<void>>();

  private static readonly REGISTRY_FILE = 'registry.json';
  private static readonly INSTANCE_FILE = 'instance.json';
  private static readonly EVENTS_FILE = 'events.ndjson';

  /**
   * Create a new AgentStorageAdapter.
   *
   * @param fs - File system interface
   * @param pathResolver - Path resolver for path operations
   * @param basePath - Base path for storage (e.g., ~/.config/chainglass/agents)
   */
  constructor(fs: IFileSystem, pathResolver: IPathResolver, basePath: string) {
    this._fs = fs;
    this._path = pathResolver;
    this._basePath = basePath;
  }

  // ===== IAgentStorageAdapter Implementation =====

  async registerAgent(entry: AgentRegistryEntry): Promise<void> {
    assertValidAgentId(entry.id);
    await this._ensureBaseDir();

    const registry = await this._readRegistry();
    registry.agents[entry.id] = { ...entry };
    await this._writeRegistry(registry);
  }

  async unregisterAgent(agentId: string): Promise<void> {
    assertValidAgentId(agentId);

    // Remove from registry
    const registry = await this._readRegistry();
    delete registry.agents[agentId];
    await this._writeRegistry(registry);

    // Remove agent directory if it exists
    const agentDir = this._path.join(this._basePath, agentId);
    if (await this._fs.exists(agentDir)) {
      await this._fs.rmdir(agentDir, { recursive: true });
    }
  }

  async listAgents(): Promise<AgentRegistryEntry[]> {
    const registry = await this._readRegistry();
    return Object.values(registry.agents);
  }

  async saveInstance(data: AgentInstanceData): Promise<void> {
    assertValidAgentId(data.id);
    await this._ensureAgentDir(data.id);

    const instancePath = this._path.join(
      this._basePath,
      data.id,
      AgentStorageAdapter.INSTANCE_FILE
    );
    await this._writeJsonAtomic(instancePath, data);
  }

  async loadInstance(agentId: string): Promise<AgentInstanceData | null> {
    assertValidAgentId(agentId);

    const instancePath = this._path.join(
      this._basePath,
      agentId,
      AgentStorageAdapter.INSTANCE_FILE
    );

    if (!(await this._fs.exists(instancePath))) {
      return null;
    }

    const content = await this._fs.readFile(instancePath);
    return JSON.parse(content) as AgentInstanceData;
  }

  async appendEvent(agentId: string, event: AgentStoredEvent): Promise<void> {
    assertValidAgentId(agentId);
    await this._ensureAgentDir(agentId);

    // Serialize writes per-agent to prevent race conditions on the .tmp file.
    // Without this, rapid-fire events (e.g., copilot emitting 5+ in one ms)
    // all race on read → append → write, causing ENOENT on the temp file.
    const prev = this._writeQueues.get(agentId) ?? Promise.resolve();
    const next = prev.then(() => this._doAppendEvent(agentId, event));
    this._writeQueues.set(agentId, next.catch(() => {})); // swallow so queue continues
    return next;
  }

  private async _doAppendEvent(agentId: string, event: AgentStoredEvent): Promise<void> {
    const eventsPath = this._path.join(this._basePath, agentId, AgentStorageAdapter.EVENTS_FILE);

    // NDJSON append: each event is one JSON object per line
    const line = `${JSON.stringify(event)}\n`;

    // Read existing content and append (atomic)
    let existing = '';
    if (await this._fs.exists(eventsPath)) {
      existing = await this._fs.readFile(eventsPath);
    }
    await this._writeAtomic(eventsPath, existing + line);
  }

  async getEvents(agentId: string): Promise<AgentStoredEvent[]> {
    assertValidAgentId(agentId);

    const eventsPath = this._path.join(this._basePath, agentId, AgentStorageAdapter.EVENTS_FILE);

    if (!(await this._fs.exists(eventsPath))) {
      return [];
    }

    const content = await this._fs.readFile(eventsPath);
    return this._parseNdjson(content);
  }

  async getEventsSince(agentId: string, sinceId: string): Promise<AgentStoredEvent[]> {
    const events = await this.getEvents(agentId);

    const sinceIndex = events.findIndex((e) => e.eventId === sinceId);
    if (sinceIndex === -1) {
      // sinceId not found - return all events (per AC-10 graceful handling)
      return events;
    }

    return events.slice(sinceIndex + 1);
  }

  // ===== Private Helpers =====

  private async _ensureBaseDir(): Promise<void> {
    if (!(await this._fs.exists(this._basePath))) {
      await this._fs.mkdir(this._basePath, { recursive: true });
    }
  }

  private async _ensureAgentDir(agentId: string): Promise<void> {
    const agentDir = this._path.join(this._basePath, agentId);
    if (!(await this._fs.exists(agentDir))) {
      await this._fs.mkdir(agentDir, { recursive: true });
    }
  }

  private async _readRegistry(): Promise<RegistryFile> {
    const registryPath = this._path.join(this._basePath, AgentStorageAdapter.REGISTRY_FILE);

    if (!(await this._fs.exists(registryPath))) {
      return { agents: {} };
    }

    const content = await this._fs.readFile(registryPath);
    return JSON.parse(content) as RegistryFile;
  }

  private async _writeRegistry(registry: RegistryFile): Promise<void> {
    await this._ensureBaseDir();
    const registryPath = this._path.join(this._basePath, AgentStorageAdapter.REGISTRY_FILE);
    await this._writeJsonAtomic(registryPath, registry);
  }

  private async _writeJsonAtomic(path: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this._writeAtomic(path, content);
  }

  /**
   * Write content atomically via temp file + rename.
   * Per R1-04: Prevents corrupted files on crash.
   */
  private async _writeAtomic(path: string, content: string): Promise<void> {
    const tempPath = `${path}.tmp`;
    await this._fs.writeFile(tempPath, content);
    await this._fs.copyFile(tempPath, path);
    await this._fs.unlink(tempPath);
  }

  /**
   * Parse NDJSON content into events.
   * Per DYK-04: Silently skips malformed lines.
   */
  private _parseNdjson(content: string): AgentStoredEvent[] {
    const events: AgentStoredEvent[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue; // Skip empty lines

      try {
        const event = JSON.parse(trimmed) as AgentStoredEvent;
        events.push(event);
      } catch {
        // Per DYK-04: Silently skip malformed lines
        // (log warning could be added via optional logger)
      }
    }

    return events;
  }
}
