import { expect, test, type Page } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

const origin = 'https://gagarinbefree.clodocd.com';
const fetchedAt = '2026-10-26T04:00:00Z';
const cacheHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-Weather-Cache, X-Weather-Fetched-At',
  'X-Weather-Cache': 'stale',
  'X-Weather-Fetched-At': fetchedAt,
};

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

/**
 * prepareLocation. Make the device place and forecast calendar deterministic
 *
 * @param page The isolated browser page.
 * @returns A promise that settles after installing device fixtures.
 */
async function prepareLocation(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://api.bigdatacloud.net/**', async (route) => {
    await route.fulfill({
      json: {
        lookupSource: 'coordinates',
        latitude: 58,
        longitude: 56.25,
        city: 'Perm',
        countryCode: 'RU',
        principalSubdivision: 'Perm Region',
      },
    });
  });
}

test('uses a fresh VPS backup before retained primary weather without exposing keys', async ({
  page,
}) => {
  await prepareLocation(page);
  const direct: string[] = [];
  const requests: string[] = [];
  await page.route(
    /https:\/\/api\.(weatherapi\.com|open-meteo\.com|openweathermap\.org)\//,
    async (route) => {
      direct.push(route.request().url());
      await route.abort();
    },
  );
  await page.route(`${origin}/**`, async (route) => {
    requests.push(route.request().url());
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/current.json')) {
      await route.fulfill({ headers: cacheHeaders, json: currentResponse });
    } else if (url.pathname.includes('/open-meteo/') && url.searchParams.has('current')) {
      await route.fulfill({
        json: {
          timezone: 'Asia/Yekaterinburg',
          current: {
            time: Date.UTC(2026, 9, 26, 5) / 1000,
            temperature_2m: 14.2,
            apparent_temperature: 12,
            relative_humidity_2m: 70,
            wind_speed_10m: 12,
            wind_direction_10m: 225,
            pressure_msl: 1012,
            visibility: 10000,
            uv_index: 1,
            weather_code: 3,
            is_day: 1,
          },
        },
      });
    } else await route.fulfill({ status: 503, json: {} });
  });
  await page.goto('./');
  const card = page.locator('.current-weather-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.current-weather-card__temperature')).toContainText(/14[.,]2/);
  await expect(card.locator('.weather-cache-status')).toHaveCount(0);
  expect(direct).toEqual([]);
  for (const request of requests) {
    const url = new URL(request);
    expect(url.origin).toBe(origin);
    expect(url.searchParams.has('key')).toBe(false);
    expect(url.searchParams.has('appid')).toBe(false);
  }
});

test('keeps server snapshot dates on current and daily cards when all fresh sources fail', async ({
  page,
}) => {
  await prepareLocation(page);
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/current.json'))
      await route.fulfill({ headers: cacheHeaders, json: currentResponse });
    else if (url.pathname.endsWith('/forecast.json'))
      await route.fulfill({ headers: cacheHeaders, json: forecastResponse });
    else await route.fulfill({ status: 503, json: {} });
  });
  await page.goto('./');
  const current = page.locator('.current-weather-card');
  await expect(current.locator('.weather-cache-status')).toBeVisible();
  await current.locator('.weather-cache-status summary').click();
  await expect(current.locator('.weather-cache-status time').first()).toHaveAttribute(
    'datetime',
    new Date(fetchedAt).toISOString(),
  );
  const viewport = page.locator('.weather-viewport');
  await expect(viewport).toHaveAttribute('data-grid-rows', '3');
  await viewport.focus();
  await viewport.press('ArrowDown');
  const daily = page.getByRole('article', { name: 'Прогноз на день' });
  await expect(daily.locator('.weather-cache-status')).toBeVisible();
  await daily.locator('.weather-cache-status summary').click();
  await expect(daily.locator('.weather-cache-status time').first()).toHaveAttribute(
    'datetime',
    new Date(fetchedAt).toISOString(),
  );
});

test('does not multiply requests after a shared VPS rate limit', async ({ page }) => {
  await prepareLocation(page);
  let requests = 0;
  await page.route(`${origin}/**`, async (route) => {
    requests++;
    await route.fulfill({
      status: 429,
      headers: { 'Retry-After': '1' },
      json: { code: 'RateLimited' },
    });
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(requests).toBe(1);
});
