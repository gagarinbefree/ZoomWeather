import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useHistoryStore, type HistoryContext, type HistoryServices } from '@/features/history';
import type { ForecastDay } from '@/entities/weather';
import { ApiError } from '@/shared/api';

const context: HistoryContext = {
  today: '2026-11-02',
  city: 'Perm',
  country: 'Russia',
  timeZone: 'Asia/Yekaterinburg',
  locale: 'ru',
  location: { source: 'device', latitude: 58, longitude: 56.25, countryCode: 'RU' },
};
/**
 * day. Build a complete historical day for a controlled service.
 * @param date The requested historical calendar date.
 * @param maximum The daily maximum temperature.
 * @returns The normalized historical summary.
 */
function day(date: string, maximum = 5): ForecastDay {
  return {
    date,
    maximum,
    minimum: -1,
    humidity: 75,
    windSpeed: 18,
    rainChance: null,
    uv: null,
    conditionCode: 3,
    conditionText: '',
    conditionLocale: 'ru',
    sunrise: '08:30',
    sunset: '17:30',
    hours: [],
  };
}
beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('historical weather state', () => {
  it('loads both dates but removes unavailable summaries after a failed refresh', async () => {
    const store = useHistoryStore();
    const request = vi
      .fn<HistoryServices['history']>()
      .mockImplementation((_context, date) => Promise.resolve(day(date)));
    await store.load(context, { history: request });
    expect(request).toHaveBeenCalledTimes(2);
    expect(store.day('2026-11-01')?.maximum).toBe(5);
    expect(store.day('2025-11-02')?.maximum).toBe(5);
    request.mockRejectedValue(new ApiError('timeout'));
    await store.load(context, { history: request });
    expect(request).toHaveBeenCalledTimes(4);
    expect(store.days).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('discards the previous city and ignores late results from cancelled sessions', async () => {
    const store = useHistoryStore();
    const finish: (() => void)[] = [];
    const request: HistoryServices['history'] = (_context, date) =>
      new Promise((resolve) =>
        finish.push(() => {
          resolve(day(date, 99));
        }),
      );
    const pending = store.load(context, { history: request });
    await store.load(
      { ...context, city: 'London' },
      { history: (_context, date) => Promise.resolve(day(date, 10)) },
    );
    finish.forEach((resolve) => {
      resolve();
    });
    await pending;
    expect(store.day('2025-11-02')?.maximum).toBe(10);
    store.cancel();
  });
});

it('ignores aborted background results without persisting history', async () => {
  const store = useHistoryStore();
  await store.load(context, { history: (_context, date) => Promise.resolve(day(date)) });
  const abort = new AbortController();
  const finish: (() => void)[] = [];
  const history: HistoryServices['history'] = (_context, date) =>
    new Promise((resolve) => {
      finish.push(() => {
        resolve(day(date, 99));
      });
    });
  const pending = store.load(context, { history }, abort.signal);
  expect(store.day('2025-11-02')?.maximum).toBe(5);
  expect(localStorage.length).toBe(0);
  abort.abort();
  finish.forEach((resolve) => {
    resolve();
  });
  await pending;
  expect(store.day('2025-11-02')?.maximum).toBe(5);
  expect(localStorage.length).toBe(0);
});
