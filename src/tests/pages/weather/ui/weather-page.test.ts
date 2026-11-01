import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { WeatherPage } from '@/pages/weather';
import { WeatherGrid } from '@/widgets/weather-grid';
import { getCurrentWeather, getForecast, type Forecast } from '@/entities/weather';
import { forecastServicesKey, useForecastStore, type ForecastServices } from '@/features/forecast';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';
import { ApiError } from '@/shared/api';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';
import { currentWeatherServicesKey } from '@/features/current-weather';
import {
  installBrowserEnvironment,
  type BrowserTestEnvironment,
} from '@/tests/shared/lib/browser-environment';

let environment: BrowserTestEnvironment;
beforeEach(() => {
  localStorage.clear();
  environment = installBrowserEnvironment();
});
afterEach(() => {
  environment.restore();
});

describe('WeatherPage', () => {
  it('renders a semantic page and a named loading indicator', async () => {
    const wrapper = mount(WeatherPage, {
      global: {
        plugins: [createPinia()],
        provide: {
          [currentWeatherServicesKey as symbol]: {
            locate: () => new Promise(() => undefined),
            current: vi.fn(),
            now: Date.now,
          },
        },
      },
    });
    await nextTick();

    expect(wrapper.find('main').exists()).toBe(true);
    expect(wrapper.find('h1').text()).toBe('ZoomWeather');
    expect(wrapper.find('[role="status"]').text()).toContain('Detecting location...');
    expect(wrapper.find('.spinner-border').exists()).toBe(true);
    wrapper.unmount();
  });
});

it('silently keeps the last current card after a failed pull refresh and accepts the next refresh', async () => {
  const reading = await getCurrentWeather({
    locale: 'ru',
    location: { source: 'automatic' },
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse)),
  });
  const current = vi
    .fn()
    .mockResolvedValueOnce(reading)
    .mockRejectedValueOnce(new ApiError('timeout'))
    .mockResolvedValueOnce({ ...reading, temperature: 10 });
  const wrapper = mount(WeatherPage, {
    global: {
      plugins: [createPinia()],
      provide: {
        [currentWeatherServicesKey as symbol]: {
          locate: vi.fn().mockResolvedValue({
            source: 'device',
            latitude: 58,
            longitude: 56.25,
            city: 'Perm',
            countryCode: 'RU',
          }),
          current,
          now: () => currentResponse.location.localtime_epoch * 1000,
        },
      },
    },
  });
  try {
    await flushPromises();
    await environment.settle();
    const refresh = wrapper.getComponent(WeatherGrid).props('refresh') as
      ((signal: AbortSignal) => Promise<void>) | undefined;
    expect(refresh).toBeTypeOf('function');
    const pending = refresh?.(new AbortController().signal);
    expect(wrapper.find('article').text()).toContain('8,9°C');
    await pending;
    await environment.settle();
    expect(wrapper.find('article').text()).toContain('8,9°C');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await refresh?.(new AbortController().signal);
    await environment.settle();
    expect(wrapper.find('article').text()).toContain('10°C');
    expect(current).toHaveBeenCalledTimes(3);
  } finally {
    wrapper.unmount();
  }
});

it('keeps an in flight forecast alive when refreshing the current weather fails', async () => {
  const reading = await getCurrentWeather({
    locale: 'ru',
    location: { source: 'automatic' },
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse)),
  });
  const data = await getForecast({
    locale: 'ru',
    location: { source: 'automatic' },
    timeZone: reading.timeZone,
    days: 3,
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(forecastResponse)),
  });
  let finishForecast: ((value: Forecast) => void) | undefined;
  const pending = new Promise<Forecast>((resolve) => {
    finishForecast = resolve;
  });
  let initialSignal: AbortSignal | undefined;
  const dependencies: ForecastServices = {
    forecast: (_location, _locale, _zone, _days, _now, signal) => {
      initialSignal ??= signal;
      return pending;
    },
  };
  const pinia = createPinia();
  const wrapper = mount(WeatherPage, {
    global: {
      plugins: [pinia],
      provide: {
        [currentWeatherServicesKey as symbol]: {
          locate: vi.fn().mockResolvedValue({
            source: 'device',
            latitude: 58,
            longitude: 56.25,
            city: 'Perm',
            countryCode: 'RU',
          }),
          current: vi
            .fn()
            .mockResolvedValueOnce(reading)
            .mockRejectedValueOnce(new ApiError('timeout')),
          now: () => currentResponse.location.localtime_epoch * 1000,
        },
        [forecastServicesKey as symbol]: dependencies,
      },
    },
  });
  try {
    await flushPromises();
    await environment.settle();
    const refresh = wrapper.getComponent(WeatherGrid).props('refresh') as (
      signal: AbortSignal,
    ) => Promise<void>;
    await refresh(new AbortController().signal);
    expect(initialSignal?.aborted).toBe(false);
    finishForecast?.(data);
    await flushPromises();
    await environment.settle();
    expect(useForecastStore(pinia).days).toHaveLength(3);
  } finally {
    finishForecast?.(data);
    wrapper.unmount();
  }
});
