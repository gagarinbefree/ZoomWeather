import { describe, expect, it } from 'vitest';
import { windyForecastTime, isWindyForecastAvailable } from '@/shared/weather/windy-forecast-time';

describe('Windy forecast time', () => {
  it('uses noon in the city rather than the device time zone', () => {
    expect(windyForecastTime('2026-11-02', 'Asia/Yekaterinburg')).toBe(Date.UTC(2026, 10, 2, 7));
    expect(windyForecastTime('2026-11-02', 'America/New_York')).toBe(Date.UTC(2026, 10, 2, 17));
    expect(windyForecastTime('2026-11-02', 'Pacific/Chatham')).toBe(Date.UTC(2026, 10, 1, 22, 15));
  });
  it('uses the actual daylight saving offset on the forecast day', () => {
    expect(windyForecastTime('2026-11-01', 'America/New_York')).toBe(Date.UTC(2026, 10, 1, 17));
    expect(windyForecastTime('2026-10-31', 'America/New_York')).toBe(Date.UTC(2026, 9, 31, 16));
  });
  it('rejects invalid dates and skipped local dates', () => {
    expect(windyForecastTime('2026-02-30', 'UTC')).toBeNull();
    expect(windyForecastTime('2011-12-30', 'Pacific/Apia')).toBeNull();
  });
  it('bounds dates by six device calendar days rather than six days from the current hour', () => {
    const now = new Date(2026, 10, 1, 23, 30).getTime();
    expect(isWindyForecastAvailable(new Date(2026, 10, 6, 12).getTime(), now)).toBe(true);
    expect(isWindyForecastAvailable(new Date(2026, 10, 7, 0).getTime(), now)).toBe(false);
    expect(isWindyForecastAvailable(now - 1, now)).toBe(false);
  });
});
