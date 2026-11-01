import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type LocationQuery } from '@/shared/api';
import { useCurrentWeatherStore, type CurrentWeatherServices } from '@/features/current-weather';
import { getCurrentWeather, useWeatherGridStore, type CurrentWeather } from '@/entities/weather';
import { currentResponse } from '@/tests/entities/weather/api/current-fixture';

beforeEach(() => setActivePinia(createPinia()));

/**
 * services. Create predictable weather services for store tests
 *
 * @returns Deterministic services for the current weather flow.
 */
function services(): CurrentWeatherServices {
  return {
    locate: vi.fn().mockResolvedValue({
      source: 'device',
      latitude: 58,
      longitude: 56.25,
      countryCode: 'RU',
      city: 'Perm',
    }),
    current: (location, locale, signal) =>
      getCurrentWeather({
        location,
        locale,
        signal,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(currentResponse)),
      }),
    now: () => currentResponse.location.localtime_epoch * 1000,
  };
}

describe('current weather flow', () => {
  it('locates first and shows A1 immediately without requesting the forecast', async () => {
    const store = useCurrentWeatherStore();
    const dependencies = services();
    await store.load(dependencies);
    expect(dependencies.locate).toHaveBeenCalledTimes(1);
    expect(store.state).toMatchObject({ status: 'ready', weather: { temperature: 8.9 } });
    expect(store.state).toMatchObject({
      location: { source: 'device', city: 'Perm', countryCode: 'RU' },
    });
    expect(store.locale).toBe('ru');
    expect(useWeatherGridStore().grid).toHaveLength(1);
    expect(useWeatherGridStore().grid[0]).toHaveLength(1);
  });

  it('exposes a recoverable failure and supports retry', async () => {
    const store = useCurrentWeatherStore();
    await store.load({
      ...services(),
      current: (): Promise<CurrentWeather> => Promise.reject(new ApiError('timeout')),
    });
    expect(store.state).toEqual({ status: 'error', failure: 'timeout' });
    await store.load(services());
    expect(store.state.status).toBe('ready');
  });

  it('keeps saved weather after the same place is resolved and the weather request fails', async () => {
    const store = useCurrentWeatherStore();
    await store.load(services());
    if (store.state.status !== 'ready') throw new Error('Missing weather fixture');
    const snapshot = {
      version: 1 as const,
      savedAt: store.state.now,
      locale: store.locale,
      weather: store.state.weather,
      forecast: { days: [] },
    };
    store.restore(snapshot);
    expect(store.state).toMatchObject({ status: 'ready', cachedAt: snapshot.savedAt });
    await store.load({
      ...services(),
      current: (): Promise<CurrentWeather> => Promise.reject(new ApiError('timeout')),
    });
    expect(store.state).toMatchObject({ status: 'ready', cachedAt: snapshot.savedAt });
    await store.load(services());
    expect(store.state).toMatchObject({ status: 'ready', cachedAt: null });
  });

  it('keeps the selected language when a keyless provider has no country name', async () => {
    const store = useCurrentWeatherStore();
    await store.load({
      ...services(),
      locate: (): Promise<LocationQuery> =>
        Promise.resolve({
          source: 'ip',
          latitude: 58,
          longitude: 56.25,
          countryCode: 'RU',
          city: 'Perm',
        }),
      current: async (): Promise<CurrentWeather> => ({
        ...(await services().current({ source: 'automatic' }, 'ru', new AbortController().signal)),
        country: '',
      }),
    });
    expect(store.locale).toBe('ru');
    expect(store.state).toMatchObject({ weather: { country: 'RU' } });
  });

  it('requests Russian weather for a resolved Russian device location', async () => {
    const store = useCurrentWeatherStore();
    const current = vi.fn(services().current);
    await store.load({
      ...services(),
      locate: (): Promise<LocationQuery> =>
        Promise.resolve({
          source: 'device',
          latitude: 58.0047,
          longitude: 56.2514,
          countryCode: 'RU',
          city: 'Пермь',
        }),
      current,
    });
    expect(store.locale).toBe('ru');
    expect(current).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Пермь' }),
      'ru',
      expect.any(AbortSignal),
    );
  });

  it('ignores an old response after retry and cancellation', async () => {
    const store = useCurrentWeatherStore();
    const dependencies = services();
    let release: (() => void) | undefined;
    const first = store.load({
      ...dependencies,
      locate: (): Promise<LocationQuery> =>
        new Promise((resolve) => {
          release = (): void => {
            resolve({ source: 'automatic' });
          };
        }),
    });
    await store.load(dependencies);
    release?.();
    await first;
    expect(store.state.status).toBe('ready');
    const current = vi.fn(dependencies.current);
    const pending = store.load({ ...dependencies, current });
    store.cancel();
    await pending;
    expect(current).not.toHaveBeenCalled();
  });
});

it('does not request weather until coordinates city and country are resolved', async () => {
  const store = useCurrentWeatherStore();
  const current = vi.fn(services().current);
  await store.load({
    ...services(),
    current,
    locate: (): Promise<LocationQuery> =>
      Promise.resolve({ source: 'device', latitude: 58, longitude: 56.25, countryCode: null }),
  });
  expect(current).not.toHaveBeenCalled();
  expect(store.state).toEqual({ status: 'error', failure: 'location' });
});

it('shows saved weather while the current place is still being resolved', async () => {
  const store = useCurrentWeatherStore();
  await store.load(services());
  if (store.state.status !== 'ready') throw new Error('Missing weather fixture');
  store.restore({
    version: 1,
    savedAt: store.state.now,
    locale: store.locale,
    weather: store.state.weather,
    forecast: { days: [] },
  });
  let release: (() => void) | undefined;
  const pending = store.load({
    ...services(),
    locate: () =>
      new Promise((resolve) => {
        release = (): void => {
          resolve({
            source: 'device',
            latitude: 58,
            longitude: 56.25,
            countryCode: 'RU',
            city: 'Perm',
          });
        };
      }),
  });
  expect(store.state).toMatchObject({ status: 'ready', weather: { city: 'Perm' } });
  release?.();
  await pending;
  expect(store.state.status).toBe('ready');
});

it('keeps the saved forecast when weather for a newly resolved city cannot be loaded', async () => {
  const store = useCurrentWeatherStore();
  await store.load(services());
  if (store.state.status !== 'ready') throw new Error('Missing weather fixture');
  store.restore({
    version: 1,
    savedAt: store.state.now,
    locale: store.locale,
    weather: store.state.weather,
    forecast: { days: [] },
  });
  await store.load({
    ...services(),
    locate: (): Promise<LocationQuery> =>
      Promise.resolve({
        source: 'device',
        latitude: 51.5,
        longitude: -0.1,
        countryCode: 'GB',
        city: 'London',
      }),
    current: (): Promise<CurrentWeather> => Promise.reject(new ApiError('timeout')),
  });
  expect(store.state).toMatchObject({ status: 'ready', weather: { city: 'Perm' } });
});

it('restores a saved forecast even if its old place names are incomplete', async () => {
  const weather = await services().current(
    { source: 'automatic' },
    'ru',
    new AbortController().signal,
  );
  const store = useCurrentWeatherStore();
  store.restore({
    version: 1,
    savedAt: 100,
    locale: 'en',
    weather: { ...weather, city: '58.00, 56.25', country: '' },
    forecast: { days: [] },
  });
  expect(store.state).toMatchObject({ status: 'ready', cachedAt: 100 });
});

describe('pull refresh', () => {
  it('keeps the current card and grid while locating and fetching fresh weather', async () => {
    const store = useCurrentWeatherStore();
    await store.load(services());
    const previous = store.state;
    const grid = useWeatherGridStore().grid;
    let release: ((value: LocationQuery) => void) | undefined;
    const pending = store.load(
      {
        ...services(),
        locate: () =>
          new Promise<LocationQuery>((resolve) => {
            release = resolve;
          }),
      },
      { preserveCurrent: true },
    );
    expect(store.loading).toBe(true);
    expect(store.state).toBe(previous);
    expect(useWeatherGridStore().grid).toBe(grid);
    release?.({
      source: 'device',
      latitude: 58,
      longitude: 56.25,
      city: 'Perm',
      countryCode: 'RU',
    });
    await expect(pending).resolves.toBe(true);
    expect(store.loading).toBe(false);
  });

  it('keeps the previous reading silently when refreshing fails', async () => {
    const store = useCurrentWeatherStore();
    await store.load(services());
    const previous = store.state;
    const grid = useWeatherGridStore().grid;
    await expect(
      store.load(
        {
          ...services(),
          current: () => Promise.reject(new ApiError('timeout')),
        },
        { preserveCurrent: true },
      ),
    ).resolves.toBe(false);
    expect(store.state).toBe(previous);
    expect(useWeatherGridStore().grid).toBe(grid);
    await store.load(services(), { preserveCurrent: true });
  });

  it('aborts the request with the gesture and ignores a late location response', async () => {
    const store = useCurrentWeatherStore();
    await store.load(services());
    const previous = store.state;
    const controller = new AbortController();
    let release: ((value: LocationQuery) => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    const current = vi.fn(services().current);
    const pending = store.load(
      {
        ...services(),
        current,
        locate: (signal) => {
          requestSignal = signal;
          return new Promise<LocationQuery>((resolve) => {
            release = resolve;
          });
        },
      },
      { preserveCurrent: true, signal: controller.signal },
    );
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
    expect(store.loading).toBe(false);
    release?.({
      source: 'device',
      latitude: 58,
      longitude: 56.25,
      city: 'Perm',
      countryCode: 'RU',
    });
    await expect(pending).resolves.toBe(false);
    expect(current).not.toHaveBeenCalled();
    expect(store.state).toBe(previous);
  });
});

it('ignores an already cancelled refresh without replacing the current card', async () => {
  const store = useCurrentWeatherStore();
  await store.load(services());
  const previous = store.state;
  const controller = new AbortController();
  controller.abort();
  const dependencies = services();
  await expect(
    store.load(dependencies, { preserveCurrent: true, signal: controller.signal }),
  ).resolves.toBe(false);
  expect(dependencies.locate).not.toHaveBeenCalled();
  expect(store.state).toBe(previous);
});

it('does not let an old gesture cancel a newer request', async () => {
  const store = useCurrentWeatherStore();
  await store.load(services());
  const oldGesture = new AbortController();
  let releaseOld: ((value: LocationQuery) => void) | undefined;
  let releaseNew: ((value: LocationQuery) => void) | undefined;
  const oldRequest = store.load(
    {
      ...services(),
      locate: () =>
        new Promise<LocationQuery>((resolve) => {
          releaseOld = resolve;
        }),
    },
    { preserveCurrent: true, signal: oldGesture.signal },
  );
  const next = store.load(
    {
      ...services(),
      locate: () =>
        new Promise<LocationQuery>((resolve) => {
          releaseNew = resolve;
        }),
    },
    { preserveCurrent: true },
  );
  oldGesture.abort();
  expect(store.loading).toBe(true);
  releaseNew?.({
    source: 'device',
    latitude: 58,
    longitude: 56.25,
    city: 'New city',
    countryCode: 'RU',
  });
  await expect(next).resolves.toBe(true);
  releaseOld?.({
    source: 'device',
    latitude: 58,
    longitude: 56.25,
    city: 'Old city',
    countryCode: 'RU',
  });
  await expect(oldRequest).resolves.toBe(false);
  expect(store.state).toMatchObject({ status: 'ready', weather: { city: 'New city' } });
});
