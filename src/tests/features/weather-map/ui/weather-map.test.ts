import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WeatherMap from '@/features/weather-map/ui/WeatherMap.vue';
import theme from '@assets/themes/default.json';

const props = {
  layer: 'temp' as const,
  locale: 'ru' as const,
  active: false,
  location: { latitude: 58, longitude: 56.25 },
  city: 'Пермь',
};
afterEach(() => vi.useRealTimers());
describe('WeatherMap', () => {
  it('loads only the selected map and retains a named interactive frame', async () => {
    const wrapper = mount(WeatherMap, { props });
    try {
      expect(wrapper.find('iframe').exists()).toBe(false);
      await wrapper.setProps({ active: true });
      expect(wrapper.get('iframe').attributes('title')).toBe('Карта температуры');
      expect(wrapper.find('[role="status"]').exists()).toBe(true);
      await wrapper.get('iframe').trigger('load');
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      await wrapper.setProps({ active: false });
      expect(wrapper.find('iframe').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
  it('provides retry on a map timeout without navigation buttons', async () => {
    vi.useFakeTimers();
    const wrapper = mount(WeatherMap, { props: { ...props, active: true } });
    try {
      await vi.advanceTimersByTimeAsync(20000);
      expect(wrapper.text()).toContain('Не удалось загрузить карту');
      await wrapper.get('[data-map-retry]').trigger('click');
      expect(wrapper.find('[role="status"]').exists()).toBe(true);
      expect(wrapper.find('header button').exists()).toBe(false);
      expect(wrapper.get('header time').attributes('datetime')).toBeTruthy();
    } finally {
      wrapper.unmount();
    }
  });
  it('does not request a map before the location is known', () => {
    const wrapper = mount(WeatherMap, { props: { ...props, active: true, location: null } });
    try {
      expect(wrapper.find('iframe').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});

it('uses explicit connectivity while map cells are recreated', async () => {
  const wrapper = mount(WeatherMap, { props: { ...props, active: true } });
  try {
    await wrapper.setProps({ online: false });
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.text()).toContain('Для карты нужен интернет');
    await wrapper.setProps({ online: true });
    expect(wrapper.find('iframe').exists()).toBe(true);
  } finally {
    wrapper.unmount();
  }
});

it('shows the current opening time rather than noon for current weather maps', async () => {
  vi.useFakeTimers();
  const now = Date.UTC(2026, 10, 1, 14, 15);
  vi.setSystemTime(now);
  const wrapper = mount(WeatherMap, {
    props: { ...props, active: true, timeZone: 'Asia/Yekaterinburg' },
  });
  try {
    expect(wrapper.get('header time').attributes('datetime')).toBe(new Date(now).toISOString());
    expect(wrapper.get('header time').text()).toContain('19:15');
    expect(
      new URL(wrapper.get('iframe').attributes('src') ?? '').searchParams.get('calendar'),
    ).toBe('now');
    await wrapper.setProps({ active: false });
    vi.setSystemTime(now + 3600000);
    await wrapper.setProps({ active: true });
    expect(wrapper.get('header time').text()).toContain('20:15');
  } finally {
    wrapper.unmount();
  }
});

it('keeps daily maps at local noon after leaving and reopening them and rejects expired maps', async () => {
  vi.useFakeTimers();
  const now = Date.UTC(2026, 10, 1, 14, 15);
  vi.setSystemTime(now);
  const timestamp = Date.UTC(2026, 10, 2, 7);
  const wrapper = mount(WeatherMap, {
    props: { ...props, active: true, timestamp, timeZone: 'Asia/Yekaterinburg' },
  });
  try {
    expect(wrapper.get('header time').attributes('datetime')).toBe(
      new Date(timestamp).toISOString(),
    );
    expect(wrapper.get('header time').text()).toContain('12:00');
    const first = new URL(wrapper.get('iframe').attributes('src') ?? '');
    expect(Number(first.searchParams.get('forecast'))).toBeCloseTo((timestamp - now) / 3600000);
    await wrapper.setProps({ active: false });
    vi.setSystemTime(now + 3600000);
    await wrapper.setProps({ active: true });
    const reopened = new URL(wrapper.get('iframe').attributes('src') ?? '');
    expect(Number(reopened.searchParams.get('forecast'))).toBeCloseTo(
      (timestamp - now - 3600000) / 3600000,
    );
    expect(wrapper.get('header time').text()).toContain('12:00');
    await wrapper.setProps({ active: false });
    vi.setSystemTime(timestamp + 3600000);
    await wrapper.setProps({ active: true });
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.text()).toContain('Карта для этой даты недоступна');
  } finally {
    wrapper.unmount();
  }
});

it.each([
  { conditionCode: 0, isDay: true, name: 'ClearDay' },
  { conditionCode: 0, isDay: false, name: 'ClearNight' },
  { conditionCode: 3, isDay: true, name: 'Cloudy' },
  { conditionCode: 61, isDay: true, name: 'Rain' },
  { conditionCode: 71, isDay: true, name: 'Snow' },
  { conditionCode: 95, isDay: true, name: 'Thunder' },
] as const)(
  'uses the shared $name weather colors for map cards',
  async ({ conditionCode, isDay, name }) => {
    const wrapper = mount(WeatherMap, { props: { ...props, conditionCode, isDay } });
    try {
      const card = wrapper.get<HTMLElement>('article').element;
      expect(card.style.getPropertyValue('--card-background')).toBe(
        theme.colors[`Weather.${name}.Forecast`],
      );
      expect(card.style.getPropertyValue('--card-header-start')).toBe(
        theme.colors[`Weather.${name}.HeaderStart`],
      );
      expect(card.style.getPropertyValue('--card-header-end')).toBe(
        theme.colors[`Weather.${name}.HeaderEnd`],
      );
      await wrapper.setProps({ conditionCode: 61, isDay: true });
      expect(card.style.getPropertyValue('--card-background')).toBe(
        theme.colors['Weather.Rain.Forecast'],
      );
    } finally {
      wrapper.unmount();
    }
  },
);
