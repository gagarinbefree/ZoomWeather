import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WeatherMap from '@/features/weather-map/ui/WeatherMap.vue';

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
      expect(wrapper.get('.weather-map__navigation-space').attributes('aria-hidden')).toBe('true');
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
