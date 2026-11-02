import { describe, expect, it } from 'vitest';
import {
  addWeatherHistory,
  weatherHistoryDates,
  weatherPrimaryRow,
} from '@/entities/weather/model/weather-history';
import { addWeatherMaps, weatherRowStartColumn } from '@/entities/weather/model/add-weather-maps';
import { createWeatherGrid } from '@/entities/weather/model/create-weather-grid';

describe('historical weather rows', () => {
  it('puts year ago and yesterday above the current anchor without horizontal neighbors', () => {
    const now = Date.UTC(2026, 10, 2, 10);
    const raw = createWeatherGrid({ now, timeZone: 'Asia/Yekaterinburg', days: [] });
    const grid = addWeatherHistory(addWeatherMaps(raw, { now, timeZone: 'Asia/Yekaterinburg' }));
    expect(weatherPrimaryRow).toBe(2);
    expect(grid[0]).toEqual([
      { id: '2025-11-02/history/yearAgo', kind: 'history', period: 'yearAgo', date: '2025-11-02' },
    ]);
    expect(grid[1]).toEqual([
      {
        id: '2026-11-01/history/yesterday',
        kind: 'history',
        period: 'yesterday',
        date: '2026-11-01',
      },
    ]);
    expect(grid[2]?.[3]?.kind).toBe('current');
    expect(weatherRowStartColumn(grid, 0)).toBe(3);
    expect(weatherRowStartColumn(grid, 1)).toBe(3);
    expect(weatherRowStartColumn(grid, 2)).toBe(0);
  });

  it('uses calendar days across year boundaries and leap years', () => {
    expect(weatherHistoryDates('2024-02-29')).toEqual({
      yesterday: '2024-02-28',
      yearAgo: '2023-02-28',
    });
    expect(weatherHistoryDates('2026-01-01')).toEqual({
      yesterday: '2025-12-31',
      yearAgo: '2025-01-01',
    });
    expect(() => weatherHistoryDates('2026-02-30')).toThrow();
  });
});
