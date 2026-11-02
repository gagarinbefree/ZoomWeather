import { messages } from '@/shared/locales';
import type { WeatherGrid } from './types';

/** The current weather row below the two historical rows. */
export const weatherPrimaryRow = 2;
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
 * addWeatherHistory. Add two single card rows above the current weather without changing its identity.
 * @param grid The current and future weather rows with any map cards.
 * @returns The decorated grid with history aligned to the main weather column.
 */
export function addWeatherHistory(grid: WeatherGrid): WeatherGrid {
  const today = grid.flat().find((cell) => cell.kind === 'current')?.date;
  if (!today) return grid;
  const dates = weatherHistoryDates(today);
  return Object.freeze([
    ...(['yearAgo', 'yesterday'] as const).map((period) =>
      Object.freeze([
        Object.freeze({
          kind: 'history' as const,
          period,
          date: dates[period],
          id: `${dates[period]}/history/${period}`,
        }),
      ]),
    ),
    ...grid,
  ]);
}
