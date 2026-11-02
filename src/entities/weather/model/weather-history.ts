import { messages } from '@/shared/locales';
import type { ForecastDay } from './forecast';
import type { WeatherGrid } from './types';

/**
 * weatherPrimaryRow. Locate the current weather inside the available rows.
 * @param grid The current navigation grid.
 * @returns The main row index with zero as the empty grid fallback.
 */
export function weatherPrimaryRow(grid: WeatherGrid): number {
  return Math.max(
    0,
    grid.findIndex((row) => row.some((cell) => cell.kind === 'current')),
  );
}
export type HistoryPeriod = 'yesterday' | 'yearAgo';

/**
 * weatherHistoryDates. Read yesterday and the anniversary from a local calendar date.
 * @param today The current local date in ISO calendar form.
 * @returns The two historical dates with leap anniversaries clamped to February 28.
 */
export function weatherHistoryDates(today: string): Readonly<Record<HistoryPeriod, string>> {
  const date = new Date(`${today}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== today
  )
    throw new RangeError(messages.en.invalidDate);
  const yesterday = new Date(date.getTime() - 86400000).toISOString().slice(0, 10);
  const year = date.getUTCFullYear() - 1;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const yearAgo = new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)))
    .toISOString()
    .slice(0, 10);
  return Object.freeze({ yesterday, yearAgo });
}

/**
 * addWeatherHistory. Add only successful historical rows above the current weather without changing its identity.
 * @param grid The current and future weather rows with any map cards.
 * @param days The successful historical summaries for this session.
 * @returns The grid with only available history aligned to the main column.
 */
export function addWeatherHistory(grid: WeatherGrid, days: readonly ForecastDay[]): WeatherGrid {
  const today = grid.flat().find((cell) => cell.kind === 'current')?.date;
  if (!today) return grid;
  const dates = weatherHistoryDates(today);
  const rows: WeatherGrid[number][] = [];
  for (const period of ['yearAgo', 'yesterday'] as const) {
    const weather = days.find((day) => day.date === dates[period]);
    if (!weather) continue;
    rows.push(
      Object.freeze([
        Object.freeze({
          kind: 'history' as const,
          period,
          date: dates[period],
          id: `${dates[period]}/history/${period}`,
          weather,
        }),
      ]),
    );
  }
  return Object.freeze([...rows, ...grid]);
}
