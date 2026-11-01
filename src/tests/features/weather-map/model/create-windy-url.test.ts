import { describe, expect, it } from 'vitest';
import { createWindyUrl } from '@/features/weather-map/model/create-windy-url';

describe('createWindyUrl', () => {
  it.each(['temp', 'wind', 'pressure'] as const)(
    'uses the official keyless embed for %s at the resolved location',
    (layer) => {
      const url = new URL(createWindyUrl(layer, { latitude: 58.0047, longitude: 56.2514 }, 'ru'));
      expect(url.origin).toBe('https://embed.windy.com');
      expect(url.pathname).toBe('/embed.html');
      expect(url.searchParams.get('overlay')).toBe(layer);
      expect(url.searchParams.get('lat')).toBe('58.0047');
      expect(url.searchParams.get('lon')).toBe('56.2514');
      expect(url.searchParams.get('detailLat')).toBe('58.0047');
      expect(url.searchParams.get('detailLon')).toBe('56.2514');
      expect(url.searchParams.get('lang')).toBe('ru');
      expect(url.searchParams.get('metricWind')).toBe('m/s');
      expect(url.searchParams.has('key')).toBe(false);
      expect(url.searchParams.get('calendar')).toBe('now');
      expect(url.searchParams.has('forecast')).toBe(false);
    },
  );
  it('uses miles per hour in English and rejects invalid coordinates', () => {
    expect(
      new URL(createWindyUrl('wind', { latitude: 51, longitude: 0 }, 'en')).searchParams.get(
        'metricWind',
      ),
    ).toBe('mph');
    expect(() => createWindyUrl('wind', { latitude: NaN, longitude: 0 }, 'en')).toThrow(RangeError);
  });
});

it('opens the selected future time instead of current conditions and rejects unavailable dates', () => {
  const now = new Date(2026, 10, 1, 12).getTime();
  const timestamp = now + 24 * 3600000;
  const url = new URL(
    createWindyUrl('temp', { latitude: 58, longitude: 56 }, 'ru', { timestamp, now }),
  );
  expect(url.searchParams.get('calendar')).toBe('in');
  expect(url.searchParams.get('forecast')).toBe('24');
  expect(url.searchParams.get('product')).toBe('ecmwf');
  expect(() =>
    createWindyUrl('temp', { latitude: 58, longitude: 56 }, 'ru', {
      timestamp: now + 8 * 86400000,
      now,
    }),
  ).toThrow(RangeError);
});
