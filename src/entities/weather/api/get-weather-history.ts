import {
  ApiError,
  numeric,
  record,
  requestWeatherJson,
  validCoordinates,
  weatherEndpoint,
  type LocationQuery,
  type RequestOptions,
} from '@/shared/api';
import { conditionLabel, type Locale } from '@/shared/locales';
import type { ForecastDay } from '@/entities/weather/model/forecast';

interface HistoryOptions extends RequestOptions {
  readonly location: LocationQuery;
  readonly date: string;
  readonly timeZone: string;
  readonly locale: Locale;
}

/**
 * getWeatherHistory. Load one historical daily summary through our server.
 * @param options The requested local date and resolved location with cancellable transport.
 * @returns The normalized historical day without hourly cards or invented probabilities.
 */
export async function getWeatherHistory(options: HistoryOptions): Promise<ForecastDay> {
  const { location, date } = options;
  if (location.source === 'automatic' || !validCoordinates(location.latitude, location.longitude))
    throw new ApiError('location');
  const url = weatherEndpoint('api/open-meteo/v1/archive');
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: options.timeZone,
    start_date: date,
    end_date: date,
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    daily:
      'temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,wind_speed_10m_max,weather_code,sunrise,sunset,precipitation_sum',
  }).toString();
  const { payload, serverCachedAt } = await requestWeatherJson(url.toString(), options);
  const daily = record(record(payload)['daily']);
  const times = daily['time'];
  if (!Array.isArray(times) || times.length !== 1 || times[0] !== date)
    throw new ApiError('invalidResponse');
  /**
   * measurement. Read one required daily number.
   * @param field The provider variable name.
   * @param minimum The smallest supported value.
   * @param maximum The largest supported value.
   * @returns The validated finite measurement.
   */
  function measurement(field: string, minimum = -Infinity, maximum = Infinity): number {
    const values = daily[field];
    if (!Array.isArray(values) || values.length !== 1) throw new ApiError('invalidResponse');
    return numeric(values[0], minimum, maximum);
  }
  /**
   * sunTime. Read a local sunrise or sunset without applying the device time zone.
   * @param field The solar event variable name.
   * @returns The local clock time or no event when the provider returns null.
   */
  function sunTime(field: string): string | null {
    const values = daily[field];
    if (!Array.isArray(values) || values.length !== 1) throw new ApiError('invalidResponse');
    const value: unknown = values[0];
    if (value === null) return null;
    if (
      typeof value !== 'string' ||
      !value.startsWith(`${date}T`) ||
      !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)
    )
      throw new ApiError('invalidResponse');
    return value.slice(11);
  }
  const maximum = measurement('temperature_2m_max', -150, 100);
  const minimum = measurement('temperature_2m_min', -150, maximum);
  const conditionCode = measurement('weather_code', 0, 99);
  return {
    provider: 'open-meteo',
    ...(serverCachedAt === undefined ? {} : { serverCachedAt }),
    date,
    maximum,
    minimum,
    humidity: measurement('relative_humidity_2m_mean', 0, 100),
    windSpeed: measurement('wind_speed_10m_max', 0),
    precipitation: measurement('precipitation_sum', 0),
    rainChance: null,
    uv: null,
    conditionCode,
    conditionText: conditionLabel(conditionCode, true, options.locale),
    conditionLocale: options.locale,
    sunrise: sunTime('sunrise'),
    sunset: sunTime('sunset'),
    hours: [],
  };
}
