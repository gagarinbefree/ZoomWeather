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
 * @returns The official Windy iframe URL for the selected location and layer.
 */
export function createWindyUrl(
  layer: WeatherMapLayer,
  location: MapLocation,
  locale: Locale,
): string {
  if (!validCoordinates(location.latitude, location.longitude))
    throw new RangeError(messages[locale].mapLocationInvalid);
  const url = new URL(windyConfig.embedUrl);
  url.search = new URLSearchParams({
    type: 'map',
    location: 'coordinates',
    lat: String(location.latitude),
    lon: String(location.longitude),
    detailLat: String(location.latitude),
    detailLon: String(location.longitude),
    zoom: String(windyConfig.zoom),
    overlay: layer,
    level: 'surface',
    metricWind: locale === 'ru' ? 'm/s' : 'mph',
    metricTemp: '°C',
    metricRain: 'mm',
    lang: locale,
    marker: 'true',
    pressure: layer === 'pressure' ? 'true' : 'false',
  }).toString();
  return url.href;
}
