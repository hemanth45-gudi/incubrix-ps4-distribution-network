import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import { AppError } from '../middleware/errorHandler.js';

export interface StoredFile {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  download_url: string;
  created_at: string;
}

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export class StorageService {
  private localArtifactsDir: string;

  constructor() {
    this.localArtifactsDir = path.resolve(process.cwd(), 'artifacts');
    if (!fs.existsSync(this.localArtifactsDir)) {
      fs.mkdirSync(this.localArtifactsDir, { recursive: true });
    }
  }

  public validateSafeUrl(inputUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(inputUrl);
    } catch {
      throw new AppError('DEST_SPEC_VIOLATION', 'Invalid URL format', false, 400);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AppError('DEST_SPEC_VIOLATION', 'Only HTTP and HTTPS protocols are permitted', false, 400);
    }

    const hostname = parsed.hostname.toLowerCase();

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      throw new AppError('DEST_SPEC_VIOLATION', `SSRF Protection: Access to private/internal network host '${hostname}' is prohibited`, false, 403);
    }

    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const b1 = parseInt(match[1], 10);
      const b2 = parseInt(match[2], 10);
      if (
        b1 === 10 ||
        (b1 === 172 && b2 >= 16 && b2 <= 31) ||
        (b1 === 192 && b2 === 168) ||
        (b1 === 127) ||
        (b1 === 0)
      ) {
        throw new AppError('DEST_SPEC_VIOLATION', `SSRF Protection: Private IP ranges are prohibited: ${hostname}`, false, 403);
      }
    }
  }

  public async storeFile(
    filename: string,
    content: Buffer | string,
    mimeType: string = 'text/plain'
  ): Promise<StoredFile> {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        'DEST_SPEC_VIOLATION',
        `File size (${buffer.length} bytes) exceeds maximum allowed limit of ${MAX_FILE_SIZE_BYTES} bytes`,
        false,
        400
      );
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError('DEST_SPEC_VIOLATION', `MIME type '${mimeType}' is not supported`, false, 400);
    }

    const id = `file_${crypto.randomBytes(8).toString('hex')}`;
    const safeName = `${id}_${path.basename(filename)}`;
    const filePath = path.join(this.localArtifactsDir, safeName);
    const metaPath = path.join(this.localArtifactsDir, `${safeName}.meta.json`);

    await fs.promises.writeFile(filePath, buffer);
    await fs.promises.writeFile(
      metaPath,
      JSON.stringify({ id, filename, mime_type: mimeType, size_bytes: buffer.length })
    );

    const downloadUrl = `/api/v1/storage/${id}`;
    return {
      id,
      filename,
      mime_type: mimeType,
      size_bytes: buffer.length,
      download_url: downloadUrl,
      created_at: new Date().toISOString(),
    };
  }

  public async getFile(id: string): Promise<{ filename: string; buffer: Buffer; mime_type: string } | null> {
    const files = await fs.promises.readdir(this.localArtifactsDir);
    const target = files.find((f) => f.startsWith(`${id}_`) && !f.endsWith('.meta.json'));
    if (!target) return null;

    const fullPath = path.join(this.localArtifactsDir, target);
    const metaPath = path.join(this.localArtifactsDir, `${target}.meta.json`);
    const buffer = await fs.promises.readFile(fullPath);

    let mimeType = 'text/plain';
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        mimeType = meta.mime_type || mimeType;
      } catch {}
    }

    return {
      filename: target.replace(`${id}_`, ''),
      buffer,
      mime_type: mimeType,
    };
  }
}

export const storageService = new StorageService();
