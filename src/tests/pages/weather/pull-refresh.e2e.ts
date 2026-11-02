import { expect, test, type Page } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';
import { historyFixture } from '@/tests/entities/weather/api/history-fixture';

test.use({
  serviceWorkers: 'block',
  permissions: ['geolocation'],
  geolocation: { latitude: 58, longitude: 56.25 },
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    (route) => route.fulfill({ json: forecastResponse }),
  );
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/v1/archive?**', (route) =>
    route.fulfill({
      json: historyFixture(new URL(route.request().url()).searchParams.get('start_date') ?? ''),
    }),
  );
});

/**
 * pullDown. Perform a real downward gesture without waiting for the pending request.
 *
 * @param page The browser page with the current weather card.
 * @param distance The finger travel in CSS pixels.
 * @returns A promise that settles when the finger is released.
 */
async function pullDown(page: Page, distance = 200): Promise<void> {
  const box = await page.locator('.weather-viewport').boundingBox();
  if (!box) throw new Error('Missing weather viewport');
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.25;
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let step = 1; step <= 5; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (distance * step) / 5, id: 1 }],
        });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await session.detach();
    }
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + distance, { steps: 5 });
    await page.mouse.up();
  }
}

/**
 * openYearAgo. Move through yesterday to the upper historical boundary.
 * @param page The weather application page.
 * @returns A promise that settles when the anniversary card is selected.
 */
async function openYearAgo(page: Page): Promise<void> {
  const viewport = page.locator('.weather-viewport');
  await viewport.focus();
  await viewport.press('ArrowUp');
  await expect(page.getByRole('article', { name: 'Вчера', exact: true })).toBeVisible();
  await viewport.press('ArrowUp');
  await expect(page.getByRole('article', { name: 'Год назад', exact: true })).toBeVisible();
  await expect(viewport).toHaveAttribute('data-row', '0');
}

for (const installed of [false, true]) {
  test(`refreshes from year ago and returns to current weather in ${installed ? 'PWA' : 'website'}`, async ({
    page,
  }) => {
    if (installed)
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
      );
    let requests = 0;
    let historyRequests = 0;
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await page.route(
      'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
      async (route) => {
        const attempt = ++requests;
        if (attempt > 1) await gate;
        await route.fulfill({
          json: {
            ...currentResponse,
            current: { ...currentResponse.current, temp_c: attempt === 1 ? 8.9 : 12.3 },
          },
        });
      },
    );
    await page.route(
      'https://gagarinbefree.clodocd.com/api/open-meteo/v1/archive?**',
      async (route) => {
        historyRequests++;
        await route.fulfill({
          json: historyFixture(new URL(route.request().url()).searchParams.get('start_date') ?? ''),
        });
      },
    );
    await page.goto('./');
    const viewport = page.locator('.weather-viewport');
    const current = page.getByRole('article', { name: 'Текущая погода' });
    await expect(current).toContainText('8,9°C');
    await expect(viewport).toHaveAttribute('data-row', '2');
    await expect(viewport).toHaveAttribute('data-grid-rows', '5');
    await openYearAgo(page);
    await page.screenshot({ path: test.info().outputPath('year-ago.png') });
    await viewport.press('ArrowLeft');
    await viewport.press('ArrowRight');
    await expect(viewport).toHaveAttribute('data-column', '3');
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(requests).toBe(1);
    expect(historyRequests).toBe(2);
    await pullDown(page);
    await expect(viewport).toHaveAttribute('data-refresh-phase', 'loading');
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByRole('article', { name: 'Год назад', exact: true })).toBeVisible();
    await expect(page.locator('[data-refresh-indicator] .spinner-border')).toBeVisible();
    await pullDown(page);
    expect(requests).toBe(2);
    finish?.();
    await expect(page.locator('[data-refresh-indicator]')).toBeHidden();
    await expect(viewport).toHaveAttribute('data-row', '2');
    await expect(viewport).toHaveAttribute('data-column', '3');
    await expect(current).toContainText('12,3°C');
    expect(historyRequests).toBe(4);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('returns silently to the last successful current card after failed refresh', async ({
  page,
}) => {
  let requests = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      requests++;
      await route.fulfill(requests === 1 ? { json: currentResponse } : { status: 503, json: {} });
    },
  );
  await page.goto('./');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toContainText('8,9°C');
  await openYearAgo(page);
  await pullDown(page);
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('.weather-viewport')).toHaveAttribute('data-row', '2');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toContainText('8,9°C');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('moves from current weather to history without refreshing and ignores a short boundary pull', async ({
  page,
}) => {
  let requests = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      requests++;
      await route.fulfill({ json: currentResponse });
    },
  );
  await page.goto('./');
  const viewport = page.locator('.weather-viewport');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  await pullDown(page);
  await expect(viewport).toHaveAttribute('data-row', '1');
  await expect(page.getByRole('article', { name: 'Вчера', exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await pullDown(page);
  await expect(viewport).toHaveAttribute('data-row', '0');
  await pullDown(page, 30);
  await expect(page.locator('[data-refresh-indicator]')).toBeHidden();
  await expect(viewport).toHaveAttribute('data-row', '0');
  expect(requests).toBe(1);
});
