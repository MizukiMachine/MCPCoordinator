/// <reference types="vitest" />
import { describe, expect, it, beforeEach } from 'vitest';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

import { FileMemoryStore, type MemoryEntry } from '../memoryStore';

describe('FileMemoryStore', () => {
  let tempDir: string;
  let storePath: string;
  let store: FileMemoryStore;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'memory-store-'));
    storePath = path.join(tempDir, 'memory.json');
    store = new FileMemoryStore({ filePath: storePath, maxEntriesPerKey: 3 });
  });

  it('persists and retrieves entries', async () => {
    const entry: MemoryEntry = {
      itemId: 'a1',
      role: 'user',
      text: 'hello',
      createdAt: new Date().toISOString(),
    };
    await store.upsert('demo', entry);

    const loaded = await store.read('demo');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.text).toBe('hello');
  });

  it('upserts by itemId and trims by maxEntries', async () => {
    const now = new Date().toISOString();
    await store.upsert('demo', { itemId: 'a', role: 'user', text: '1', createdAt: now });
    await store.upsert('demo', { itemId: 'b', role: 'assistant', text: '2', createdAt: now });
    await store.upsert('demo', { itemId: 'c', role: 'user', text: '3', createdAt: now });
    await store.upsert('demo', { itemId: 'a', role: 'user', text: '1-updated', createdAt: now });
    await store.upsert('demo', { itemId: 'd', role: 'assistant', text: '4', createdAt: now });

    const loaded = await store.read('demo');
    expect(loaded).toHaveLength(3);
    // item a should be updated and retained because it was replaced before trim
    expect(loaded.some((item) => item.text === '1-updated')).toBe(true);
    expect(loaded.some((item) => item.text === '2')).toBe(false); // trimmed oldest
  });

  it('resets a key', async () => {
    const now = new Date().toISOString();
    await store.upsert('demo', { role: 'assistant', text: 'keep?', createdAt: now });
    await store.reset('demo');
    const loaded = await store.read('demo');
    expect(loaded).toHaveLength(0);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });
});
