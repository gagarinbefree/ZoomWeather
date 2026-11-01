import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherCell } from '@/entities/weather';
import { WeatherGrid } from '@/widgets/weather-grid';
import {
  installBrowserEnvironment,
  type BrowserTestEnvironment,
} from '@/tests/shared/lib/browser-environment';
import { fixtureGrid } from '@/tests/widgets/weather-grid/fixtures/grid';
import ProbeCell from '@/tests/widgets/weather-grid/fixtures/ProbeCell.vue';

let environment: BrowserTestEnvironment;
const wrappers: { unmount: () => void }[] = [];

beforeEach(() => {
  environment = installBrowserEnvironment();
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  environment.restore();
  document.body.replaceChildren();
});

/**
 * renderGrid. Mount the weather grid with test weather data
 *
 * @param refresh The optional cancellable refresh callback.
 * @returns A mounted weather grid using the real TikiTaki Vue adapter.
 */
function renderGrid(
  refresh?: (signal: AbortSignal) => Promise<void>,
): ReturnType<typeof mount<typeof WeatherGrid>> {
  const wrapper = mount(WeatherGrid, {
    attachTo: document.body,
    props: { grid: fixtureGrid, ...(refresh ? { refresh } : {}) },
    global: { plugins: [createPinia()], provide: { 'test-context': 'parent' } },
    slots: {
      default: ({ cell }: { readonly cell: WeatherCell }) => h(ProbeCell, { id: cell.id }),
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe('WeatherGrid', () => {
  it('mounts only the current cell and valid neighboring cells', async () => {
    const wrapper = renderGrid();
    await nextTick();

    expect(wrapper.findAll('[data-cell-id]')).toHaveLength(3);
    expect(
      wrapper.find('[data-tikitaki-role="current"] [data-cell-id]').attributes('data-cell-id'),
    ).toBe('2026-10-26/current');
    expect(wrapper.find('[data-tikitaki-role="right"]').exists()).toBe(false);
    expect(wrapper.find('[data-tikitaki-role="down"]').exists()).toBe(false);
    expect(wrapper.find('[data-tikitaki-role="up"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get<HTMLElement>('[data-tikitaki-role="up"]').element.inert).toBe(true);
  });

  it('preserves Vue injection and Pinia inside teleported cell components', async () => {
    const wrapper = renderGrid();
    await nextTick();

    expect(wrapper.find('[data-tikitaki-role="current"] [data-probe-context]').text()).toBe(
      'parent 1',
    );
  });

  it('moves horizontally and always opens the first cell on a vertical transition', async () => {
    const wrapper = renderGrid();
    const viewport = wrapper.get('.weather-viewport');
    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();
    expect(viewport.attributes('data-column')).toBe('1');

    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();
    expect(viewport.attributes('data-column')).toBe('2');

    await viewport.trigger('keydown', { key: 'ArrowDown' });
    await environment.settle();
    expect(viewport.attributes('data-row')).toBe('1');
    expect(viewport.attributes('data-column')).toBe('0');
    expect(viewport.attributes('data-active-cell')).toBe('2026-10-27/daily');

    await viewport.trigger('keydown', { key: 'ArrowUp' });
    await environment.settle();
    expect(viewport.attributes('data-active-cell')).toBe('2026-10-26/current');
  });

  it('preserves the column on a vertical boundary and blocks horizontal movement in a short row', async () => {
    const wrapper = renderGrid();
    const viewport = wrapper.get('.weather-viewport');
    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();
    await viewport.trigger('keydown', { key: 'ArrowUp' });
    await environment.settle();
    expect(viewport.attributes('data-column')).toBe('1');

    await viewport.trigger('keydown', { key: 'ArrowDown' });
    await environment.settle();
    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();
    expect(viewport.attributes('data-active-cell')).toBe('2026-10-27/daily');
  });

  it('keeps surviving component state during a navigation round trip', async () => {
    const wrapper = renderGrid();
    await nextTick();
    const button = wrapper.get('[data-tikitaki-role="current"] button');
    await button.trigger('click');
    const viewport = wrapper.get('.weather-viewport');
    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();
    await viewport.trigger('keydown', { key: 'ArrowLeft' });
    await environment.settle();

    expect(wrapper.get('[data-tikitaki-role="current"] button').text()).toBe('1');
  });

  it('keeps the selected cell when earlier forecast days arrive', async () => {
    const wrapper = renderGrid();
    const viewport = wrapper.get('.weather-viewport');
    await viewport.trigger('keydown', { key: 'ArrowDown' });
    await environment.settle();
    await viewport.trigger('keydown', { key: 'ArrowDown' });
    await environment.settle();
    expect(viewport.attributes('data-active-cell')).toBe('2026-10-28/daily');

    await wrapper.setProps({ grid: [fixtureGrid[0] ?? [], fixtureGrid[2] ?? []] });
    await environment.settle();
    expect(viewport.attributes('data-active-cell')).toBe('2026-10-28/daily');
    expect(viewport.attributes('data-row')).toBe('1');

    await wrapper.setProps({ grid: fixtureGrid });
    await environment.settle();
    expect(viewport.attributes('data-active-cell')).toBe('2026-10-28/daily');
    expect(viewport.attributes('data-row')).toBe('2');
  });

  it('selects a valid cell if the selected forecast is removed', async () => {
    const wrapper = renderGrid();
    const viewport = wrapper.get('.weather-viewport');
    await viewport.trigger('keydown', { key: 'ArrowDown' });
    await environment.settle();
    await wrapper.setProps({ grid: [fixtureGrid[0] ?? []] });
    await environment.settle();

    expect(viewport.attributes('data-active-cell')).toBe('2026-10-26/current');
  });

  it('does not take arrow keys from controls inside a card', async () => {
    const wrapper = renderGrid();
    await nextTick();
    await wrapper
      .get('[data-tikitaki-role="current"] button')
      .trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();

    expect(wrapper.get('.weather-viewport').attributes('data-column')).toBe('0');
  });

  it('does not queue rapid keyboard commands during an active transition', async () => {
    const wrapper = renderGrid();
    const viewport = wrapper.get('.weather-viewport');
    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await viewport.trigger('keydown', { key: 'ArrowRight' });
    await environment.settle();

    expect(viewport.attributes('data-column')).toBe('1');
  });

  it('releases observers and pending frames on unmount and can mount again', async () => {
    const wrapper = renderGrid();
    await wrapper.get('.weather-viewport').trigger('keydown', { key: 'ArrowRight' });
    wrapper.unmount();
    await environment.settle();
    expect(environment.observers.size).toBe(0);
    expect(environment.frames.size).toBe(0);

    const second = renderGrid();
    await second.get('.weather-viewport').trigger('keydown', { key: 'ArrowDown' });
    await environment.settle();
    expect(environment.observers.size).toBe(1);
    expect(second.get('.weather-viewport').attributes('data-active-cell')).toBe('2026-10-27/daily');
  });

  it('reports invalid grids through a localized error and releases the engine', async () => {
    const wrapper = renderGrid();
    await wrapper.setProps({ grid: [] });
    await environment.settle();

    expect(wrapper.get('[role="alert"]').text()).toBe('Не удалось открыть прогноз');
    expect(wrapper.emitted('error')).toHaveLength(1);
    expect(environment.observers.size).toBe(0);
    expect(wrapper.find('[data-tikitaki-engine]').exists()).toBe(false);
  });
});

/**
 * dragDown. Dispatch a captured downward pull on the forecast viewport.
 * @param viewport The real TikiTaki container.
 * @param distance The finger travel in CSS pixels.
 */
function dragDown(viewport: HTMLElement, distance = 200): void {
  let captured = false;
  Object.defineProperties(viewport, {
    setPointerCapture: {
      configurable: true,
      value: () => {
        captured = true;
      },
    },
    hasPointerCapture: { configurable: true, value: () => captured },
    releasePointerCapture: {
      configurable: true,
      value: () => {
        captured = false;
      },
    },
  });
  for (const [type, y, time] of [
    ['pointerdown', 100, 0],
    ['pointermove', 100 + distance, 500],
    ['pointerup', 100 + distance, 600],
  ] as const) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
      timeStamp: { value: time },
    });
    viewport.dispatchEvent(event);
  }
}

it('reveals the Bootstrap spinner only for a refresh pull on the current cell', async () => {
  let release: (() => void) | undefined;
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const wrapper = renderGrid(refresh);
  await nextTick();
  const viewport = wrapper.get<HTMLElement>('.weather-viewport');
  dragDown(viewport.element);
  await environment.settle();
  expect(refresh).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(wrapper.get('[data-refresh-indicator]').isVisible()).toBe(true);
  expect(wrapper.find('[data-refresh-indicator] .spinner-border').exists()).toBe(true);
  expect(viewport.attributes('aria-busy')).toBe('true');
  expect(viewport.attributes('data-column')).toBe('0');
  release?.();
  await environment.settle();
  expect(wrapper.get('[data-refresh-indicator]').isVisible()).toBe(false);
  expect(viewport.attributes('aria-busy')).toBe('false');
  await viewport.trigger('keydown', { key: 'ArrowRight' });
  await environment.settle();
  dragDown(viewport.element);
  await environment.settle();
  expect(refresh).toHaveBeenCalledOnce();
  expect(viewport.attributes('data-column')).toBe('1');
});

it('does not refresh on a short pull and cancels a pending refresh on unmount', async () => {
  let signal: AbortSignal | undefined;
  const refresh = vi.fn((value: AbortSignal) => {
    signal = value;
    return new Promise<void>(() => undefined);
  });
  const wrapper = renderGrid(refresh);
  await nextTick();
  const viewport = wrapper.get<HTMLElement>('.weather-viewport');
  dragDown(viewport.element, 30);
  await environment.settle();
  expect(refresh).not.toHaveBeenCalled();
  dragDown(viewport.element);
  await environment.settle();
  wrapper.unmount();
  expect(signal?.aborted).toBe(true);
  expect(environment.frames.size).toBe(0);
});

it('silently returns from a rejected refresh without turning it into a navigation error', async () => {
  const wrapper = renderGrid(() => Promise.reject(new Error('Refresh failed')));
  await nextTick();
  const viewport = wrapper.get<HTMLElement>('.weather-viewport');
  dragDown(viewport.element);
  await environment.settle();
  await environment.settle();
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.emitted('error')).toBeUndefined();
  expect(wrapper.get('[data-refresh-indicator]').isVisible()).toBe(false);
  await viewport.trigger('keydown', { key: 'ArrowRight' });
  await environment.settle();
  expect(viewport.attributes('data-column')).toBe('1');
});

it('keeps the daily column aligned when future maps are unavailable', async () => {
  const { addWeatherMaps, weatherPrimaryColumn, weatherRowStartColumn } =
    await import('@/entities/weather');
  const grid = addWeatherMaps(fixtureGrid, { now: Date.UTC(2026, 10, 1), timeZone: 'UTC' });
  const wrapper = mount(WeatherGrid, {
    attachTo: document.body,
    props: {
      grid,
      primaryColumn: weatherPrimaryColumn,
      rowStartColumn: (row: number) => weatherRowStartColumn(grid, row),
    },
    slots: { default: ({ cell }: { readonly cell: WeatherCell }) => h(ProbeCell, { id: cell.id }) },
    global: { plugins: [createPinia()] },
  });
  wrappers.push(wrapper);
  await nextTick();
  const viewport = wrapper.get('.weather-viewport');
  expect(viewport.attributes('data-column')).toBe('3');
  await viewport.trigger('keydown', { key: 'ArrowLeft' });
  await environment.settle();
  expect(viewport.attributes('data-active-cell')).toBe('2026-10-26/map/temp');
  await viewport.trigger('keydown', { key: 'ArrowDown' });
  await environment.settle();
  expect(viewport.attributes('data-column')).toBe('3');
  expect(viewport.attributes('data-active-cell')).toBe('2026-10-27/daily');
  expect(wrapper.find('[data-tikitaki-role="right"]').exists()).toBe(false);
  await viewport.trigger('keydown', { key: 'ArrowUp' });
  await environment.settle();
  expect(viewport.attributes('data-active-cell')).toBe('2026-10-26/current');
});
