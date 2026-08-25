import { expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const email = process.env.E2E_EMAIL ?? 'admin@sonder.local';
export const password = process.env.E2E_PASSWORD ?? 'Sonder@123';
export const API_URL = process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const AUTH_FILE = join(__dirname, '.auth', 'admin.json');

export async function loginViaUi(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
}

export async function openFirstPatient(page: Page) {
  await page.goto('/pacientes');
  const link = page.locator('a[href^="/pacientes/"]').first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page.getByRole('tablist', { name: /abas do prontuário/i })).toBeVisible({ timeout: 15_000 });
}

export async function openPatientChartTab(page: Page, name: string | RegExp) {
  await page.getByRole('tablist', { name: /abas do prontuário/i }).getByRole('tab', { name }).click();
}

export function ensureAuthDir() {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
}

export function bearerHeaders(): Record<string, string> {
  const state = JSON.parse(readFileSync(AUTH_FILE, 'utf8')) as {
    cookies?: Array<{ name: string; value: string }>;
  };
  const token = state.cookies?.find((cookie) => cookie.name === 'access_token')?.value ?? '';
  if (token.length < 20) {
    throw new Error('access_token ausente em e2e/.auth/admin.json — o projeto setup precisa rodar antes.');
  }
  return {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}
