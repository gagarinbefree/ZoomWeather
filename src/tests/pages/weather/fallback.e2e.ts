import { expect, test } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

test('shows Open Meteo current weather as the primary source', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'ru' });
  });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      await route.fulfill({ status: 503, json: {} });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    async (route) => {
      await route.fulfill({ json: forecastResponse });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/open-meteo/v1/forecast?**',
    async (route) => {
      await route.fulfill({
        json: {
          timezone: 'Asia/Yekaterinburg',
          current: {
            time: Date.UTC(2026, 9, 26, 7) / 1000,
            temperature_2m: 9,
            apparent_temperature: 7,
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
    },
  );
  await page.goto('./');
  const current = page.getByRole('article', { name: 'Текущая погода' });
  await expect(current).toBeVisible();
  await expect(current).toContainText('9°C');
  await expect(current).toContainText('Пасмурно');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('shows OpenWeatherMap current weather after both earlier providers fail', async ({ page }) => {
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      await route.fulfill({ status: 503, json: {} });
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
  await page.route(
    'https://gagarinbefree.clodocd.com/api/openweathermap/data/2.5/weather?**',
    async (route) => {
      await route.fulfill({
        json: {
          name: 'Пермь',
          dt: Date.UTC(2026, 9, 26, 7) / 1000,
          main: { temp: 8, feels_like: 6, humidity: 70, pressure: 1012 },
          wind: { speed: 3, deg: 225 },
          visibility: 10000,
          weather: [{ id: 803, description: 'пасмурно', icon: '04d' }],
          sys: { country: 'RU' },
        },
      });
    },
  );
  await page.goto('./');
  const current = page.getByRole('article', { name: 'Текущая погода' });
  await expect(current).toBeVisible();
  await expect(current).toContainText('Пермь');
  await expect(current).toContainText('8°C');
  await expect(current).toContainText('Нет данных');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('uses the available three hour OpenWeatherMap forecast after both forecast failures', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-26T15:30:00Z'));
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
      await route.fulfill({ status: 503, json: {} });
    },
  );
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/openweathermap/data/2.5/weather?**',
    async (route) => {
      await route.fulfill({
        json: {
          name: 'Пермь',
          dt: Date.UTC(2026, 9, 26, 7) / 1000,
          main: { temp: 8, feels_like: 6, humidity: 70, pressure: 1012 },
          wind: { speed: 3, deg: 225 },
          weather: [{ id: 803, description: 'пасмурно', icon: '04d' }],
          sys: {
            country: 'RU',
            sunrise: Date.UTC(2026, 9, 26, 2, 45) / 1000,
            sunset: Date.UTC(2026, 9, 26, 12, 30) / 1000,
          },
        },
      });
    },
  );
  let forecastRequests = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/openweathermap/data/2.5/forecast?**',
    async (route) => {
      forecastRequests++;
      await route.fulfill({
        json: {
          list: [26, 27, 28].map((day) => ({
            dt: Date.UTC(2026, 9, day, day === 26 ? 16 : 7) / 1000,
            main: { temp: 8, feels_like: 6, humidity: 75, pressure: 1011 },
            wind: { speed: 4, deg: 180 },
            pop: 0.4,
            weather: [{ id: 500, description: 'небольшой дождь', icon: '10d' }],
          })),
        },
      });
    },
  );

  await page.goto('./');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  const viewport = page.getByRole('region', { name: 'Навигация по прогнозу' });
  await expect(
    viewport.locator(`[data-cell-id="2026-10-26/hour/${String(Date.UTC(2026, 9, 26, 16))}"]`),
  ).toHaveCount(1);
  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(page.getByRole('article', { name: 'Почасовой прогноз' })).toContainText('21:00');
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-row', '1');
  await expect(page.getByRole('article', { name: 'Прогноз на день' })).toContainText('Завтра');
  await expect(page.getByRole('article', { name: 'Прогноз на день' })).toContainText('Нет данных');
  await viewport.press('ArrowRight');
  await expect(page.getByRole('article', { name: 'Почасовой прогноз' })).toContainText(
    'Небольшой дождь',
  );
  expect(forecastRequests).toBeGreaterThanOrEqual(1);
});
