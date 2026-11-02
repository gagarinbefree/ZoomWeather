import type { Grid } from 'tikitaki';

export interface ForecastDaySlots {
  readonly date: string;
  readonly hours: readonly number[];
  readonly intervalHours?: 2 | 3;
}

export interface WeatherGridOptions {
  readonly now: number;
  readonly timeZone: string;
  readonly days: readonly ForecastDaySlots[];
  readonly intervalHours?: 2 | 3;
}

interface WeatherCellIdentity {
  readonly id: string;
  readonly date: string;
}

export interface CurrentWeatherCell extends WeatherCellIdentity {
  readonly kind: 'current';
  readonly timestamp: number;
}

export interface DailyWeatherCell extends WeatherCellIdentity {
  readonly kind: 'daily';
  readonly timestamp?: never;
}

export interface HourlyWeatherCell extends WeatherCellIdentity {
  readonly kind: 'hourly';
  readonly timestamp: number;
}

export type WeatherMapLayer = 'temp' | 'wind' | 'pressure';
export interface WeatherMapCell extends WeatherCellIdentity {
  readonly kind: 'map';
  readonly layer: WeatherMapLayer;
  readonly timestamp?: number;
}
export interface HistoryWeatherCell extends WeatherCellIdentity {
  readonly kind: 'history';
  readonly timestamp?: never;
  readonly period: 'yesterday' | 'yearAgo';
}

export type WeatherCell =
  CurrentWeatherCell | DailyWeatherCell | HourlyWeatherCell | WeatherMapCell | HistoryWeatherCell;
export type WeatherGrid = Grid<WeatherCell>;
