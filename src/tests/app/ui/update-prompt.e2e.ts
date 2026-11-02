import { expect, test } from '@/tests/shared/lib/browser-test';
import { themeRgbColor } from '@/tests/shared/themes/theme-color';
import type { Direction } from 'tikitaki';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';
import { swipe } from '@/tests/widgets/weather-grid/swipe-scenarios';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58.0047, longitude: 56.2514 } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      await route.fulfill({ json: currentResponse });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    async (route) => {
      await route.fulfill({ json: forecastResponse });
    },
  );
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
});

for (const direction of ['left', 'right', 'up', 'down'] as const satisfies readonly Direction[]) {
  test(`returns to current weather after dismissing the update by swiping ${direction}`, async ({
    page,
  }) => {
    let releaseUpdate: (() => void) | undefined;
    await page.route(
      'https://api.github.com/repos/gagarinbefree/ZoomWeather/releases/latest',
      async (route) => {
        await new Promise<void>((resolve) => {
          releaseUpdate = resolve;
        });
        await route.fulfill({ json: { tag_name: 'v999.0.0' } });
      },
    );
    await page.goto('./src/tests/app/ui/fixtures/index.html');
    const viewport = page.locator('.weather-viewport');
    await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
    await expect(viewport).toHaveAttribute('data-grid-rows', '3');
    await viewport.focus();
    await viewport.press('ArrowDown');
    await expect(viewport).toHaveAttribute('data-row', '1');
    await expect.poll(() => Boolean(releaseUpdate)).toBe(true);
    releaseUpdate?.();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeVisible();
    const screen = page.viewportSize();
    expect(await dialog.boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: screen?.width,
      height: screen?.height,
    });
    await expect(dialog.locator('.pwa-update__card')).toHaveCSS(
      'background-color',
      themeRgbColor('Weather.ClearDay.Forecast'),
    );
    await expect(dialog.locator('.pwa-update__logo')).toHaveCSS('opacity', '0.055');
    await expect(dialog.locator('[data-action="update"]')).toBeFocused();
    await swipe(page, direction);
    await expect(dialog).toHaveCount(0);
    await expect(viewport).toHaveAttribute('data-row', '0');
    await expect(viewport).toHaveAttribute('data-column', '3');
    await expect(viewport).toBeFocused();
    await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  });
}

test('fits a small phone and traps keyboard focus until Cancel returns to current weather', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(
    'https://api.github.com/repos/gagarinbefree/ZoomWeather/releases/latest',
    async (route) => {
      await route.fulfill({ json: { tag_name: 'v999.0.0' } });
    },
  );
  await page.goto('./src/tests/app/ui/fixtures/index.html');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const update = dialog.locator('[data-action="update"]');
  const cancel = dialog.getByRole('button', { name: 'Отмена' });
  await expect(update).toBeInViewport({ ratio: 1 });
  await expect(cancel).toBeInViewport({ ratio: 1 });
  expect((await cancel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await update.focus();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.weather-viewport')).toHaveAttribute('data-column', '3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
