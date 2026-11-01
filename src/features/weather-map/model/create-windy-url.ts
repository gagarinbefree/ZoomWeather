import { isWindyForecastAvailable } from '@/shared/weather/windy-forecast-time';
import type { WeatherMapLayer } from '@/entities/weather';
import { validCoordinates } from '@/shared/api';
import { windyConfig } from '@/shared/config/windy';
import { messages, type Locale } from '@/shared/locales';

export interface MapLocation {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * createWindyUrl. Build a public weather map URL without API credentials.
 * @param layer The weather layer to display.
 * @param location The resolved coordinates for the map center.
 * @param locale The interface language and wind unit preference.
 * @param forecast The optional future map time and current clock.
 * @returns The official Windy iframe URL for the selected location and layer.
 */
export function createWindyUrl(
  layer: WeatherMapLayer,
  location: MapLocation,
  locale: Locale,
  forecast?: { readonly timestamp: number; readonly now: number },
): string {
  if (!validCoordinates(location.latitude, location.longitude))
    throw new RangeError(messages[locale].mapLocationInvalid);
  if (forecast && !isWindyForecastAvailable(forecast.timestamp, forecast.now))
    throw new RangeError(messages[locale].mapForecastUnavailable);
  const url = new URL(windyConfig.embedUrl);
  url.search = new URLSearchParams({
    type: 'map',
    calendar: 'now',
    location: 'coordinates',
    lat: String(location.latitude),
    lon: String(location.longitude),
    detailLat: String(location.latitude),
    detailLon: String(location.longitude),
    zoom: String(windyConfig.zoom),
    overlay: layer,
    level: 'surface',
    product: 'ecmwf',
    metricWind: locale === 'ru' ? 'm/s' : 'mph',
    metricTemp: '°C',
    metricRain: 'mm',
    lang: locale,
    marker: 'true',
    pressure: layer === 'pressure' ? 'true' : 'false',
  }).toString();
  if (forecast) {
    url.searchParams.set('calendar', 'in');
    url.searchParams.set('forecast', String((forecast.timestamp - forecast.now) / 3600000));
  }
  return url.href;
}
