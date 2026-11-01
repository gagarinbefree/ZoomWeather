import { reportFailure } from '@/shared/diagnostics';
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { useWeatherGridStore, type CurrentWeather, type WeatherSnapshot } from '@/entities/weather';
import { isResolvedLocation } from '@/entities/location';
import { ApiError, type FailureKind, type LocationQuery } from '@/shared/api';
import { localeForCountry, browserLocale } from '@/shared/locales';
import type { CurrentWeatherServices } from './services';

interface WeatherLoadOptions {
  readonly preserveCurrent?: boolean;
  readonly signal?: AbortSignal;
}

type CurrentWeatherState =
  | { readonly status: 'loading'; readonly phase: 'location' | 'weather' }
  | {
      readonly status: 'ready';
      readonly weather: CurrentWeather;
      readonly location: LocationQuery;
      readonly now: number;
      readonly cachedAt: number | null;
    }
  | { readonly status: 'error'; readonly failure: FailureKind };

/**
 * useCurrentWeatherStore. Manage location detection and current weather loading
 *
 * @returns The cancellable device location and current observation flow.
 */
export const useCurrentWeatherStore = defineStore('current-weather', () => {
  const grid = useWeatherGridStore();
  const locale = shallowRef(browserLocale());
  const state = shallowRef<CurrentWeatherState>({ status: 'loading', phase: 'location' });
  const loading = shallowRef(false);
  let controller: AbortController | null = null;
  let revision = 0;

  /**
   * cancel. Cancel the current weather request and discard pending results
   */
  function cancel(): void {
    revision++;
    controller?.abort();
    controller = null;
    loading.value = false;
  }

  /**
   * restore. Restore saved current weather and rebuild its grid
   *
   * @param snapshot The last normalized weather saved in this browser.
   * @param now The current instant used for the restored grid.
   */
  function restore(snapshot: WeatherSnapshot, now = Date.now()): void {
    cancel();
    locale.value = snapshot.locale;
    grid.update({ now, timeZone: snapshot.weather.timeZone, days: [] });
    state.value = {
      status: 'ready',
      weather: snapshot.weather,
      location: { source: 'automatic' },
      now,
      cachedAt: snapshot.savedAt,
    };
  }

  /**
   * offline. Show a connection error when no saved weather is available
   */
  function offline(): void {
    if (state.value.status !== 'ready') state.value = { status: 'error', failure: 'connection' };
  }

  /**
   * load. Find the location and load its current weather.
   *
   * @param services The location and current weather dependencies for this session.
   * @param options The optional cancellation signal and current card preservation.
   * @returns Whether fresh weather was committed before cancellation or failure.
   */
  async function load(
    services: CurrentWeatherServices,
    options: WeatherLoadOptions = {},
  ): Promise<boolean> {
    if (options.signal?.aborted) return false;
    cancel();
    const token = revision;
    const active = new AbortController();
    controller = active;
    loading.value = true;
    const previousLocale = locale.value;
    const keepCurrent =
      state.value.status === 'ready' &&
      (state.value.cachedAt !== null || options.preserveCurrent === true);
    /**
     * abort. Cancel only the request owned by the current gesture.
     */
    function abort(): void {
      if (controller === active) cancel();
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    if (!keepCurrent) state.value = { status: 'loading', phase: 'location' };
    try {
      const location = await services.locate(active.signal);
      if (token !== revision) return false;
      if (!isResolvedLocation(location)) throw new ApiError('location');
      const requestedLocale = localeForCountry(location.countryCode);
      if (!keepCurrent) {
        locale.value = requestedLocale;
        state.value = { status: 'loading', phase: 'weather' };
      }
      const reading = await services.current(location, requestedLocale, active.signal);
      if (token !== revision) return false;
      const weather = {
        ...reading,
        city: location.city,
        country: reading.country.trim() || location.countryCode,
      };
      locale.value = weather.country.trim() ? localeForCountry(weather.country) : requestedLocale;
      const now = services.now();
      grid.update({ now, timeZone: weather.timeZone, days: [] });
      state.value = { status: 'ready', weather, location, now, cachedAt: null };
      return true;
    } catch (error) {
      if (token !== revision) return false;
      reportFailure(error, 'current', keepCurrent);
      if (keepCurrent) locale.value = previousLocale;
      else
        state.value = {
          status: 'error',
          failure: error instanceof ApiError ? error.kind : 'connection',
        };
      return false;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (token === revision) {
        controller = null;
        loading.value = false;
      }
    }
  }

  return { state, locale, loading, load, restore, offline, cancel };
});
