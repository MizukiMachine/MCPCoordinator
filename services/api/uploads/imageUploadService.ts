import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface StoredImage {
  id: string;
  size: number;
  mimeType: SupportedMimeType;
  originalName?: string;
  storagePath: string;
  base64: string;
}

export class ImageUploadError extends Error {
  public readonly code: 'missing_file' | 'invalid_type' | 'too_large';
  public readonly status: number;

  constructor(message: string, code: ImageUploadError['code'], status = 400) {
    super(message);
    this.name = 'ImageUploadError';
    this.code = code;
    this.status = status;
  }
}

interface PersistOptions {
  file: Blob;
  sessionId: string;
  maxBytes?: number;
  allowedMimeTypes?: SupportedMimeType[];
  baseDir?: string;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const DEFAULT_ALLOWED: SupportedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export function resolveAllowedMimeTypes(): SupportedMimeType[] {
  const raw = process.env.IMAGE_UPLOAD_ALLOWED_MIME_TYPES;
  if (!raw) return DEFAULT_ALLOWED;
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is SupportedMimeType =>
      ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(t),
    );
}

export function resolveMaxBytes(): number {
  const raw = process.env.IMAGE_UPLOAD_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

export function resolveBaseDir(): string {
  const configured =
    process.env.IMAGE_UPLOAD_DIR ||
    path.join(process.cwd(), 'var', 'uploads', 'images');
  return configured;
}

type FileLike = Blob & { name?: string; type?: string };

function isFileLike(file: unknown): file is FileLike {
  return (
    !!file &&
    typeof file === 'object' &&
    typeof (file as Blob).arrayBuffer === 'function' &&
    typeof (file as any).type === 'string'
  );
}

function ensureFile(file: Blob | null | undefined): asserts file is FileLike {
  if (!isFileLike(file)) {
    throw new ImageUploadError('画像ファイルが指定されていません', 'missing_file', 400);
  }
}

function assertMimeType(file: FileLike, allowed: SupportedMimeType[]) {
  const mime = file.type as SupportedMimeType;
  if (!allowed.includes(mime)) {
    throw new ImageUploadError(`未対応のMIMEタイプです: ${mime || 'unknown'}`, 'invalid_type', 400);
  }
}

function assertSize(buffer: Buffer, maxBytes: number) {
  if (buffer.byteLength > maxBytes) {
    throw new ImageUploadError(
      `ファイルサイズが上限(${maxBytes} bytes)を超えています`,
      'too_large',
      413,
    );
  }
}

function inferExtension(mime: SupportedMimeType): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

export async function persistImage(options: PersistOptions): Promise<StoredImage> {
  ensureFile(options.file);
  const maxBytes = options.maxBytes ?? resolveMaxBytes();
  const allowed = options.allowedMimeTypes ?? resolveAllowedMimeTypes();
  assertMimeType(options.file, allowed);

  const buffer = Buffer.from(await options.file.arrayBuffer());
  assertSize(buffer, maxBytes);

  const mimeType = options.file.type as SupportedMimeType;
  const extension = inferExtension(mimeType);
  const id = randomUUID();
  const dir = options.baseDir ?? resolveBaseDir();
  const fileName = `${options.sessionId}-${id}.${extension}`;
  const storagePath = path.join(dir, fileName);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(storagePath, buffer);

  return {
    id,
    size: buffer.byteLength,
    mimeType,
    originalName: options.file.name || undefined,
    storagePath,
    base64: buffer.toString('base64'),
  };
}
