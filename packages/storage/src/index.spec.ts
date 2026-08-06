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
});
