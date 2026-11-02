import { expect, type Page } from '@playwright/test';

/**
 * holdCurrentRequest. Keep weather loading pending for browser layout tests
 *
 * @param page The isolated browser page for a stable loading screen.
 * @returns A promise that resolves after installing deterministic location and network handlers.
 */
async function holdCurrentRequest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback): void => {
          success({ coords: { latitude: 58.0047, longitude: 56.2514 } } as GeolocationPosition);
        },
      },
    });
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'ru' });
  });
  await page.route(
    'https://gagarinbefree.clodocd.com/api/open-meteo/v1/forecast?**',
    () => undefined,
  );
}

/**
 * verifyApplicationShell. Check the loading screen and look for browser errors
 *
 * @param page The isolated browser page with the application base URL.
 * @returns A promise that resolves after checking the loading screen and browser errors.
 */
export async function verifyApplicationShell(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await holdCurrentRequest(page);
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'ZoomWeather' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveAccessibleName('Загружаем погоду...');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('[data-tikitaki-role="current"] .spinner-border')).toHaveCSS(
    'animation-name',
    'spinner-border',
  );
  expect(errors).toEqual([]);
}

/**
 * verifyPortraitViewport. Check that the weather card fits a portrait viewport
 *
 * @param page The isolated browser page with the required viewport.
 * @returns A promise that resolves after checking the card geometry.
 */
export async function verifyPortraitViewport(page: Page): Promise<void> {
  await holdCurrentRequest(page);
  await page.goto('./');
  const card = page.locator('.weather-viewport');
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) throw new Error('Expected a visible card and a viewport');

  expect(Math.abs(box.height - viewport.height)).toBeLessThanOrEqual(1);
  expect(box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  if (viewport.width <= viewport.height * 0.48) {
    expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
  } else {
    expect(box.width / box.height).toBeGreaterThanOrEqual(0.47);
    expect(box.width / box.height).toBeLessThanOrEqual(0.49);
    expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
}
