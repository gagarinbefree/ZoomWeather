import { test as base } from '@playwright/test';
import { historyFixture } from '@/tests/entities/weather/api/history-fixture';
export { expect, type Page, type Locator } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use): Promise<void> => {
    await page.route('https://api.bigdatacloud.net/**', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        json: {
          latitude: Number(url.searchParams.get('latitude')),
          longitude: Number(url.searchParams.get('longitude')),
          lookupSource: 'coordinates',
          city: 'Пермь',
          countryCode: 'RU',
        },
      });
    });
    await page.route(
      'https://gagarinbefree.clodocd.com/api/open-meteo/v1/archive?**',
      async (route) => {
        const date = new URL(route.request().url()).searchParams.get('start_date') ?? '';
        await route.fulfill({ json: historyFixture(date) });
      },
    );
    await use(page);
  },
});
