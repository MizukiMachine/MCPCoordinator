import { afterEach, describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ImageUploadError,
  persistImage,
  resolveAllowedMimeTypes,
  resolveMaxBytes,
} from '../imageUploadService';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('imageUploadService', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tmpDirs.map(async (dir) => {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }),
    );
    tmpDirs.length = 0;
  });

  it('persists an allowed image and returns metadata with base64', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'img-store-'));
    tmpDirs.push(tmp);
    const file = new File([PNG_BYTES], 'sample.png', { type: 'image/png' });

    const stored = await persistImage({
      file,
      sessionId: 'sess_test',
      baseDir: tmp,
      maxBytes: 1024,
    });

    expect(stored.mimeType).toBe('image/png');
    expect(stored.size).toBe(PNG_BYTES.length);
    expect(stored.base64).toBe(PNG_BYTES.toString('base64'));
    const exists = await fs.stat(stored.storagePath);
    expect(exists.isFile()).toBe(true);
  });

  it('rejects unsupported mime types', async () => {
    const file = new File([PNG_BYTES], 'text.txt', { type: 'text/plain' });
    await expect(
      persistImage({ file, sessionId: 'sess_test', baseDir: os.tmpdir(), maxBytes: 1024 }),
    ).rejects.toThrow(ImageUploadError);
  });

  it('rejects files that exceed the configured max bytes', async () => {
    const smallLimit = 4;
    const file = new File([PNG_BYTES], 'oversize.png', { type: 'image/png' });
    await expect(
      persistImage({
        file,
        sessionId: 'sess_test',
        baseDir: os.tmpdir(),
        maxBytes: smallLimit,
      }),
    ).rejects.toThrow(ImageUploadError);
  });

  it('parses environment overrides for allowed mimetypes and max bytes', () => {
    process.env.IMAGE_UPLOAD_ALLOWED_MIME_TYPES = 'image/png';
    process.env.IMAGE_UPLOAD_MAX_BYTES = '1234';
    expect(resolveAllowedMimeTypes()).toEqual(['image/png']);
    expect(resolveMaxBytes()).toBe(1234);
    delete process.env.IMAGE_UPLOAD_ALLOWED_MIME_TYPES;
    delete process.env.IMAGE_UPLOAD_MAX_BYTES;
  });
});
