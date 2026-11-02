import { describe, expect, it, vi } from 'vitest';
import { getWeatherHistory } from '@/entities/weather/api/get-weather-history';

export const historyResponse = {
  daily: {
    time: ['2025-11-02'],
    temperature_2m_max: [5],
    temperature_2m_min: [-1],
    relative_humidity_2m_mean: [70],
    wind_speed_10m_max: [18],
    weather_code: [3],
    sunrise: ['2025-11-02T08:30'],
    sunset: ['2025-11-02T17:25'],
    precipitation_sum: [2.3],
  },
};
const options = {
  location: { source: 'device' as const, latitude: 58, longitude: 56.25, countryCode: 'RU' },
  locale: 'ru' as const,
  timeZone: 'Asia/Yekaterinburg',
  date: '2025-11-02',
};

describe('historical daily weather adapter', () => {
  it('requests one native historical day through WeatherServer without credentials or hours', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(historyResponse));
    const day = await getWeatherHistory({ ...options, fetcher });
    expect(day).toMatchObject({
      date: options.date,
      maximum: 5,
      minimum: -1,
      humidity: 70,
      windSpeed: 18,
      rainChance: null,
      uv: null,
      precipitation: 2.3,
      hours: [],
      sunrise: '08:30',
      sunset: '17:25',
      conditionLocale: 'ru',
    });
    const input = fetcher.mock.calls[0]?.[0];
    if (typeof input !== 'string') throw new Error('Expected a URL');
    const url = new URL(input);
    expect(url.host).toBe('gagarinbefree.clodocd.com');
    expect(url.pathname).toBe('/api/open-meteo/v1/archive');
    expect(url.searchParams.get('start_date')).toBe(options.date);
    expect(url.searchParams.get('end_date')).toBe(options.date);
    expect(url.searchParams.has('hourly')).toBe(false);
    expect(url.searchParams.has('key')).toBe(false);
  });

  it('rejects missing measurements or the wrong date instead of showing invented weather', async () => {
    for (const daily of [
      { ...historyResponse.daily, time: ['2025-11-03'] },
      { ...historyResponse.daily, weather_code: [null] },
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ daily }));
      await expect(getWeatherHistory({ ...options, fetcher })).rejects.toMatchObject({
        kind: 'invalidResponse',
      });
    }
  });
});
