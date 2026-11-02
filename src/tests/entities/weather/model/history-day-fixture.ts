import type { ForecastDay } from '@/entities/weather';
/**
 * historyDayFixture. Create a complete historical summary for navigation tests.
 * @param date The local historical date.
 * @returns A normalized daily summary without hourly cells.
 */
export function historyDayFixture(date: string): ForecastDay {
  return {
    date,
    maximum: 5,
    minimum: -1,
    humidity: 70,
    windSpeed: 18,
    rainChance: null,
    precipitation: 2.3,
    uv: null,
    conditionCode: 3,
    conditionText: '',
    conditionLocale: 'ru',
    sunrise: '08:30',
    sunset: '17:25',
    hours: [],
  };
}
