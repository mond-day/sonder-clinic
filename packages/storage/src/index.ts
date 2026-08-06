import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
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
    }));
    return {
      bucket: this.bucket,
      objectKey,
      etag: result.ETag?.replaceAll('"', ''),
      size: body.length,
      driver: this.driver,
    };
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

  async scan(_buffer: Buffer): Promise<{ clean: boolean; engine: string; detail?: string }> {
    if (!this.enabled) {
      return { clean: false, engine: process.env.AV_DRIVER ?? 'stub', detail: this.disabledReason };
    }
    const host = process.env.CLAMAV_HOST;
    if (!host) {
      return {
        clean: false,
        engine: 'clamav',
        detail: 'CLAMAV_HOST ausente — varredura não executada.',
      };
    }
    return {
      clean: false,
      engine: 'clamav',
      detail: 'ClamAV configurado, mas o agente de socket não respondeu neste ambiente.',
    };
  }
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
      disabledReason: antivirus.disabledReason ?? null,
    },
  };
};
