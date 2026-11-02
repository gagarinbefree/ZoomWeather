import type { WeatherProvider } from './weather-provider';

export interface ForecastHour {
  readonly timestamp: number;
  readonly temperature: number;
  readonly feelsLike: number;
  readonly humidity: number;
  /** Wind speed in kilometers per hour before display conversion. */
  readonly windSpeed: number;
  readonly windDirection: string;
  readonly rainChance: number;
  readonly uv: number | null;
  readonly pressure: number;
  readonly visibility: number | null;
  readonly conditionCode: number;
  readonly conditionText: string;
  readonly conditionLocale: 'ru' | 'en';
  readonly isDay: boolean;
}

export interface ForecastDay {
  /** Historical precipitation amount in millimeters when available. */
  readonly precipitation?: number;
  readonly provider?: WeatherProvider;
  readonly serverCachedAt?: number;
  readonly date: string;
  readonly maximum: number;
  readonly minimum: number;
  readonly humidity: number;
  /** Wind speed in kilometers per hour before display conversion. */
  readonly windSpeed: number;
  readonly rainChance: number | null;
  readonly uv: number | null;
  readonly conditionCode: number;
  readonly conditionText: string;
  readonly conditionLocale: 'ru' | 'en';
  readonly sunrise: string | null | undefined;
  readonly sunset: string | null | undefined;
  readonly hours: readonly ForecastHour[];
  readonly intervalHours?: 2 | 3;
}

export interface Forecast {
  readonly serverCachedAt?: number;
  readonly days: readonly ForecastDay[];
  readonly intervalHours?: 2 | 3;
}
