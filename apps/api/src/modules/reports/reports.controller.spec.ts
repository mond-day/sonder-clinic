import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsController } from './reports.controller';
import { REPORT_CATALOG, ReportsService } from './reports.service';

describe('ReportsController domain auth (P0.1)', () => {
  const reports = {
    catalog: vi.fn(() => REPORT_CATALOG),
    run: vi.fn(async () => ({ format: 'json', meta: {}, rows: [], total: 0 })),
  } as unknown as ReportsService;

  let controller: ReportsController;
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
  };

  beforeEach(() => {
    controller = new ReportsController(reports);
    vi.clearAllMocks();
  });

  function req(permissions: string[]) {
    return {
      auth: { organizationId: 'org-1', userId: 'user-1', permissions },
    } as never;
  }

  it('rejeita reportId inexistente', async () => {
    await expect(
      controller.run(req(['report.view_clinical']), 'does-not-exist', {}, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clínico não acessa relatório financeiro', async () => {
    await expect(
      controller.run(req(['report.view_clinical']), 'receivables', {}, res as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('financeiro não acessa relatório clínico', async () => {
    await expect(
      controller.run(req(['report.view_financial']), 'appointments', {}, res as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite acesso com permissão exata do domínio', async () => {
    await controller.run(req(['report.view_financial']), 'receivables', {}, res as never);
    expect(reports.run).toHaveBeenCalled();
  });

  it('report.export sozinho não amplia domínio financeiro', async () => {
    await expect(
      controller.run(req(['report.export']), 'expenses', { format: 'csv' }, res as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('catalog filtra por domínio do usuário', () => {
    const items = controller.catalog(req(['report.view_clinical']));
    expect(items.every((item) => item.permission === 'report.view_clinical')).toBe(true);
    expect(items.some((item) => item.id === 'receivables')).toBe(false);
  });
});
