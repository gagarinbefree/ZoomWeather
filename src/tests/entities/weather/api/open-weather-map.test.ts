import { describe, expect, it, vi } from 'vitest';
import { getOpenWeatherMapCurrent, getOpenWeatherMapForecast } from '@/entities/weather';

const location = {
  source: 'device' as const,
  latitude: 58,
  longitude: 56.25,
  countryCode: null,
};
const currentResponse = {
  name: 'Perm',
  dt: Date.UTC(2026, 9, 26, 7) / 1000,
  timezone: 18000,
  main: { temp: 9, feels_like: 7, humidity: 70, pressure: 1012 },
  wind: { speed: 3, deg: 225 },
  visibility: 10000,
  weather: [{ id: 803, description: 'пасмурно', icon: '04d' }],
  sys: {
    country: 'RU',
    sunrise: Date.UTC(2026, 9, 26, 2, 45) / 1000,
    sunset: Date.UTC(2026, 9, 26, 12, 30) / 1000,
  },
};

/**
 * forecastHour. Create an OpenWeatherMap forecast reading for a test time
 *
 * @param timestamp An absolute three hour provider instant.
 * @returns One OpenWeatherMap forecast entry.
 */
function forecastHour(timestamp: number): object {
  return {
    dt: timestamp / 1000,
    main: { temp: 8, feels_like: 6, humidity: 75, pressure: 1011 },
    wind: { speed: 4, deg: 180 },
    visibility: 9000,
    pop: 0.4,
    weather: [{ id: 500, description: 'небольшой дождь', icon: '10d' }],
  };
}

const forecastResponse = {
  city: { timezone: 18000 },
  list: [
    forecastHour(Date.UTC(2026, 9, 26, 7)),
    forecastHour(Date.UTC(2026, 9, 27, 7)),
    forecastHour(Date.UTC(2026, 9, 28, 7)),
  ],
};

describe('OpenWeatherMap adapter', () => {
  it('normalizes current measurements without inventing UV data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse));
    const weather = await getOpenWeatherMapCurrent({
      location,
      locale: 'ru',
      fetcher,
    });
    const requestUrl = fetcher.mock.calls[0]?.[0];
    if (typeof requestUrl !== 'string') throw new Error('Expected a URL');
    const url = new URL(requestUrl);
    expect(url.pathname).toBe('/api/openweathermap/data/2.5/weather');
    expect(url.searchParams.get('lat')).toBe('58');
    expect(url.searchParams.get('units')).toBe('metric');
    expect(url.searchParams.get('lang')).toBe('ru');
    expect(weather).toMatchObject({
      city: 'Perm',
      country: 'RU',
      timeZone: 'Asia/Yekaterinburg',
      temperature: 9,
      windSpeed: 10.8,
      windDirection: 'SW',
      uv: null,
      conditionCode: 803,
      conditionText: 'пасмурно',
    });
  });

  it('derives three calendar days from the free three hour forecast', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      if (typeof input !== 'string') throw new Error('Expected a URL');
      const pathname = new URL(input).pathname;
      return Promise.resolve(
        Response.json(pathname.endsWith('/weather') ? currentResponse : forecastResponse),
      );
    });
    const forecast = await getOpenWeatherMapForecast({
      location,
      locale: 'ru',
      timeZone: 'Asia/Yekaterinburg',
      days: 2,
      now: Date.UTC(2026, 9, 26, 7),
      fetcher,
    });
    expect(forecast.intervalHours).toBe(3);
    expect(forecast.days.map((day) => day.date)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(forecast.days[0]).toMatchObject({
      provider: 'openweathermap',
      sunrise: '07:45',
      sunset: '17:30',
      uv: null,
    });
    expect(forecast.days[1]).toMatchObject({
      rainChance: 40,
      sunrise: undefined,
      sunset: undefined,
      hours: [{ timestamp: Date.UTC(2026, 9, 27, 7), windSpeed: 14.4 }],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps every calendar date supplied by the five day forecast', async () => {
    const extended = {
      ...forecastResponse,
      list: Array.from({ length: 6 }, (_, index) => forecastHour(Date.UTC(2026, 9, 26 + index, 7))),
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      if (typeof input !== 'string') throw new Error('Expected a URL');
      return Promise.resolve(
        Response.json(new URL(input).pathname.endsWith('/weather') ? currentResponse : extended),
      );
    });

    const forecast = await getOpenWeatherMapForecast({
      location,
      locale: 'ru',
      timeZone: 'Asia/Yekaterinburg',
      days: 16,
      now: Date.UTC(2026, 9, 26, 7),
      fetcher,
    });

    expect(forecast.days.map((day) => day.date)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
  });

  it('uses the backend without a client key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse));
    await getOpenWeatherMapCurrent({ location, locale: 'en', fetcher });
    const requested = fetcher.mock.calls[0]?.[0];
    if (typeof requested !== 'string') throw new Error('Expected a backend URL');
    const url = new URL(requested);
    expect(url.origin).toBe('https://157.22.180.167:8443');
    expect(url.searchParams.has('appid')).toBe(false);
  });
});
