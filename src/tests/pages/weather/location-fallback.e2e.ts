import { expect, test } from '@/tests/shared/lib/browser-test';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 58.0047, longitude: 56.2514 } });

for (const firstReserveFails of [false, true]) {
  test(`loads device weather after BigDataCloud fails with second reserve ${String(firstReserveFails)}`, async ({
    page,
  }) => {
    const locationRequests: string[] = [];
    const weatherRequests: string[] = [];
    await page.clock.setFixedTime(new Date('2026-10-26T05:37:00Z'));
    await page.route('https://api.bigdatacloud.net/**', async (route) => {
      locationRequests.push('BigDataCloud');
      await route.abort();
    });
    await page.route('https://157.22.180.167:8443/api/location/**', async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('latitude')).toBe('58.0047');
      expect(url.searchParams.get('longitude')).toBe('56.2514');
      const provider = url.pathname.includes('openweathermap') ? 'OpenWeatherMap' : 'WeatherAPI';
      locationRequests.push(provider);
      await route.fulfill(
        provider === 'OpenWeatherMap' && firstReserveFails
          ? { status: 504, json: { code: 'Timeout' } }
          : {
              json: {
                latitude: 58.0047,
                longitude: 56.2514,
                city: 'Perm',
                countryCode: 'RU',
                region: 'Perm Krai',
                names: { ru: 'Пермь', en: 'Perm' },
              },
            },
      );
    });
    await page.route('https://157.22.180.167:8443/api/open-meteo/**', async (route) => {
      await route.fulfill({ status: 503, json: {} });
    });
    await page.route('https://157.22.180.167:8443/api/openweathermap/data/**', async (route) => {
      await route.fulfill({ status: 503, json: {} });
    });
    await page.route('https://157.22.180.167:8443/api/weatherapi/v1/**', async (route) => {
      weatherRequests.push(route.request().url());
      await route.fulfill({
        json: route.request().url().includes('current.json') ? currentResponse : forecastResponse,
      });
    });
    await page.goto('./');
    const card = page.getByRole('article', { name: 'Текущая погода' });
    await expect(card).toContainText('Пермь');
    await expect(card).toContainText('8,9°C');
    expect(locationRequests).toEqual(
      firstReserveFails
        ? ['BigDataCloud', 'OpenWeatherMap', 'WeatherAPI']
        : ['BigDataCloud', 'OpenWeatherMap'],
    );
    expect(
      weatherRequests.some((url) => new URL(url).searchParams.get('q') === '58.0047,56.2514'),
    ).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
