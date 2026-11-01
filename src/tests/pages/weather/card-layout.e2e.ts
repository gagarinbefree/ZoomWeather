import { expect, test, type Locator, type Page } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 58, longitude: 56.25 },
  viewport: { width: 320, height: 662 },
});

/**
 * expectCardInsideCell. Check that a loaded card fits within its padded swipe cell
 *
 * @param card The visible weather card.
 * @returns A promise that resolves after checking both ends of the card.
 */
async function expectCardInsideCell(card: Locator): Promise<void> {
  await expect(card).toBeVisible();
  const bounds = await card.evaluate((article) => {
    const cell = article.closest('.weather-cell');
    if (!cell) throw new Error('Missing weather cell');
    const cardBox = article.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const style = getComputedStyle(cell);
    return {
      top: cardBox.top - cellBox.top,
      bottom: cellBox.bottom - cardBox.bottom,
      paddingTop: Number.parseFloat(style.paddingTop),
      paddingBottom: Number.parseFloat(style.paddingBottom),
      scrollHeight: cell.scrollHeight,
      height: cell.clientHeight,
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.paddingTop - 1);
  expect(bounds.bottom).toBeGreaterThanOrEqual(bounds.paddingBottom - 1);
  expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.height + 1);
  await expect(card.locator('h2')).toBeInViewport({ ratio: 1 });
  await expect(card.locator('dd').last()).toBeInViewport({ ratio: 1 });
}

test('keeps current daily and hourly cards fully visible at the Android viewport size', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://api.bigdatacloud.net/**', async (route) => {
    await route.fulfill({
      json: {
        lookupSource: 'coordinates',
        latitude: 58,
        longitude: 56.25,
        countryCode: 'RU',
        city: 'Пермь',
      },
    });
  });
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
  await page.goto('./');
  await page.evaluate(async () => document.fonts.ready);
  const current = page.getByRole('article', { name: 'Текущая погода' });
  await expect(current).toContainText('07:45');
  await expectCardInsideCell(current);
  await expect(current.locator('h2')).toHaveCSS('font-weight', '600');
  await expect(current.locator('header > p').first()).toHaveCSS('margin-bottom', '0px');
  await page.screenshot({ path: test.info().outputPath('current-card.png') });

  const viewport = page.getByRole('region', { name: 'Навигация по прогнозу' });
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-row', '1');
  const daily = page.getByRole('article', { name: 'Прогноз на день' });
  await expect(daily).toContainText('07:47');
  await expectCardInsideCell(daily);
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute('data-column', '4');
  await expectCardInsideCell(page.getByRole('article', { name: 'Почасовой прогноз' }));
});

/**
 * readCardAnchors. Measure the main vertical positions inside a weather card
 *
 * @param card The visible current or forecast card
 * @returns The icon temperature condition and first measurement positions
 */
async function readCardAnchors(card: Locator): Promise<readonly number[]> {
  return card.evaluate((article) => {
    const selectors = [
      '[data-weather-icon]',
      '[class$="__temperature"]',
      '[class$="__condition"]',
      'dt',
    ];
    return selectors.map((selector) => {
      const element = article.querySelector(selector);
      if (!element) throw new Error('Missing card anchor ' + selector);
      return element.getBoundingClientRect().top;
    });
  });
}

/**
 * mockAlignedWeather. Provide cards with different measurement counts and description lengths
 *
 * @param page The browser page receiving deterministic weather
 * @param english Whether the location selects the English interface
 * @returns A promise that resolves when the weather routes are ready
 */
async function mockAlignedWeather(page: Page, english: boolean): Promise<void> {
  const city = english ? 'London' : 'Пермь';
  await page.route('https://api.bigdatacloud.net/**', async (route) => {
    await route.fulfill({
      json: {
        lookupSource: 'coordinates',
        latitude: 58,
        longitude: 56.25,
        countryCode: english ? 'GB' : 'RU',
        city,
      },
    });
  });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      await route.fulfill({
        json: {
          ...currentResponse,
          location: {
            ...currentResponse.location,
            name: city,
            country: english ? 'United Kingdom' : 'Russia',
          },
        },
      });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    async (route) => {
      await route.fulfill({
        json: {
          forecast: {
            forecastday: forecastResponse.forecast.forecastday.map((day) => ({
              ...day,
              hour: day.hour.flatMap((hour) => [
                hour,
                {
                  ...hour,
                  time_epoch: hour.time_epoch + 7200,
                  condition: { code: 1276, text: 'Moderate or heavy rain with thunder' },
                },
              ]),
            })),
          },
        },
      });
    },
  );
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', async (route) => {
    await route.fulfill({ status: 503, json: {} });
  });
}

for (const scenario of [
  { width: 320, height: 662, english: false },
  { width: 393, height: 851, english: true },
  { width: 320, height: 568, english: false },
]) {
  test(`keeps vertical anchors aligned across current daily and hourly cards at ${String(scenario.width)} by ${String(scenario.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAlignedWeather(page, scenario.english);
    await page.goto('./');
    await page.evaluate(async () => document.fonts.ready);
    const current = page.locator('[data-tikitaki-role="current"] article');
    await expect(current.locator('dd')).toHaveCount(8);
    await expect(current).toContainText('07:45');
    await expect(current.locator('dd').nth(2)).toContainText(
      scenario.english ? '5.6 mph' : '2,5 м/с',
    );
    const anchors = await readCardAnchors(current);
    const viewport = page.locator('.weather-viewport');
    await expect(viewport).toHaveAttribute('data-grid-rows', '3');
    await viewport.focus();
    for (const [key, row, column] of [
      ['ArrowRight', '0', '4'],
      ['ArrowRight', '0', '5'],
      ['ArrowDown', '1', '3'],
      ['ArrowRight', '1', '4'],
    ] as const) {
      await viewport.press(key);
      await expect(viewport).toHaveAttribute('data-row', row);
      await expect(viewport).toHaveAttribute('data-column', column);
      await expect(current.locator('dd')).toHaveCount(6);
      const daily = column === '3';
      await expect(current.locator('dd').nth(daily ? 1 : 2)).toContainText(
        scenario.english ? (daily ? '11.2 mph' : '6.8 mph') : daily ? '5 м/с' : '3,1 м/с',
      );
      const next = await readCardAnchors(current);
      for (const [index, top] of next.entries())
        expect(Math.abs(top - (anchors[index] ?? NaN))).toBeLessThanOrEqual(1);
    }
  });
}

test('tiles subtle weather drawings at their natural size on every card', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockAlignedWeather(page, false);
  await page.goto('./');
  const current = page.locator('[data-tikitaki-role="current"] article');
  await expect(current.locator('dd')).toHaveCount(8);
  const viewport = page.locator('.weather-viewport');
  await expect(viewport).toHaveAttribute('data-grid-rows', '3');
  await viewport.focus();
  for (const [key, drawing] of [
    [null, 'overcast'],
    ['ArrowRight', 'partly_cloudy'],
    ['ArrowDown', 'overcast'],
  ] as const) {
    if (key) await viewport.press(key);
    await expect
      .poll(() =>
        current.evaluate((article) => getComputedStyle(article, '::before').backgroundImage),
      )
      .toContain(drawing);
    const pattern = await current.evaluate(async (article) => {
      const style = getComputedStyle(article, '::before');
      const url = style.backgroundImage.slice(5, -2);
      const image = await createImageBitmap(await (await fetch(url)).blob());
      return {
        width: image.width,
        height: image.height,
        repeat: style.backgroundRepeat,
        size: style.backgroundSize,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        blendMode: style.mixBlendMode,
      };
    });
    expect(pattern).toEqual({
      width: 338,
      height: 275,
      repeat: 'repeat',
      size: 'auto',
      opacity: '0.03',
      pointerEvents: 'none',
      blendMode: 'multiply',
    });
    await expectCardInsideCell(current);
    await page.screenshot({ path: test.info().outputPath(`${drawing}-${key ?? 'current'}.png`) });
  }
});
