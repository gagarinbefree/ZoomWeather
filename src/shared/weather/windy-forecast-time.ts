import { windyConfig } from '@/shared/config/windy';

/**
 * windyForecastTime. Find noon on a calendar date in the weather location.
 * @param date The local forecast date in ISO calendar form.
 * @param timeZone The IANA time zone of the weather location.
 * @returns The noon timestamp or null when the local date does not exist.
 */
export function windyForecastTime(date: string, timeZone: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const desired = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(desired) || new Date(desired).toISOString().slice(0, 10) !== date)
    return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    let timestamp = desired;
    for (let attempt = 0; attempt < 4; attempt++) {
      const parts = formatter.formatToParts(timestamp);
      const values = ['year', 'month', 'day', 'hour', 'minute', 'second'].map((type) =>
        Number(parts.find((part) => part.type === type)?.value),
      );
      const local = Date.UTC(
        values[0] ?? NaN,
        (values[1] ?? NaN) - 1,
        values[2],
        values[3],
        values[4],
        values[5],
      );
      if (local === desired) return timestamp;
      timestamp += desired - local;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * isWindyForecastAvailable. Reject past times and dates beyond the free iframe calendar.
 * @param timestamp The requested map time in milliseconds.
 * @param now The current clock in milliseconds.
 * @returns Whether the time is within the six device calendar days used by Windy.
 */
export function isWindyForecastAvailable(timestamp: number, now: number): boolean {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + windyConfig.forecastDays);
  return Number.isFinite(timestamp) && timestamp >= now && timestamp < end.getTime();
}
