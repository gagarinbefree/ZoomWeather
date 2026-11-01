import type { WeatherCell, WeatherGrid, WeatherMapLayer } from './types';

/** The zero based daily anchor after the three map cards. */
export const weatherPrimaryColumn = 3;
const layers: readonly WeatherMapLayer[] = ['pressure', 'wind', 'temp'];

/**
 * addWeatherMaps. Place map cards before current weather only.
 * @param grid The forecast cells without map cards.
 * @returns A new grid preserving the original forecast cell identities.
 */
export function addWeatherMaps(grid: WeatherGrid): WeatherGrid {
  return Object.freeze(
    grid.map((row, index) => {
      if (index !== 0) return row;
      const date = row[0]?.date;
      if (!date) return row;
      const maps: readonly WeatherCell[] = layers.map((layer) =>
        Object.freeze({ kind: 'map', id: `${date}/map/${layer}`, date, layer }),
      );
      return Object.freeze([...maps, ...row]);
    }),
  );
}

/**
 * weatherRowStartColumn. Align future days with the current weather column.
 * @param row The zero based forecast row.
 * @returns The logical column of its first real cell without placeholders.
 */
export function weatherRowStartColumn(row: number): number {
  return row === 0 ? 0 : weatherPrimaryColumn;
}
