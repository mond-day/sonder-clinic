import { afterEach, describe, expect, it } from 'vitest';
import {
  checkStorageBucket,
  createStorageAdapter,
  describeBucketCheckFailure,
  describeStoragePutFailure,
  storageErrorCode,
  storageStatus,
} from './index';

const previous = { ...process.env };

afterEach(() => {
  process.env = { ...previous };
});

describe('storage adapters', () => {
  it('defaults to local disk adapter', () => {
    delete process.env.STORAGE_DRIVER;
    const adapter = createStorageAdapter();
    expect(adapter.driver).toBe('local');
    expect(adapter.enabled).toBe(true);
  });

  it('enables minio adapter only with credentials', async () => {
    process.env.STORAGE_DRIVER = 'minio';
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    const disabled = createStorageAdapter();
    expect(disabled.driver).toBe('minio');
    expect(disabled.enabled).toBe(false);

    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'minio';
    process.env.S3_SECRET_KEY = 'minio123';
    delete process.env.AWS_REQUEST_CHECKSUM_CALCULATION;
    delete process.env.AWS_RESPONSE_CHECKSUM_VALIDATION;
    const enabled = createStorageAdapter();
    expect(enabled.enabled).toBe(true);
    expect(storageStatus().storage.driver).toBe('minio');
    expect(storageStatus().storage.enabled).toBe(true);
    expect(process.env.AWS_REQUEST_CHECKSUM_CALCULATION).toBe('WHEN_REQUIRED');
    expect(process.env.AWS_RESPONSE_CHECKSUM_VALIDATION).toBe('WHEN_REQUIRED');
  });

  it('keeps antivirus disabled without clamav driver', () => {
    process.env.AV_DRIVER = 'stub';
    const status = storageStatus();
    expect(status.antivirus.enabled).toBe(false);
    expect(status.antivirus.disabledReason).toMatch(/stub/i);
  });

  it('enables clamav adapter only when AV_DRIVER=clamav', () => {
    process.env.AV_DRIVER = 'clamav';
    process.env.CLAMAV_HOST = '127.0.0.1';
    const status = storageStatus();
    expect(status.antivirus.enabled).toBe(true);
    expect(status.antivirus.host).toBe('127.0.0.1');
  });

  it('maps inconclusive scans to NOT_APPLICABLE', async () => {
    const { antivirusStatusFromScan } = await import('./index.js');
    expect(antivirusStatusFromScan({ clean: true, infected: false, engine: 'clamav' })).toBe('CLEAN');
    expect(antivirusStatusFromScan({ clean: false, infected: true, engine: 'clamav' })).toBe('INFECTED');
    expect(antivirusStatusFromScan({ clean: false, infected: false, engine: 'stub' })).toBe('NOT_APPLICABLE');
  });
});

describe('describeStoragePutFailure', () => {
  it('classifies access denied without leaking credentials', () => {
    const error = Object.assign(new Error('User: arn:aws:iam::1:user/x is not authorized'), {
      name: 'AccessDenied',
      Code: 'AccessDenied',
    });
    const failure = describeStoragePutFailure(error);
    expect(failure.kind).toBe('access');
    expect(failure.userMessage).toMatch(/recusou o envio/i);
    expect(failure.userMessage).not.toMatch(/arn:aws/);
    expect(storageErrorCode(error)).toBe('AccessDenied');
  });

  it('classifies checksum / NotImplemented as compat', () => {
    const error = Object.assign(new Error('A header you provided implies functionality that is not implemented'), {
      name: 'NotImplemented',
      Code: 'NotImplemented',
    });
    const failure = describeStoragePutFailure(error);
    expect(failure.kind).toBe('compat');
    expect(failure.userMessage).toMatch(/checksum|incompatibilidade/i);
  });

  it('classifies missing config', () => {
    const failure = describeStoragePutFailure(new Error('MinIO/S3 não configurado (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY).'));
    expect(failure.kind).toBe('config');
    expect(failure.userMessage).toMatch(/não está configurado/i);
  });

  it('includes safe error code on unknown failures', () => {
    const error = Object.assign(new Error('something odd'), { name: 'WeirdError' });
    const failure = describeStoragePutFailure(error);
    expect(failure.kind).toBe('unknown');
    expect(failure.userMessage).toContain('WeirdError');
  });
});

describe('checkStorageBucket', () => {
  it('local driver é ok sem rede', async () => {
    delete process.env.STORAGE_DRIVER;
    const result = await checkStorageBucket();
    expect(result.ok).toBe(true);
    expect(result.driver).toBe('local');
  });

  it('s3 sem credenciais fica not ok com motivo de configuração', async () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'clinic-files';
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY;
    delete process.env.S3_SECRET_KEY;
    const result = await checkStorageBucket();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NotConfigured');
    expect(result.bucket).toBe('clinic-files');
  });

  it('endpoint inacessível vira ok=false (não lança)', async () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:1';
    process.env.S3_ACCESS_KEY = 'test-access';
    process.env.S3_SECRET_KEY = 'test-secret';
    process.env.S3_BUCKET = 'clinic-files';
    const result = await checkStorageBucket(1_500);
    expect(result.ok).toBe(false);
    expect(result.endpointHost).toBe('127.0.0.1:1');
    expect(result.detail).not.toContain('test-secret');
  });
});

describe('describeBucketCheckFailure', () => {
  it('404 do HeadBucket = bucket inexistente', () => {
    const error = Object.assign(new Error('UnknownError'), {
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });
    expect(describeBucketCheckFailure(error, 'b1').detail).toContain('não existe');
  });

  it('403 = credencial/permissão', () => {
    const error = Object.assign(new Error('UnknownError'), {
      name: 'Forbidden',
      $metadata: { httpStatusCode: 403 },
    });
    expect(describeBucketCheckFailure(error, 'b1').detail).toContain('credencial');
  });

  it('ECONNREFUSED = endpoint inacessível', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:9000'), { code: 'ECONNREFUSED' });
    expect(describeBucketCheckFailure(error, 'b1').detail).toContain('inacessível');
  });
});
