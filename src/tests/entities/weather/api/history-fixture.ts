/**
 * historyFixture. Create native archive data for a requested local date.
 * @param date The historical date returned by the provider.
 * @returns One complete native daily history summary.
 */
export function historyFixture(date: string): {
  daily: Record<string, readonly (number | string)[]>;
} {
  return {
    daily: {
      time: [date],
      temperature_2m_max: [5],
      temperature_2m_min: [-1],
      relative_humidity_2m_mean: [70],
      wind_speed_10m_max: [18],
      weather_code: [3],
      sunrise: [`${date}T08:30`],
      sunset: [`${date}T17:25`],
      precipitation_sum: [2.3],
    },
  };
}
