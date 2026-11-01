import { describe, expect, it } from 'vitest';
import { addWeatherMaps } from '@/entities/weather/model/add-weather-maps';
import { createWeatherGrid } from '@/entities/weather';

describe('addWeatherMaps', () => {
  it('places three maps before current weather only without changing forecast cells', () => {
    const grid = createWeatherGrid({
      now: Date.UTC(2026, 10, 1, 10),
      timeZone: 'UTC',
      days: [{ date: '2026-11-02', hours: [] }],
    });
    const result = addWeatherMaps(grid);
    expect(result[0]?.map((cell) => cell.kind)).toEqual(['map', 'map', 'map', 'current']);
    expect(result[0]?.slice(0, 3).map((cell) => (cell.kind === 'map' ? cell.layer : null))).toEqual(
      ['pressure', 'wind', 'temp'],
    );
    expect(result[0]?.[3]).toBe(grid[0]?.[0]);
    expect(result[1]).toBe(grid[1]);
    expect(result[1]?.[0]?.kind).toBe('daily');
    expect(new Set(result.flat().map((cell) => cell.id)).size).toBe(result.flat().length);
    expect(grid[0]).toHaveLength(1);
  });
});
