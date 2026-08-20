import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageDriver = 'local' | 'minio' | 's3';

export type PutObjectInput = {
  organizationId: string;
  clinicId?: string;
  filename: string;
  contentType: string;
  body: Buffer | Readable;
  metadata?: Record<string, string>;
  /** Prefixo lógico (ex.: certificates/) antes do restante da chave. */
  keyPrefix?: string;
};

export type StoredObject = {
  bucket: string;
  objectKey: string;
  etag?: string;
  size?: number;
  driver: StorageDriver;
};

export type StorageAdapter = {
  driver: StorageDriver;
  enabled: boolean;
  disabledReason?: string;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(objectKey: string): Promise<Buffer>;
  deleteObject(objectKey: string): Promise<void>;
  getSignedUrl?(objectKey: string, expiresSeconds?: number): Promise<string>;
};

function resolveDriver(): StorageDriver {
  const value = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (value === 'minio' || value === 's3') return value;
  return 'local';
}

async function bodyToBuffer(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function buildObjectKey(input: PutObjectInput): string {
  const prefix = (input.keyPrefix ?? '').replace(/^\/+|\/+$/g, '');
  const parts = [
    ...(prefix ? [prefix] : []),
    input.organizationId,
    input.clinicId ?? 'org',
    randomUUID(),
    input.filename.replaceAll(/[^a-zA-Z0-9._-]/g, '_'),
  ];
  return parts.join('/');
}

class LocalStorageAdapter implements StorageAdapter {
  driver: StorageDriver = 'local';
  enabled = true;
  private readonly root: string;
  private readonly bucket: string;

  constructor() {
    this.root = process.env.STORAGE_LOCAL_PATH ?? '.data/storage';
    this.bucket = process.env.S3_BUCKET ?? 'sonder-clinic-local';
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const objectKey = buildObjectKey(input);
    const fullPath = path.join(this.root, this.bucket, objectKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true, mode: 0o700 });
    if (Buffer.isBuffer(input.body)) {
      await fs.writeFile(fullPath, input.body, { mode: 0o600 });
      return {
        bucket: this.bucket,
        objectKey,
        size: input.body.length,
        etag: createHash('md5').update(input.body).digest('hex'),
        driver: this.driver,
      };
    }
    await pipeline(input.body, createWriteStream(fullPath, { mode: 0o600 }));
    const stat = await fs.stat(fullPath);
    return { bucket: this.bucket, objectKey, size: stat.size, driver: this.driver };
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const fullPath = path.join(this.root, this.bucket, objectKey);
    return fs.readFile(fullPath);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const fullPath = path.join(this.root, this.bucket, objectKey);
    await fs.rm(fullPath, { force: true });
  }
}

class MinioStorageAdapter implements StorageAdapter {
  driver: StorageDriver;
  enabled: boolean;
  disabledReason?: string;
  private readonly client?: S3Client;
  private readonly bucket: string;
  private readonly forcePathStyle: boolean;

  constructor(driver: StorageDriver = 'minio') {
    this.driver = driver;
    const endpoint = process.env.S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    const region = process.env.S3_REGION ?? 'us-east-1';
    this.bucket = process.env.S3_BUCKET ?? 'sonder-clinic';
    this.forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';
    const ready = Boolean(endpoint && accessKey && secretKey);
    this.enabled = ready;
    if (!ready) {
      this.disabledReason = 'MinIO/S3 não configurado (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY).';
      return;
    }
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: accessKey!,
        secretAccessKey: secretKey!,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    if (!this.enabled || !this.client) {
      throw new Error(this.disabledReason ?? 'Storage MinIO desabilitado.');
    }
    const objectKey = buildObjectKey(input);
    const body = await bodyToBuffer(input.body);
    const result = await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: body,
      ContentType: input.contentType,
      Metadata: input.metadata,
      ServerSideEncryption: 'AES256',
    }));
    return {
      bucket: this.bucket,
      objectKey,
      etag: result.ETag?.replaceAll('"', ''),
      size: body.length,
      driver: this.driver,
    };
  }

  async getObject(objectKey: string): Promise<Buffer> {
    if (!this.enabled || !this.client) {
      throw new Error(this.disabledReason ?? 'Storage MinIO desabilitado.');
    }
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
    if (!result.Body) throw new Error('Objeto vazio no storage.');
    return bodyToBuffer(result.Body as Readable);
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (!this.enabled || !this.client) {
      throw new Error(this.disabledReason ?? 'Storage MinIO desabilitado.');
    }
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
  }

  async getSignedUrl(objectKey: string, expiresSeconds = 300): Promise<string> {
    if (!this.enabled || !this.client) {
      throw new Error(this.disabledReason ?? 'Storage MinIO desabilitado.');
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: expiresSeconds },
    );
  }
}

class ClamAvScanner {
  enabled: boolean;
  disabledReason?: string;

  constructor() {
    const driver = (process.env.AV_DRIVER ?? 'stub').toLowerCase();
    this.enabled = driver === 'clamav';
    if (!this.enabled) {
      this.disabledReason = driver === 'disabled' || driver === 'stub'
        ? `Antivírus em modo ${driver} — upload não é marcado como limpo automaticamente.`
        : 'AV_DRIVER desconhecido.';
    }
  }

  async scan(buffer: Buffer): Promise<{
    clean: boolean;
    infected: boolean;
    engine: string;
    detail?: string;
  }> {
    if (!this.enabled) {
      return {
        clean: false,
        infected: false,
        engine: process.env.AV_DRIVER ?? 'stub',
        detail: this.disabledReason,
      };
    }

    const host = process.env.CLAMAV_HOST?.trim();
    if (!host) {
      return {
        clean: false,
        infected: false,
        engine: 'clamav',
        detail: 'CLAMAV_HOST ausente — varredura não executada (arquivo permanece PENDING).',
      };
    }

    const port = Number(process.env.CLAMAV_PORT ?? 3310);
    try {
      const response = await scanWithClamdInstream(buffer, host, port);
      if (response.includes('OK') && !response.includes('FOUND')) {
        return { clean: true, infected: false, engine: 'clamav', detail: response.trim() };
      }
      if (response.includes('FOUND')) {
        return { clean: false, infected: true, engine: 'clamav', detail: response.trim() };
      }
      return {
        clean: false,
        infected: false,
        engine: 'clamav',
        detail: `Resposta inesperada do ClamAV: ${response.trim() || '(vazia)'}`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao contactar ClamAV.';
      return {
        clean: false,
        infected: false,
        engine: 'clamav',
        detail: `ClamAV indisponível: ${detail}`,
      };
    }
  }
}

function scanWithClamdInstream(buffer: Buffer, host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (error?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result ?? '');
    };

    socket.setTimeout(15_000);
    socket.on('timeout', () => finish(new Error(`Timeout em ${host}:${port}`)));
    socket.on('error', (error) => finish(error));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => finish(undefined, Buffer.concat(chunks).toString('utf8')));

    socket.on('connect', () => {
      try {
        socket.write('zINSTREAM\0');
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const slice = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
          const header = Buffer.alloc(4);
          header.writeUInt32BE(slice.length, 0);
          socket.write(header);
          socket.write(slice);
        }
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0, 0);
        socket.write(end);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export function createStorageAdapter(): StorageAdapter {
  const driver = resolveDriver();
  if (driver === 'minio' || driver === 's3') return new MinioStorageAdapter(driver);
  return new LocalStorageAdapter();
}

export function createAntivirusScanner() {
  return new ClamAvScanner();
}

export const storageStatus = () => {
  const storage = createStorageAdapter();
  const antivirus = createAntivirusScanner();
  return {
    storage: {
      driver: storage.driver,
      enabled: storage.enabled,
      disabledReason: storage.disabledReason ?? null,
    },
    antivirus: {
      enabled: antivirus.enabled,
      driver: process.env.AV_DRIVER ?? 'stub',
      host: process.env.CLAMAV_HOST ?? null,
      port: Number(process.env.CLAMAV_PORT ?? 3310),
      disabledReason: antivirus.disabledReason ?? null,
    },
  };
};
