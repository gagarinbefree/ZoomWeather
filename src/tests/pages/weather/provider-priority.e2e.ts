import { expect, test } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

const origin = 'https://gagarinbefree.clodocd.com';
test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

test('uses Open Meteo for current daily and hourly weather while healthy backups are available', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'ru' });
  });
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
  let backupRequests = 0;
  const requestedDays: number[] = [];
  await page.route(`${origin}/api/weatherapi/**`, async (route) => {
    backupRequests++;
    await route.fulfill({
      json: route.request().url().includes('current.json') ? currentResponse : forecastResponse,
    });
  });
  await page.route(`${origin}/api/openweathermap/**`, async (route) => {
    backupRequests++;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route(`${origin}/api/open-meteo/v1/forecast?**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('current')) {
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
            weather_code: 0,
            is_day: 1,
          },
        },
      });
      return;
    }
    const count = Number(url.searchParams.get('forecast_days'));
    requestedDays.push(count);
    const days = Array.from({ length: count }, (_, index) => index);
    const hours = days.flatMap((day) =>
      [7, 9].map((hour) => Date.UTC(2026, 9, 26 + day, hour) / 1000),
    );
    await route.fulfill({
      json: {
        timezone: 'Asia/Yekaterinburg',
        utc_offset_seconds: 18000,
        hourly: {
          time: hours,
          temperature_2m: hours.map(() => 13.4),
          apparent_temperature: hours.map(() => 12),
          relative_humidity_2m: hours.map(() => 70),
          wind_speed_10m: hours.map(() => 12),
          wind_direction_10m: hours.map(() => 225),
          pressure_msl: hours.map(() => 1012),
          visibility: hours.map(() => 10000),
          uv_index: hours.map(() => 1),
          weather_code: hours.map(() => 1),
          is_day: hours.map(() => 1),
          precipitation_probability: hours.map(() => 10),
        },
        daily: {
          time: days.map((day) => Date.UTC(2026, 9, 25 + day, 19) / 1000),
          temperature_2m_max: days.map(() => 15),
          temperature_2m_min: days.map(() => 7),
          relative_humidity_2m_mean: days.map(() => 70),
          wind_speed_10m_max: days.map(() => 12),
          precipitation_probability_max: days.map(() => 10),
          uv_index_max: days.map(() => 2),
          weather_code: days.map(() => 0),
          sunrise: days.map((day) => Date.UTC(2026, 9, 26 + day, 2, 45) / 1000),
          sunset: days.map((day) => Date.UTC(2026, 9, 26 + day, 12, 30) / 1000),
        },
      },
    });
  });
  await page.goto('./');
  const current = page.locator('.current-weather-card');
  await expect(current).toBeVisible();
  await expect(current.locator('.current-weather-card__temperature')).toHaveText('14,2°C');
  await expect(current.locator('[data-weather-icon]')).toHaveAttribute(
    'data-weather-icon',
    'WeatherSunny',
  );
  const viewport = page.locator('.weather-viewport');
  await expect.poll(() => requestedDays).toContain(16);
  await expect(viewport).toHaveAttribute('data-grid-rows', '16');
  await expect(viewport.locator('.forecast-weather-card').first()).toBeAttached();
  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(page.getByRole('article', { name: 'Почасовой прогноз' })).toContainText('13,4°C');
  const hourly = page.getByRole('article', { name: 'Почасовой прогноз' });
  await expect(hourly).toContainText('Преимущественно ясно');
  await expect
    .poll(() => hourly.evaluate((card) => getComputedStyle(card, '::before').backgroundImage))
    .toMatch(/\/clear-[^/]+\.webp/);
  await viewport.press('ArrowDown');
  await expect(page.getByRole('article', { name: 'Прогноз на день' })).toContainText('15°C');
  expect(backupRequests).toBe(0);
});
