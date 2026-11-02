import { initializeDiagnostics } from '@/shared/diagnostics';
import { createApp, type Component } from 'vue';
import { createPinia } from 'pinia';
import { currentWeatherServicesKey, type CurrentWeatherServices } from '@/features/current-weather';
import { locate, type DeviceGeolocation } from '@/entities/location';
import {
  getCurrentWeather,
  getForecast,
  getWeatherHistory,
  getOpenMeteoCurrent,
  getOpenMeteoForecast,
  getOpenWeatherMapCurrent,
  getOpenWeatherMapForecast,
  withFallback,
  type Forecast,
} from '@/entities/weather';
import { forecastServicesKey, longestForecast, type ForecastServices } from '@/features/forecast';
import { historyServicesKey } from '@/features/history';
import { ApiError } from '@/shared/api';
/**
 * mountWeatherApp. Start the app with shared weather and location services
 *
 * @param root The platform specific root view.
 * @param device The optional native geolocation bridge.
 */
export function mountWeatherApp(root: Component, device?: DeviceGeolocation): void {
  const services: CurrentWeatherServices = {
    locate: (signal) => locate({ signal, ...(device ? { device, deviceTimeoutMs: 12000 } : {}) }),
    current: (location, locale, signal) =>
      withFallback(
        [
          (): ReturnType<CurrentWeatherServices['current']> =>
            getOpenMeteoCurrent({ location, locale, signal }),
          (): ReturnType<CurrentWeatherServices['current']> =>
            getCurrentWeather({ location, locale, signal }),
          (): ReturnType<CurrentWeatherServices['current']> =>
            getOpenWeatherMapCurrent({ location, locale, signal }),
        ],
        signal,
      ),
    now: Date.now,
  };

  const forecastServices: ForecastServices = createForecastServices();
  const app = createApp(root);
  initializeDiagnostics(
    app,
    device
      ? 'Android'
      : typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches
        ? 'PWA'
        : 'Browser',
  );
  app
    .use(createPinia())
    .provide(currentWeatherServicesKey, services)
    .provide(forecastServicesKey, forecastServices)
    .provide(historyServicesKey, {
      history: (context, date, signal) =>
        getWeatherHistory({
          location: context.location,
          timeZone: context.timeZone,
          locale: context.locale,
          date,
          signal,
        }),
    })
    .mount('#app');
}

/**
 * requireDays. Reject forecasts that contain too few days
 *
 * @param request The forecast response from one provider.
 * @param minimum The requested minimum number of local days.
 * @returns A forecast with enough days to display.
 */
async function requireDays(request: Promise<Forecast>, minimum: number): Promise<Forecast> {
  const forecast = await request;
  if (forecast.days.length < minimum) throw new ApiError('invalidResponse');
  return forecast;
}

/**
 * createForecastServices. Create the forecast services and provider fallback order
 *
 * @returns The shared forecast request service
 */
function createForecastServices(): ForecastServices {
  return {
    forecast: (location, locale, timeZone, days, now, signal) =>
      days === 16
        ? longestForecast(
            [
              (): Promise<Forecast> =>
                requireDays(
                  getOpenMeteoForecast({ location, locale, timeZone, days: 16, signal }),
                  3,
                ),
              (): Promise<Forecast> =>
                requireDays(
                  getForecast({
                    location,
                    locale,
                    timeZone,
                    days: 14,
                    signal,
                  }),
                  3,
                ),
              (): Promise<Forecast> =>
                requireDays(
                  getOpenWeatherMapForecast({
                    location,
                    locale,
                    timeZone,
                    days,
                    now,
                    signal,
                  }),
                  3,
                ),
            ],
            signal,
            16,
          )
        : withFallback(
            [
              (): Promise<Forecast> =>
                requireDays(
                  getOpenMeteoForecast({ location, locale, timeZone, days, signal }),
                  days,
                ),
              (): Promise<Forecast> =>
                requireDays(
                  getForecast({
                    location,
                    locale,
                    timeZone,
                    days,
                    signal,
                  }),
                  days,
                ),
              (): Promise<Forecast> =>
                requireDays(
                  getOpenWeatherMapForecast({
                    location,
                    locale,
                    timeZone,
                    days,
                    now,
                    signal,
                  }),
                  days,
                ),
            ],
            signal,
          ),
  };
}
