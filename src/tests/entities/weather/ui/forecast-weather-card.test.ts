import { mount } from '@vue/test-utils';
import theme from '@assets/themes/default.json';
import { describe, expect, it, vi } from 'vitest';
import { ForecastWeatherCard, getForecast } from '@/entities/weather';
import sunHorizonIcon from '@assets/icons/weather_sunny_low_20_regular.svg?url';
import { forecastResponse } from '@/tests/entities/weather/api/forecast-fixture';

describe('ForecastWeatherCard', () => {
  it('shows a localized tomorrow card with daily measurements and astronomy', async () => {
    const forecast = await getForecast({
      location: { source: 'automatic' },
      locale: 'ru',
      timeZone: 'Asia/Yekaterinburg',
      days: 3,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(forecastResponse)),
    });
    const day = forecast.days[1];
    if (!day) throw new Error('Expected tomorrow forecast');
    const wrapper = mount(ForecastWeatherCard, {
      props: {
        forecast: day,
        kind: 'daily',
        dayIndex: 1,
        city: 'Пермь',
        timeZone: 'Asia/Yekaterinburg',
        locale: 'ru',
      },
    });
    expect(wrapper.get('h2').text()).toBe('Завтра');
    expect(wrapper.get('.forecast-weather-card__date time').text()).toBe('вторник, 27 окт.');
    expect(wrapper.get('.forecast-weather-card__date time').attributes('datetime')).toBe(
      '2026-10-27',
    );
    expect(wrapper.get('article').attributes('style')).toContain(
      `--card-background: ${theme.colors['Weather.Cloudy.Forecast']}`,
    );
    expect(wrapper.text()).toContain('10°C');
    expect(wrapper.text()).toContain('5°C');
    expect(wrapper.text()).toContain('Пасмурно');
    expect(wrapper.text()).toContain('07:47');
    expect(wrapper.text()).toContain('17:26');
    expect(wrapper.text()).toContain('5 м/с');
    await wrapper.setProps({ locale: 'en' });
    expect(wrapper.text()).toContain('11.2 mph');
    expect(day.windSpeed).toBe(18);
    expect(wrapper.findAll('[data-metric-icon]')).toHaveLength(6);
    for (const icon of wrapper.findAll('[data-metric-icon]').slice(-2)) {
      expect(icon.attributes('style')).toContain(sunHorizonIcon);
    }
    for (const label of wrapper.findAll('dt')) {
      expect(label.element.firstChild?.textContent?.trim()).toBe(label.text());
      expect(label.element.lastElementChild?.hasAttribute('data-metric-icon')).toBe(true);
    }
    wrapper.unmount();
  });

  it('keeps the existing date format on later days', async () => {
    const forecast = await getForecast({
      location: { source: 'automatic' },
      locale: 'ru',
      timeZone: 'Asia/Yekaterinburg',
      days: 3,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(forecastResponse)),
    });
    const day = forecast.days[2];
    if (!day) throw new Error('Expected later forecast');
    const wrapper = mount(ForecastWeatherCard, {
      props: {
        forecast: day,
        kind: 'daily',
        dayIndex: 2,
        city: 'Пермь',
        timeZone: 'Asia/Yekaterinburg',
        locale: 'ru',
      },
    });

    expect(wrapper.get('.forecast-weather-card__date time').text()).toBe('28 окт. 2026 г.');
    wrapper.unmount();
  });

  it('shows an hourly forecast at its location time with rain chance', async () => {
    const forecast = await getForecast({
      location: { source: 'automatic' },
      locale: 'en',
      timeZone: 'Asia/Yekaterinburg',
      days: 1,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          forecast: { forecastday: forecastResponse.forecast.forecastday.slice(0, 1) },
        }),
      ),
    });
    const hour = forecast.days[0]?.hours[0];
    if (!hour) throw new Error('Expected hourly forecast');
    const wrapper = mount(ForecastWeatherCard, {
      props: {
        forecast: hour,
        kind: 'hourly',
        dayIndex: 0,
        city: 'Perm',
        timeZone: 'Asia/Yekaterinburg',
        locale: 'en',
      },
    });
    expect(wrapper.get('h2').text()).toBe('12:00');
    expect(wrapper.text()).toContain('9.5°C');
    expect(wrapper.text()).toContain('35%');
    expect(wrapper.text()).toContain('6.8 mph SW');
    await wrapper.setProps({ locale: 'ru' });
    expect(wrapper.text()).toContain('3,1 м/с ЮЗ');
    expect(hour.windSpeed).toBe(11);
    for (const label of wrapper.findAll('dt')) {
      expect(label.element.firstChild?.textContent?.trim()).toBe(label.text());
      expect(label.element.lastElementChild?.hasAttribute('data-metric-icon')).toBe(true);
    }
    expect(wrapper.get('time').attributes('datetime')).toBe(new Date(hour.timestamp).toISOString());
    wrapper.unmount();
  });
});

it.each([
  ['ru', 'Год назад', 'Осадки', '2,3 мм'],
  ['en', 'A year ago', 'Precipitation', '2.3 mm'],
] as const)(
  'shows historical facts with the shared daily layout in %s',
  async (locale, heading, rain, amount) => {
    const forecast = await getForecast({
      location: { source: 'automatic' },
      locale,
      timeZone: 'Asia/Yekaterinburg',
      days: 3,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json(forecastResponse)),
    });
    const day = forecast.days[0];
    if (!day) throw new Error('Missing fixture day');
    const wrapper = mount(ForecastWeatherCard, {
      props: {
        forecast: { ...day, date: '2025-10-26', precipitation: 2.3, rainChance: null, hours: [] },
        kind: 'daily',
        dayIndex: -1,
        city: 'Perm',
        timeZone: 'Asia/Yekaterinburg',
        locale,
        heading,
      },
    });
    expect(wrapper.get('h2').text()).toBe(heading);
    expect(wrapper.get('article').attributes('aria-label')).toBe(heading);
    expect(wrapper.text()).toContain(rain);
    expect(wrapper.text()).toContain(amount);
    expect(wrapper.get('.forecast-weather-card__date time').attributes('datetime')).toBe(
      '2025-10-26',
    );
    expect(wrapper.findAll('dd')).toHaveLength(6);
    expect(wrapper.get('.forecast-weather-card__date time').text()).toContain('2025');
  },
);
