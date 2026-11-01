import { describe, expect, it } from 'vitest';
import { addWeatherMaps, weatherRowStartColumn } from '@/entities/weather/model/add-weather-maps';
import { createWeatherGrid } from '@/entities/weather';

const now = Date.UTC(2026, 10, 1, 10);
const options = { now, timeZone: 'Asia/Yekaterinburg' };

describe('addWeatherMaps', () => {
  it('adds maps before current weather and supported daily cards without changing hour cells', () => {
    const grid = createWeatherGrid({
      now,
      timeZone: options.timeZone,
      days: [
        { date: '2026-11-02', hours: [Date.UTC(2026, 10, 2, 1)] },
        { date: '2026-11-06', hours: [] },
        { date: '2026-11-07', hours: [] },
      ],
    });
    const result = addWeatherMaps(grid, options);
    expect(result[0]?.map((cell) => cell.kind)).toEqual(['map', 'map', 'map', 'current']);
    expect(result[1]?.map((cell) => cell.kind)).toEqual(['map', 'map', 'map', 'daily', 'hourly']);
    expect(result[1]?.slice(3)).toEqual(grid[1]);
    expect(result[1]?.[4]).toBe(grid[1]?.[1]);
    expect(
      result[1]?.slice(0, 3).map((cell) => (cell.kind === 'map' ? cell.timestamp : null)),
    ).toEqual(Array(3).fill(Date.UTC(2026, 10, 2, 7)));
    expect(result[2]?.[0]?.kind).toBe('map');
    expect(result[3]).toBe(grid[3]);
    expect(result[0]?.[0]?.timestamp).toBeUndefined();
    expect(new Set(result.flat().map((cell) => cell.id)).size).toBe(result.flat().length);
    expect(grid[0]).toHaveLength(1);
    expect(weatherRowStartColumn(result, 1)).toBe(0);
    expect(weatherRowStartColumn(result, 3)).toBe(3);
  });
});
