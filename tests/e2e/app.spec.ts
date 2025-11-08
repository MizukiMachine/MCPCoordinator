import { test, expect } from '@playwright/test';

test('renders scenario selector and header', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Realtime API Agents')).toBeVisible();

  const scenarioSelect = page.locator('select').first();
  await expect(scenarioSelect).toBeVisible();

  const scenarioOptions = await scenarioSelect.locator('option').all();
  expect(scenarioOptions.length).toBeGreaterThanOrEqual(3);
});
