import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentWeather, getForecast, type WeatherSnapshot } from '@/entities/weather';
import { readWeatherSnapshot, writeWeatherSnapshot } from '@/entities/weather';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

beforeEach(() => {
  localStorage.clear();
});

/**
 * snapshot. Create a saved weather fixture without API keys
 *
 * @returns A current observation and forecast without provider credentials.
 */
async function snapshot(): Promise<WeatherSnapshot> {
  const location = { source: 'automatic' } as const;
  const weather = await getCurrentWeather({
    location,
    locale: 'ru',
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse)),
  });
  const forecast = await getForecast({
    location,
    locale: 'ru',
    timeZone: weather.timeZone,
    days: 3,
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(forecastResponse)),
  });
  return { version: 1, savedAt: Date.UTC(2026, 9, 26, 7), locale: 'ru', weather, forecast };
}

describe('weather snapshot', () => {
  it('restores the last successful forecast without storing credentials or coordinates', async () => {
    const value = await snapshot();
    writeWeatherSnapshot(value);

    expect(readWeatherSnapshot()).toEqual(value);
    expect(localStorage.getItem(localStorage.key(0) ?? '')).not.toMatch(/example-only|latitude/);
  });

  it('ignores corrupt, unsupported and incomplete stored weather', async () => {
    const value = await snapshot();
    writeWeatherSnapshot(value);
    const key = localStorage.key(0);
    if (!key) throw new Error('Missing snapshot key');

    localStorage.setItem(key, '{broken');
    expect(readWeatherSnapshot()).toBeNull();
    localStorage.setItem(key, JSON.stringify({ ...value, version: 2 }));
    expect(readWeatherSnapshot()).toBeNull();
    localStorage.setItem(
      key,
      JSON.stringify({ ...value, forecast: { days: [{ date: '2026-10-26' }] } }),
    );
    expect(readWeatherSnapshot()).toBeNull();
  });
});

describe('saved provider metadata', () => {
  it('restores legacy forecasts without source metadata', async () => {
    const value = await snapshot();
    const days = value.forecast.days.map((day) =>
      Object.fromEntries(Object.entries(day).filter(([name]) => name !== 'provider')),
    );
    writeWeatherSnapshot(value);
    const key = localStorage.key(0);
    if (!key) throw new Error('Missing snapshot key');
    localStorage.setItem(key, JSON.stringify({ ...value, forecast: { ...value.forecast, days } }));
    expect(readWeatherSnapshot()?.forecast.days).toHaveLength(3);
  });

  it('rejects unknown provider metadata in a saved forecast', async () => {
    const value = await snapshot();
    writeWeatherSnapshot(value);
    const key = localStorage.key(0);
    if (!key) throw new Error('Missing snapshot key');
    localStorage.setItem(
      key,
      JSON.stringify({
        ...value,
        forecast: {
          ...value.forecast,
          days: value.forecast.days.map((day) => ({ ...day, provider: 'unknown' })),
        },
      }),
    );
    expect(readWeatherSnapshot()).toBeNull();
  });
});

it('discards legacy historical data while restoring current weather and future forecasts', async () => {
  const value = await snapshot();
  const legacy = { ...value, history: [{ date: '2025-10-26' }] };
  localStorage.setItem('zoomweather.weather.v1', JSON.stringify(legacy));
  expect(readWeatherSnapshot()).toEqual(value);
  expect(localStorage.getItem('zoomweather.weather.v1')).not.toContain('history');
  writeWeatherSnapshot(legacy);
  expect(localStorage.getItem('zoomweather.weather.v1')).not.toContain('history');
});
