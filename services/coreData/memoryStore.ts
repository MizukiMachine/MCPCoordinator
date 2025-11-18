import { promises as fs } from 'node:fs';
import path from 'node:path';

export type MemoryRole = 'user' | 'assistant';

export interface MemoryEntry {
  itemId?: string;
  role: MemoryRole;
  text: string;
  createdAt: string;
}

export interface MemoryStore {
  read(key: string, limit?: number): Promise<MemoryEntry[]>;
  upsert(key: string, entry: MemoryEntry): Promise<void>;
  reset(key: string): Promise<void>;
}

interface FileMemoryStoreOptions {
  filePath: string;
  maxEntriesPerKey?: number;
}

interface PersistedPayload {
  version: number;
  memories: Record<string, MemoryEntry[]>;
}

const DEFAULT_MAX_ENTRIES = 120;

export class FileMemoryStore implements MemoryStore {
  private readonly filePath: string;
  private readonly maxEntries: number;
  private mutex: Promise<void> = Promise.resolve();

  constructor(options: FileMemoryStoreOptions) {
    this.filePath = options.filePath;
    this.maxEntries = options.maxEntriesPerKey ?? DEFAULT_MAX_ENTRIES;
  }

  async read(key: string, limit?: number): Promise<MemoryEntry[]> {
    const payload = await this.load();
    const list = payload.memories[key] ?? [];
    if (typeof limit === 'number' && limit > 0) {
      return list.slice(-limit);
    }
    return [...list];
  }

  async upsert(key: string, entry: MemoryEntry): Promise<void> {
    await this.exclusive(async () => {
      const payload = await this.load();
      const list = payload.memories[key] ? [...payload.memories[key]!] : [];
      const idx =
        entry.itemId && list.findIndex((item) => item.itemId === entry.itemId);
      if (typeof idx === 'number' && idx >= 0) {
        const createdAt = list[idx].createdAt ?? entry.createdAt;
        list.splice(idx, 1);
        list.push({ ...entry, createdAt });
      } else {
        list.push(entry);
      }
      payload.memories[key] = this.trim(list);
      await this.save(payload);
    });
  }

  async reset(key: string): Promise<void> {
    await this.exclusive(async () => {
      const payload = await this.load();
      if (payload.memories[key]) {
        delete payload.memories[key];
        await this.save(payload);
      }
    });
  }

  private trim(entries: MemoryEntry[]): MemoryEntry[] {
    if (entries.length <= this.maxEntries) return entries;
    return entries.slice(entries.length - this.maxEntries);
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutex.then(fn, fn);
    // Ensure mutex is always resolved to avoid lock-ups after errors
    this.mutex = next.then(() => undefined, () => undefined);
    return next;
  }

  private async load(): Promise<PersistedPayload> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedPayload;
      if (parsed && parsed.version === 1 && parsed.memories) {
        return parsed;
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('[persistent-memory] failed to read store', { error });
      }
    }
    return { version: 1, memories: {} };
  }

  private async save(payload: PersistedPayload): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload), 'utf-8');
  }
}
