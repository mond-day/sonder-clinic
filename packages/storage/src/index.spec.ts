import { afterEach, describe, expect, it } from 'vitest';
import {
  createStorageAdapter,
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

  it('enables minio adapter only with credentials', () => {
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
    const enabled = createStorageAdapter();
    expect(enabled.enabled).toBe(true);
    expect(storageStatus().storage.driver).toBe('minio');
    expect(storageStatus().storage.enabled).toBe(true);
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
