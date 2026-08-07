import { afterEach, describe, expect, it } from 'vitest';
import { createStorageAdapter, storageStatus } from './index';

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
});
