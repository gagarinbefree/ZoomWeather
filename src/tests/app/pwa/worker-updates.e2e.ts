import { expect, test } from '@/tests/shared/lib/browser-test';
import { startVersionedSite } from '@/tests/app/pwa/lib/versioned-site';

for (const installed of [false, true]) {
  test(`updates a cached ${installed ? 'installed PWA after approval' : 'browser tab automatically'}`, async ({
    page,
  }) => {
    const site = await startVersionedSite();
    try {
      await page.route('https://gagarinbefree.clodocd.com/**', (route) =>
        route.fulfill({ status: 503, json: {} }),
      );
      await page.route('https://get.geojs.io/**', (route) =>
        route.fulfill({ status: 503, json: {} }),
      );
      if (installed)
        await page.addInitScript(() =>
          Object.defineProperty(navigator, 'standalone', { value: true }),
        );
      await page.goto(site.url);
      await page.evaluate(async () => navigator.serviceWorker.ready);
      await page.reload();
      await expect
        .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
        .toBe(true);
      const version = page.locator('meta[name="test-release"]');
      await expect(version).toHaveAttribute('content', '1');
      site.publish();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      if (installed) {
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
        await expect(version).toHaveAttribute('content', '1');
        await page.locator('[data-action="update"]').click();
      }
      await expect(version).toHaveAttribute('content', '2', { timeout: 15000 });
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } finally {
      await page.goto('about:blank');
      await site.close();
    }
  });
}
