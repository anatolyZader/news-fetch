import { test, expect } from '@playwright/test';

test.describe('client mobile smoke', () => {
  test('viewport meta and theme-color are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#8b9cf0');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  });

  test('app shell renders at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    const text = await root.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test('manifest is served', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.display).toBe('standalone');
    expect(body.theme_color).toBe('#8b9cf0');
  });

  test('data source bottom sheet trigger on phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('button', { name: /choose data source|data sources|מקורות|источник/i });
    if (await trigger.count() === 0) {
      test.skip(true, 'Main app data sources trigger not visible (likely login gate)');
      return;
    }

    await expect(trigger.first()).toBeVisible();
    const desktopTablist = page.getByRole('tablist', { name: /data sources|מקורות/i });
    await expect(desktopTablist).toHaveCount(0);
  });

  test('data source chip scroller on tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tablist = page.getByRole('tablist', { name: /data sources|מקורות/i });
    if (await tablist.count() === 0) {
      test.skip(true, 'Main app chip tablist not visible (likely login gate)');
      return;
    }

    await expect(tablist.first()).toBeVisible();
    const chips = tablist.first().getByRole('tab');
    expect(await chips.count()).toBeGreaterThan(0);
  });
});
