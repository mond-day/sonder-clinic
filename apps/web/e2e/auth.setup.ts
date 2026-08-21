import { test as setup } from '@playwright/test';
import { AUTH_FILE, ensureAuthDir, loginViaUi } from './helpers';

setup('authenticate', async ({ page }) => {
  ensureAuthDir();
  await loginViaUi(page);
  await page.context().storageState({ path: AUTH_FILE });
});
