import { describe, expect, it, vi } from 'vitest';
import { getCurrentWeather } from '@/entities/weather';
import { currentResponse } from './current-fixture';

describe('getCurrentWeather', () => {
  it('loads current weather directly using coordinates and language', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse));
    const weather = await getCurrentWeather({
      location: {
        source: 'device',
        latitude: 58.0047,
        longitude: 56.2514,
        countryCode: null,
      },
      locale: 'ru',
      fetcher,
    });
    const requested = fetcher.mock.calls[0]?.[0];
    if (typeof requested !== 'string') throw new Error('Expected a string API URL');
    const url = new URL(requested);
    expect(url.origin).toBe('https://157.22.180.167:8443');
    expect(url.pathname).toBe('/api/weatherapi/v1/current.json');
    expect(url.searchParams.has('key')).toBe(false);
    expect(url.searchParams.get('q')).toBe('58.0047,56.2514');
    expect(url.searchParams.get('lang')).toBe('ru');
    expect(weather).toMatchObject({
      city: 'Perm',
      timeZone: 'Asia/Yekaterinburg',
      observedAt: currentResponse.current.last_updated_epoch * 1000,
      temperature: 8.9,
      conditionCode: 1009,
      isDay: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('supports auto IP without a hardcoded city', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse));
    await getCurrentWeather({
      location: { source: 'automatic' },
      locale: 'en',
      fetcher,
    });
    const requested = fetcher.mock.calls[0]?.[0];
    if (typeof requested !== 'string') throw new Error('Expected a string API URL');
    expect(new URL(requested).searchParams.get('q')).toBe('auto:ip');
  });

  it('uses the localized device city instead of the provider transliteration', async () => {
    const weather = await getCurrentWeather({
      location: {
        source: 'device',
        latitude: 58.0047,
        longitude: 56.2514,
        countryCode: 'RU',
        city: 'Пермь',
        region: 'Пермский край',
      },
      locale: 'ru',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse)),
    });
    expect(weather.city).toBe('Пермь');
    expect(weather.region).toBe('Пермский край');
  });

  it('loads automatic location without any client credential', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse));
    await getCurrentWeather({ location: { source: 'automatic' }, locale: 'en', fetcher });
    const requested = fetcher.mock.calls[0]?.[0];
    if (typeof requested !== 'string') throw new Error('Expected a backend URL');
    expect(new URL(requested).searchParams.has('key')).toBe(false);
  });

  it.each([
    { ...currentResponse, location: { ...currentResponse.location, tz_id: 'invalid/zone' } },
    { ...currentResponse, current: { ...currentResponse.current, temp_c: '8.9' } },
    { ...currentResponse, current: { ...currentResponse.current, humidity: 101 } },
    { ...currentResponse, current: { ...currentResponse.current, last_updated_epoch: null } },
  ])('rejects incomplete or invalid payloads', async (payload) => {
    await expect(
      getCurrentWeather({
        location: { source: 'automatic' },
        locale: 'en',
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)),
      }),
    ).rejects.toMatchObject({ kind: 'invalidResponse' });
  });
});
