import { expect, test, type Locator } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { historyFixture } from '@/tests/entities/weather/api/history-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

interface CardBlockAppearance {
  readonly selector: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly color: string;
  readonly background: string;
}

/**
 * cardAppearance. Read the layout and styles of the main weather blocks
 *
 * @param card The visible weather card.
 * @returns The position size and appearance of its main blocks.
 */
async function cardAppearance(card: Locator): Promise<readonly CardBlockAppearance[]> {
  return card.evaluate((article) => {
    const origin = article.getBoundingClientRect();
    return [
      'header',
      '[data-weather-icon]',
      '[class$="__temperature"]',
      '[class$="__condition"]',
      'dl',
    ].map((selector) => {
      const block = article.querySelector(selector);
      if (!(block instanceof HTMLElement)) throw new Error(`Missing card block ${selector}`);
      const bounds = block.getBoundingClientRect();
      const style = getComputedStyle(block);
      return {
        selector,
        top: Math.round((bounds.top - origin.top) * 100) / 100,
        left: Math.round((bounds.left - origin.left) * 100) / 100,
        width: bounds.width,
        height: bounds.height,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        background: style.background,
      };
    });
  });
}

test('shows the last forecast immediately after an offline restart', async ({ page, context }) => {
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
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });

  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/v1/archive?**', (route) =>
    route.fulfill({
      json: historyFixture(new URL(route.request().url()).searchParams.get('start_date') ?? ''),
    }),
  );

  await page.goto('./');
  await expect
    .poll(
      async () => {
        const raw: unknown = await page.evaluate(() =>
          localStorage.getItem('zoomweather.weather.v1'),
        );
        if (typeof raw !== 'string') return 0;
        const saved: unknown = JSON.parse(raw);
        if (typeof saved !== 'object' || saved === null || !('forecast' in saved)) return 0;
        const forecast = saved.forecast;
        if (typeof forecast !== 'object' || forecast === null || !('days' in forecast)) return 0;
        return Array.isArray(forecast.days) ? forecast.days.length : 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(3);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  const current = page.getByRole('article', { name: 'Текущая погода' });
  const daily = page.getByRole('article', { name: 'Прогноз на день' });
  const hourly = page.getByRole('article', { name: 'Почасовой прогноз' });
  const viewport = page.getByRole('region', { name: 'Навигация по прогнозу' });
  await expect(current.locator('details')).toHaveCount(0);
  await expect(current).toContainText('07:45');
  await page.evaluate(async () => document.fonts.ready);
  const liveCurrent = await cardAppearance(current);
  await expect(viewport).toHaveAttribute('data-grid-rows', '5');
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-row', '3');
  await expect(daily).toContainText('07:47');
  const liveDaily = await cardAppearance(daily);
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute(
    'data-active-cell',
    `2026-10-27/hour/${String(Date.UTC(2026, 9, 27, 7))}`,
  );
  await expect(hourly).toContainText('9,5°C');
  const liveHourly = await cardAppearance(hourly);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved: unknown = JSON.parse(localStorage.getItem('zoomweather.weather.v1') ?? '{}');
        return typeof saved === 'object' &&
          saved !== null &&
          'history' in saved &&
          Array.isArray(saved.history)
          ? saved.history.length
          : 0;
      }),
    )
    .toBe(2);
  await context.setOffline(true);
  await page.reload();
  await expect(current).toContainText('8,9°C');
  await page.evaluate(async () => document.fonts.ready);
  const offlinePattern = await current.evaluate(async (article) => {
    const background = getComputedStyle(article, '::before').backgroundImage;
    const image = await createImageBitmap(await (await fetch(background.slice(5, -2))).blob());
    return { width: image.width, height: image.height };
  });
  expect(offlinePattern).toEqual({ width: 338, height: 275 });
  expect(await cardAppearance(current)).toEqual(liveCurrent);
  await expect(current.locator('.weather-cache-status__icon')).toBeVisible();
  const toggleBounds = await current.locator('summary').boundingBox();
  const iconBounds = await current.locator('.weather-cache-status__icon').boundingBox();
  if (!toggleBounds || !iconBounds) throw new Error('Missing cache toggle bounds');
  expect(iconBounds.x - toggleBounds.x).toBeCloseTo((toggleBounds.width - iconBounds.width) / 2, 1);
  expect(iconBounds.y - toggleBounds.y).toBeCloseTo(
    (toggleBounds.height - iconBounds.height) / 2,
    1,
  );
  await current.locator('summary').click();
  await expect(current.getByRole('status')).toContainText('Сохранённый прогноз от');
  await expect(current.getByRole('button', { name: 'Повторить' })).toBeVisible();
  expect(await cardAppearance(current)).toEqual(liveCurrent);
  await page.screenshot({ path: test.info().outputPath('cached-current-details.png') });
  await current.locator('summary').press('Escape');
  await expect(current.getByRole('status')).toBeHidden();
  await viewport.focus();
  await page.screenshot({ path: test.info().outputPath('cached-current.png') });
  await expect(viewport).toHaveAttribute('data-grid-rows', '5');
  await expect(viewport.locator('[data-cell-id="2026-10-27/daily"]')).toHaveCount(1);
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-row', '3');
  await expect(daily).toContainText('Завтра');
  expect(await cardAppearance(daily)).toEqual(liveDaily);
  await daily.locator('summary').focus();
  await daily.locator('summary').press('Enter');
  await expect(daily.getByRole('status')).toContainText('Сохранённый прогноз от');
  expect(await cardAppearance(daily)).toEqual(liveDaily);
  await daily.locator('summary').press('Escape');
  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute(
    'data-active-cell',
    `2026-10-27/hour/${String(Date.UTC(2026, 9, 27, 7))}`,
  );
  await expect(hourly).toContainText('9,5°C');
  expect(await cardAppearance(hourly)).toEqual(liveHourly);
  await hourly.locator('summary').click();
  await expect(hourly.getByRole('status')).toContainText('Сохранённый прогноз от');
  expect(await cardAppearance(hourly)).toEqual(liveHourly);
  await hourly.locator('summary').press('Escape');
  await viewport.focus();
  await viewport.press('ArrowUp');
  await expect(current).toBeVisible();
  await viewport.press('ArrowUp');
  const yesterday = page.getByRole('article', { name: 'Вчера', exact: true });
  await expect(yesterday).toContainText('2,3 мм');
  await expect(yesterday.locator('.weather-cache-status__icon')).toBeVisible();
  await viewport.press('ArrowUp');
  const year = page.getByRole('article', { name: 'Год назад', exact: true });
  await expect(year.locator('time').first()).toHaveAttribute('datetime', '2025-10-26');
  await expect(year.locator('.weather-cache-status__icon')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('cached-year-ago.png') });
});
