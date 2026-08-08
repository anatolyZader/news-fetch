import { test, expect } from '@playwright/test';
import { seedTodayReport } from './fixtures/seed-today-report.mjs';

test.describe('user golden path', () => {
  test.beforeAll(() => {
    seedTodayReport();
  });

  test('daily assessment, report sidebar, data sources', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'desktop golden path only');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /^Sign in$/i })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: /Daily assessment/i })).toBeVisible({
      timeout: 20_000,
    });

    const reportContents = page.getByRole('complementary', { name: /Report contents/i });
    await expect(reportContents).toBeVisible();
    await expect(reportContents.getByRole('button', { name: /narrative/i })).toBeVisible();

    const dataSourcesTablist = page.getByRole('tablist', { name: /Data sources/i });
    await expect(dataSourcesTablist).toBeVisible();
    await expect(dataSourcesTablist.getByRole('tab').first()).toBeVisible();
  });
});
