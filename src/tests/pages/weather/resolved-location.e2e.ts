import { expect, test } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

test('shows saved weather while resolving city and country before requesting fresh weather', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  let currentRequests = 0;
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://gagarinbefree.clodocd.com/api/weatherapi/v1/**', async (route) => {
    const current = route.request().url().includes('current.json');
    if (current) currentRequests++;
    await route.fulfill({ json: current ? currentResponse : forecastResponse });
  });
  await page.goto('./');
  await expect(page.locator('.current-weather-card')).toBeVisible();
  await expect(page.locator('.weather-viewport')).toHaveAttribute('data-grid-rows', '3');
  const beforeReload = currentRequests;
  let release: (() => void) | undefined;
  await page.route('https://api.bigdatacloud.net/**', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      json: {
        latitude: 58,
        longitude: 56.25,
        lookupSource: 'coordinates',
        city: 'Пермь',
        countryCode: 'RU',
      },
    });
  });
  await page.reload();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator('.current-weather-card')).toBeVisible();
  await expect(page.locator('.current-weather-card .weather-cache-status')).toBeVisible();
  await expect(page.locator('.current-weather-card')).toContainText('8,9°C');
  expect(currentRequests).toBe(beforeReload);
  release?.();
  await expect.poll(() => currentRequests).toBe(beforeReload + 1);
  await expect(page.locator('.current-weather-card .weather-cache-status')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('shows a location error instead of weather when the city cannot be identified', async ({
  page,
}) => {
  let weatherRequests = 0;
  await page.route('https://gagarinbefree.clodocd.com/**', async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/location/')) {
      await route.fulfill({ status: 503, json: {} });
      return;
    }
    weatherRequests++;
    await route.fulfill({ json: currentResponse });
  });
  await page.route('https://api.bigdatacloud.net/**', async (route) => {
    await route.fulfill({
      json: { latitude: 58, longitude: 56.25, lookupSource: 'coordinates', countryCode: 'RU' },
    });
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.current-weather-card')).toHaveCount(0);
  await expect(page.locator('.forecast-weather-card')).toHaveCount(0);
  expect(weatherRequests).toBe(0);
});
