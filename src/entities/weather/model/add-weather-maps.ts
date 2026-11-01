import { windyForecastTime, isWindyForecastAvailable } from '@/shared/weather/windy-forecast-time';
import type { WeatherCell, WeatherGrid, WeatherMapLayer } from './types';

/** The zero based daily anchor after the three map cards. */
export const weatherPrimaryColumn = 3;
const layers: readonly WeatherMapLayer[] = ['pressure', 'wind', 'temp'];

/**
 * addWeatherMaps. Place map cards before current weather and supported daily forecasts.
 * @param grid The forecast cells without map cards.
 * @param options The current clock and weather location time zone.
 * @returns A new grid preserving the original forecast cell identities.
 */
export function addWeatherMaps(
  grid: WeatherGrid,
  options: { readonly now: number; readonly timeZone: string },
): WeatherGrid {
  return Object.freeze(
    grid.map((row) => {
      const anchor = row[0];
      const date = anchor?.date;
      if (!date) return row;
      if (anchor.kind !== 'current' && anchor.kind !== 'daily') return row;
      const timestamp = anchor.kind === 'daily' ? windyForecastTime(date, options.timeZone) : null;
      if (
        anchor.kind === 'daily' &&
        (timestamp === null || !isWindyForecastAvailable(timestamp, options.now))
      )
        return row;
      const maps: readonly WeatherCell[] = layers.map((layer) =>
        Object.freeze({
          kind: 'map',
          id: `${date}/map/${layer}`,
          date,
          layer,
          ...(timestamp === null ? {} : { timestamp }),
        }),
      );
      return Object.freeze([...maps, ...row]);
    }),
  );
}

/**
 * weatherRowStartColumn. Align future days with the current weather column.
 * @param grid The forecast grid with any available map cards.
 * @param row The zero based forecast row.
 * @returns The logical column of its first real cell without placeholders.
 */
export function weatherRowStartColumn(grid: WeatherGrid, row: number): number {
  return grid[row]?.[0]?.kind === 'map' ? 0 : weatherPrimaryColumn;
}
