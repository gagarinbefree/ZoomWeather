import { expect, test } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

test('shows A1 while forecast is pending and prioritizes the swiped day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requestedDays: number[] = [];
  let releaseToday: (() => void) | undefined;
  let releaseTomorrow: (() => void) | undefined;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      await route.fulfill({ json: currentResponse });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    async (route) => {
      const depth = Number(new URL(route.request().url()).searchParams.get('days'));
      requestedDays.push(depth);
      if (depth === 1) {
        await new Promise<void>((resolve) => {
          releaseToday = resolve;
        });
      }
      if (depth === 3) {
        await new Promise<void>((resolve) => {
          releaseTomorrow = resolve;
        });
      }
      try {
        await route.fulfill({
          json: {
            forecast: { forecastday: forecastResponse.forecast.forecastday.slice(0, depth) },
          },
        });
      } catch {
        // The request can be cancelled when the next day takes priority.
      }
    },
  );
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });

  await page.goto('./');
  const currentCard = page.getByRole('article', { name: 'Текущая погода' });
  await expect(currentCard).toBeVisible();
  await expect(currentCard).toContainText('Восход');
  await expect(currentCard).toContainText('Закат');
  await expect(currentCard).not.toContainText('07:45');
  const currentBackground = await currentCard.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const currentHeader = await currentCard
    .locator('header')
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  const currentTypography = await currentCard
    .locator('.current-weather-card__temperature')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
    });
  await expect(
    page.getByRole('article', { name: 'Текущая погода' }).locator('.current-weather-card__date'),
  ).toHaveText('понедельник, 26 окт.');
  await expect.poll(() => requestedDays).toContain(1);
  const viewport = page.getByRole('region', { name: 'Навигация по прогнозу' });
  await expect(viewport).toHaveAttribute('data-grid-rows', '16');
  await expect(viewport.locator('[data-cell-id="2026-10-27/daily"]')).toHaveCount(1);
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-row', '1');
  await expect(viewport.locator('[data-cell-id="2026-10-27/daily"] .spinner-border')).toBeVisible();
  await expect.poll(() => requestedDays).toContain(3);
  releaseToday?.();
  releaseTomorrow?.();
  const dailyCard = page.getByRole('article', { name: 'Прогноз на день' });
  await expect(dailyCard).toContainText('Завтра');
  await expect(
    page.getByRole('article', { name: 'Прогноз на день' }).locator('.forecast-weather-card__date'),
  ).toHaveText('вторник, 27 окт.');
  await expect(dailyCard).toContainText('10°C');
  expect(await dailyCard.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    currentBackground,
  );
  expect(
    await dailyCard
      .locator('header')
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toBe(currentHeader);
  expect(
    await dailyCard.locator('.forecast-weather-card__temperature').evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
    }),
  ).toEqual(currentTypography);
  await expect(dailyCard).toContainText('07:47');
  await expect(dailyCard).toContainText('17:26');
  await viewport.press('ArrowUp');
  await expect(viewport).toHaveAttribute('data-row', '0');
  await expect(currentCard).toContainText('07:45');
  await expect(currentCard).toContainText('17:28');
});

test('allows navigation to the last day returned by Open Meteo', async ({ page }) => {
  test.slow();
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
      const depth = Number(new URL(route.request().url()).searchParams.get('days'));
      await route.fulfill({
        json: { forecast: { forecastday: forecastResponse.forecast.forecastday.slice(0, depth) } },
      });
    },
  );
  let extendedRequests = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/open-meteo/v1/forecast?**',
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('forecast_days') !== '16') {
        await route.fulfill({ status: 503, json: {} });
        return;
      }
      extendedRequests++;
      const dates = Array.from({ length: 16 }, (_, index) => index);
      const dailyTime = dates.map((index) => Date.UTC(2026, 9, 25 + index, 19) / 1000);
      const hourlyTime = dates.map((index) => Date.UTC(2026, 9, 26 + index, 7) / 1000);
      await route.fulfill({
        json: {
          timezone: 'Asia/Yekaterinburg',
          utc_offset_seconds: 18000,
          hourly: {
            time: hourlyTime,
            temperature_2m: dates.map(() => 9),
            apparent_temperature: dates.map(() => 7),
            relative_humidity_2m: dates.map(() => 70),
            wind_speed_10m: dates.map(() => 12),
            wind_direction_10m: dates.map(() => 225),
            pressure_msl: dates.map(() => 1012),
            visibility: dates.map(() => 10000),
            uv_index: dates.map(() => 1),
            weather_code: dates.map(() => 3),
            is_day: dates.map(() => 1),
            precipitation_probability: dates.map(() => 40),
          },
          daily: {
            time: dailyTime,
            temperature_2m_max: dates.map(() => 12),
            temperature_2m_min: dates.map(() => 4),
            relative_humidity_2m_mean: dates.map(() => 75),
            wind_speed_10m_max: dates.map(() => 18),
            precipitation_probability_max: dates.map(() => 60),
            uv_index_max: dates.map(() => 2),
            weather_code: dates.map(() => 3),
            sunrise: dates.map((index) => Date.UTC(2026, 9, 26 + index, 2, 45) / 1000),
            sunset: dates.map((index) => Date.UTC(2026, 9, 26 + index, 12, 30) / 1000),
          },
        },
      });
    },
  );
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });

  await page.goto('./');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  await expect.poll(() => extendedRequests, { timeout: 15_000 }).toBe(1);
  const viewport = page.getByRole('region', { name: 'Навигация по прогнозу' });
  await viewport.focus();
  for (let row = 1; row < 16; row++) {
    await viewport.press('ArrowDown');
    await expect(viewport).toHaveAttribute('data-row', String(row));
  }
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-11-10/daily');
  await expect(page.getByRole('article', { name: 'Прогноз на день' })).toBeVisible();
});
