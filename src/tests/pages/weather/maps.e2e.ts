import { expect, test, type Page, type Locator } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

const mapForecastResponse = {
  forecast: {
    forecastday: forecastResponse.forecast.forecastday.map((day, index) =>
      index === 1
        ? { ...day, day: { ...day.day, condition: { code: 1183, text: 'Light rain' } } }
        : day,
    ),
  },
};

/**
 * cardColors. Read the displayed body color and header gradient for a weather or map card.
 * @param card The card being compared with another card in its row.
 * @returns The colors actually painted by the browser.
 */
async function cardColors(
  card: Locator,
): Promise<{ readonly background: string; readonly header: string }> {
  return card.evaluate((element) => {
    const header = element.querySelector('header');
    if (!header) throw new Error('Missing card header');
    return {
      background: getComputedStyle(element).backgroundColor,
      header: getComputedStyle(header).backgroundImage,
    };
  });
}

test.use({
  serviceWorkers: 'block',
  permissions: ['geolocation'],
  geolocation: { latitude: 58, longitude: 56.25 },
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route('https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**', (route) =>
    route.fulfill({ json: currentResponse }),
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    (route) => route.fulfill({ json: mapForecastResponse }),
  );
});

/**
 * swipeRight. Move to the next map with a real mouse or touch gesture.
 * @param page The page showing current weather or a map card.
 * @returns A promise that settles after the gesture is released.
 */
async function swipeRight(page: Page): Promise<void> {
  const area = page.locator('[data-tikitaki-role="current"] [data-map-swipe-area]').first();
  const target = (await area.count()) ? area : page.locator('.weather-viewport');
  const box = await target.boundingBox();
  if (!box) throw new Error('Missing swipe surface');
  const start = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.5 };
  const end = { x: box.x + box.width * 0.8, y: start.y };
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...start, id: 1 }],
      });
      for (let step = 1; step <= 6; step++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x + ((end.x - start.x) * step) / 6, y: start.y, id: 1 }],
        });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await session.detach();
    }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
  }
}

test('opens temperature wind and pressure to the left and returns vertically to daily anchors', async ({
  page,
}) => {
  const requests: URL[] = [];
  await page.route('https://embed.windy.com/**', async (route) => {
    requests.push(new URL(route.request().url()));
    await route.fulfill({
      contentType: 'text/html',
      body: '<html><body><a href="https://windy.com">Windy</a><p>Map fixture</p></body></html>',
    });
  });
  await page.goto('./');
  const viewport = page.locator('.weather-viewport');
  await expect(viewport).toHaveAttribute('data-column', '3');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  await expect(viewport).toHaveAttribute('data-grid-rows', '5');
  const currentColors = await cardColors(page.locator('[data-tikitaki-role="current"] article'));
  expect(requests).toHaveLength(0);
  for (const [layer, title] of [
    ['temp', 'Карта температуры'],
    ['wind', 'Карта ветра'],
    ['pressure', 'Карта давления'],
  ] as const) {
    await swipeRight(page);
    const card = page.getByRole('article', { name: title });
    await expect(card).toBeVisible();
    expect(await cardColors(card)).toEqual(currentColors);
    await expect(card.locator('time')).toHaveAttribute('datetime', '2026-10-26T05:37:00.000Z');
    await expect(card.locator('time')).toContainText('10:37');
    await expect(card.locator('header button')).toHaveCount(0);
    const reservedHeight = await card
      .locator('.weather-map__navigation-space')
      .evaluate((space) => {
        const reference = document.createElement('button');
        reference.className = 'btn';
        reference.textContent = 'Weather';
        space.parentElement?.append(reference);
        const heights = {
          actual: space.getBoundingClientRect().height,
          expected: reference.getBoundingClientRect().height,
        };
        reference.remove();
        return heights;
      });
    expect(reservedHeight.actual).toBeGreaterThan(0);
    expect(reservedHeight.actual).toBeCloseTo(reservedHeight.expected, 1);
    await expect(card.locator('iframe')).toHaveAttribute('src', new RegExp(`overlay=${layer}`));
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect.poll(() => requests.at(-1)?.searchParams.get('overlay')).toBe(layer);
    expect(requests.at(-1)?.searchParams.get('metricWind')).toBe('m/s');
  }
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-row', '3');
  await expect(viewport).toHaveAttribute('data-column', '3');
  await expect(page.getByRole('article', { name: 'Прогноз на день' })).toContainText('Завтра');
  await expect(page.locator('iframe')).toHaveCount(0);
  const dailyColors = await cardColors(page.locator('[data-tikitaki-role="current"] article'));
  expect(dailyColors).not.toEqual(currentColors);
  await viewport.press('ArrowLeft');
  await expect(viewport).toHaveAttribute('data-row', '3');
  await expect(viewport).toHaveAttribute('data-column', '2');
  const tomorrowMap = page.locator('[data-tikitaki-role="current"] .weather-map');
  expect(await cardColors(tomorrowMap)).toEqual(dailyColors);
  await expect(tomorrowMap.locator('time')).toHaveAttribute('datetime', '2026-10-27T07:00:00.000Z');
  await expect(tomorrowMap.locator('time')).toContainText('12:00');
  await expect(tomorrowMap.locator('iframe')).toHaveAttribute('src', /calendar=in/);
  const forecastUrl = new URL((await tomorrowMap.locator('iframe').getAttribute('src')) ?? '');
  expect(Number(forecastUrl.searchParams.get('forecast'))).toBeCloseTo(
    (Date.UTC(2026, 9, 27, 7) - Date.UTC(2026, 9, 26, 5, 37)) / 3600000,
  );
  await viewport.press('ArrowUp');
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-10-26/current');
  await expect(viewport).toHaveAttribute('data-column', '3');
});

test('keeps offline map failures separate from the last weather and permits leaving the map', async ({
  page,
  context,
}) => {
  await page.route('https://embed.windy.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Map</body></html>' }),
  );
  await page.goto('./');
  const viewport = page.locator('.weather-viewport');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await viewport.focus();
  await viewport.press('ArrowLeft');
  const card = page.getByRole('article', { name: 'Карта температуры' });
  await expect(card).toContainText('Для карты нужен интернет');
  await expect(page.locator('iframe')).toHaveCount(0);
  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute('data-column', '3');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
});

test('omits maps beyond the supported calendar and keeps hourly cells beside daily weather', async ({
  page,
}) => {
  const first = forecastResponse.forecast.forecastday[0];
  if (!first) throw new Error('Missing forecast fixture');
  const days = Array.from({ length: 8 }, (_, index) => ({
    ...first,
    date: new Date(Date.UTC(2026, 9, 26 + index)).toISOString().slice(0, 10),
    hour: first.hour.map((hour) => ({ ...hour, time_epoch: hour.time_epoch + index * 86400 })),
  }));
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    (route) => route.fulfill({ json: { forecast: { forecastday: days } } }),
  );
  await page.route('https://embed.windy.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Map</body></html>' }),
  );
  await page.goto('./');
  const viewport = page.locator('.weather-viewport');
  await expect(viewport).toHaveAttribute('data-grid-rows', '10');
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-10-27/daily');
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute('data-column', '4');
  await expect(page.locator('[data-tikitaki-role="current"] article')).toHaveAttribute(
    'aria-label',
    'Почасовой прогноз',
  );
  await expect(page.locator('iframe')).toHaveCount(0);
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-column', '3');
  for (let row = 3; row <= 5; row++) {
    await viewport.press('ArrowDown');
    await expect(viewport).toHaveAttribute('data-row', String(row + 2));
  }
  await viewport.press('ArrowLeft');
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-10-31/map/temp');
  await expect(page.locator('[data-tikitaki-role="current"] time')).toHaveAttribute(
    'datetime',
    '2026-10-31T07:00:00.000Z',
  );
  await viewport.press('ArrowDown');
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-11-01/daily');
  await viewport.press('ArrowLeft');
  await expect(viewport).toHaveAttribute('data-column', '3');
  await expect(viewport.locator('[data-tikitaki-role="right"]')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await viewport.press('ArrowUp');
  await expect(viewport).toHaveAttribute('data-active-cell', '2026-10-31/daily');
});
