import { expect, test, type Page } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';
import { swipe } from '@/tests/widgets/weather-grid/swipe-scenarios';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

/**
 * mapHour. Create an OpenWeatherMap forecast reading for a test day
 *
 * @param index The local day offset from the fixed opening date.
 * @returns One lower resolution OpenWeatherMap forecast reading.
 */
function mapHour(index: number): object {
  return {
    dt: Date.UTC(2026, 9, 26 + index, 7) / 1000,
    main: { temp: 8, feels_like: 6, humidity: 75, pressure: 1011 },
    wind: { speed: 4, deg: 180 },
    visibility: 9000,
    pop: 0.4,
    weather: [{ id: 500, description: 'небольшой дождь', icon: '10d' }],
  };
}

/**
 * settleFrames. Wait for the swipe animation and Vue updates to finish
 *
 * @param page The browser page after a completed navigation transition.
 * @returns A promise that resolves after the engine and Vue finish one transition.
 */
async function settleFrames(page: Page): Promise<void> {
  await page.waitForTimeout(350);
}

test('keeps detailed hours and unique days when the longer fallback arrives during navigation', async ({
  page,
  isMobile,
}) => {
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
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/openweathermap/data/2.5/weather?**',
    async (route) => {
      await route.fulfill({
        json: {
          name: 'Perm',
          dt: Date.UTC(2026, 9, 26, 7) / 1000,
          timezone: 18000,
          main: { temp: 8, feels_like: 6, humidity: 75, pressure: 1011 },
          wind: { speed: 4, deg: 180 },
          visibility: 9000,
          weather: [{ id: 500, description: 'небольшой дождь', icon: '10d' }],
          sys: {
            country: 'RU',
            sunrise: Date.UTC(2026, 9, 26, 2, 45) / 1000,
            sunset: Date.UTC(2026, 9, 26, 12, 30) / 1000,
          },
        },
      });
    },
  );
  let fallbackRequests = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/openweathermap/data/2.5/forecast?**',
    async (route) => {
      fallbackRequests++;
      await route.fulfill({
        json: { list: Array.from({ length: 6 }, (_, index) => mapHour(index)) },
      });
    },
  );

  await page.goto('./');
  const viewport = page.getByRole('region', { name: 'Навигация по прогнозу' });
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  await expect.poll(() => fallbackRequests).toBe(1);
  await settleFrames(page);
  await viewport.focus();

  for (let row = 1; row < 6; row++) {
    await viewport.press('ArrowDown');
    const date = new Date(Date.UTC(2026, 9, 26 + row)).toISOString().slice(0, 10);
    await expect(viewport).toHaveAttribute('data-active-cell', `${date}/daily`);
    await expect(viewport.locator('[data-tikitaki-role="current"] [data-cell-id]')).toHaveAttribute(
      'data-cell-id',
      `${date}/daily`,
    );
    await expect(viewport.locator('[data-tikitaki-role="current"] time')).toHaveAttribute(
      'datetime',
      date,
    );
    await settleFrames(page);
  }

  for (let row = 4; row >= 1; row--) {
    await viewport.press('ArrowUp');
    await expect(viewport).toHaveAttribute('data-row', String(row));
    await settleFrames(page);
  }
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute(
    'data-active-cell',
    `2026-10-27/hour/${String(Date.UTC(2026, 9, 27, 7))}`,
  );
  await expect(
    viewport.locator('[data-tikitaki-role="current"] .forecast-weather-card__temperature'),
  ).toHaveText('9,5°C');
  await swipe(page, 'up');
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-10-28/daily');
  await swipe(page, 'left');
  await expect(viewport).toHaveAttribute(
    'data-active-cell',
    `2026-10-28/hour/${String(Date.UTC(2026, 9, 28, 7))}`,
  );
  await expect(
    viewport.locator('[data-tikitaki-role="current"] .forecast-weather-card__temperature'),
  ).toHaveText('9,5°C');
  if (!isMobile) {
    const bounds = await viewport.boundingBox();
    if (!bounds) throw new Error('Missing weather viewport');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 650);
    await expect(viewport).toHaveAttribute('data-active-cell', '2026-10-29/daily');
    await expect(viewport.locator('[data-tikitaki-role="current"] time')).toHaveAttribute(
      'datetime',
      '2026-10-29',
    );
  }
});
