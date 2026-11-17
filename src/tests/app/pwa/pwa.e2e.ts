import { expect, test } from '@/tests/shared/lib/browser-test';

test('exposes an installable manifest scoped to GitHub Pages', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('ZoomWeather');
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestUrl).toBeTruthy();
  const response = await page.request.get(new URL(manifestUrl ?? '', page.url()).toString());
  expect(response.ok()).toBe(true);
  const manifest: unknown = await response.json();
  expect(manifest).toMatchObject({
    name: 'ZoomWeather',
    short_name: 'ZoomWeather',
    id: '/ZoomWeather/',
    start_url: '/ZoomWeather/',
    scope: '/ZoomWeather/',
    display: 'standalone',
  });
  const icons = (manifest as { icons: { sizes: string }[] }).icons;
  expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});

test('opens the application shell after the network goes offline', async ({ page, context }) => {
  await page.route('https://157.22.180.167:8443/api/weatherapi/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://157.22.180.167:8443/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://157.22.180.167:8443/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://get.geojs.io/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main', { name: /weather|погода/i })).toBeVisible();
});
