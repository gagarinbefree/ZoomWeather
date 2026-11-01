import { expect, test, type Page } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58, longitude: 56.25 } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://gagarinbefree.clodocd.com/api/open-meteo/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.route('https://gagarinbefree.clodocd.com/api/openweathermap/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
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

for (const installed of [false, true]) {
  test(`refreshes A4 while keeping the card visible in ${installed ? 'installed PWA' : 'website'}`, async ({
    page,
  }, info) => {
    if (installed)
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
      });
    let currentRequests = 0;
    let forecastRequests = 0;
    let delayForecast = false;
    let finishCurrent: (() => void) | undefined;
    let finishForecast: (() => void) | undefined;
    const currentGate = new Promise<void>((resolve) => {
      finishCurrent = resolve;
    });
    const forecastGate = new Promise<void>((resolve) => {
      finishForecast = resolve;
    });
    await page.route(
      'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
      async (route) => {
        const attempt = ++currentRequests;
        if (attempt > 1) await currentGate;
        await route.fulfill({
          json: {
            ...currentResponse,
            current: { ...currentResponse.current, temp_c: attempt === 1 ? 8.9 : 12.3 },
          },
        });
      },
    );
    await page.route(
      'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
      async (route) => {
        forecastRequests++;
        if (delayForecast) await forecastGate;
        await route.fulfill({ json: forecastResponse });
      },
    );
    await page.goto('./');
    const card = page.getByRole('article', { name: 'Текущая погода' });
    const viewport = page.locator('.weather-viewport');
    await expect(card).toContainText('8,9°C');
    await expect(viewport).toHaveAttribute('data-grid-rows', '3');
    const initialForecasts = forecastRequests;
    delayForecast = true;
    await pullDown(page);
    await expect(viewport).toHaveAttribute('data-refresh-phase', 'loading');
    await expect.poll(() => currentRequests).toBe(2);
    await expect(card).toContainText('8,9°C');
    const indicator = page.locator('[data-refresh-indicator]');
    await expect(indicator.locator('.spinner-border')).toBeVisible();
    await expect(viewport.locator('[data-tikitaki-role="current"]')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 80)',
    );
    await page.screenshot({
      path: `.cache/pull-refresh-${info.project.name}-${installed ? 'pwa' : 'site'}.png`,
    });
    await pullDown(page);
    expect(currentRequests).toBe(2);
    finishCurrent?.();
    await expect(indicator).toBeHidden();
    await expect(card).toContainText('12,3°C');
    await expect(viewport).toHaveAttribute('data-row', '0');
    await expect(viewport).toHaveAttribute('data-column', '3');
    await expect(viewport.locator('[data-tikitaki-role="current"]')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    await expect.poll(() => forecastRequests).toBeGreaterThan(initialForecasts);
    await expect(page.getByRole('alert')).toHaveCount(0);
    finishForecast?.();
    await expect(viewport).toHaveAttribute('data-grid-rows', '3');
  });
}

test('silently returns to the previous weather when every provider fails', async ({ page }) => {
  let requests = 0;
  let forecasts = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      requests++;
      await route.fulfill(requests === 1 ? { json: currentResponse } : { status: 503, json: {} });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    async (route) => {
      forecasts++;
      await route.fulfill({ json: forecastResponse });
    },
  );
  await page.goto('./');
  const card = page.getByRole('article', { name: 'Текущая погода' });
  await expect(card).toContainText('8,9°C');
  const viewport = page.locator('.weather-viewport');
  await expect(viewport).toHaveAttribute('data-grid-rows', '3');
  const initialForecasts = forecasts;
  await pullDown(page);
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('[data-refresh-indicator]')).toBeHidden();
  await expect(card).toContainText('8,9°C');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить' })).toHaveCount(0);
  expect(forecasts).toBe(initialForecasts);
  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute('data-column', '4');
});

test('does not refresh after a short pull or from an hourly card', async ({ page }) => {
  let requests = 0;
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      requests++;
      await route.fulfill({ json: currentResponse });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    (route) => route.fulfill({ json: forecastResponse }),
  );
  await page.goto('./');
  const viewport = page.locator('.weather-viewport');
  await expect(page.getByRole('article', { name: 'Текущая погода' })).toBeVisible();
  await expect(viewport).toHaveAttribute('data-grid-rows', '3');
  await pullDown(page, 30);
  await expect(page.locator('[data-refresh-indicator]')).toBeHidden();
  expect(requests).toBe(1);
  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(viewport).toHaveAttribute('data-column', '4');
  await pullDown(page);
  await expect(viewport).toHaveAttribute('data-column', '4');
  await expect(page.locator('[data-refresh-indicator]')).toBeHidden();
  expect(requests).toBe(1);
});

test('continues loading the previous forecast after a failed current refresh', async ({ page }) => {
  let requests = 0;
  let finishForecast: (() => void) | undefined;
  const forecastGate = new Promise<void>((resolve) => {
    finishForecast = resolve;
  });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/current.json?**',
    async (route) => {
      requests++;
      await route.fulfill(requests === 1 ? { json: currentResponse } : { status: 503, json: {} });
    },
  );
  await page.route(
    'https://gagarinbefree.clodocd.com/api/weatherapi/v1/forecast.json?**',
    async (route) => {
      await forecastGate;
      await route.fulfill({ json: forecastResponse });
    },
  );
  await page.goto('./');
  const viewport = page.locator('.weather-viewport');
  const card = page.getByRole('article', { name: 'Текущая погода' });
  await expect(card).toContainText('8,9°C');
  await expect(viewport).toHaveAttribute('data-grid-rows', '16');
  await pullDown(page);
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('[data-refresh-indicator]')).toBeHidden();
  await expect(card).toContainText('8,9°C');
  finishForecast?.();
  await expect(viewport).toHaveAttribute('data-grid-rows', '3');
  await viewport.focus();
  await viewport.press('ArrowDown');
  await expect(page.getByRole('article', { name: 'Прогноз на день' })).toContainText('Завтра');
});
