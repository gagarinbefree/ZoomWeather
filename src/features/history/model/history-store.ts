import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { weatherHistoryDates, type ForecastDay } from '@/entities/weather';
import { ApiError, type FailureKind } from '@/shared/api';
import { reportFailure } from '@/shared/diagnostics';
import type { HistoryContext, HistoryServices } from './services';

/**
 * useHistoryStore. Load and retain the two historical summaries independently of forecast loading.
 * @returns The cancellable history data and per date failures.
 */
export const useHistoryStore = defineStore('weather-history', () => {
  const days = shallowRef<readonly ForecastDay[]>([]);
  const failures = shallowRef<Readonly<Record<string, FailureKind>>>({});
  const savedTimes = shallowRef<Readonly<Record<string, number>>>({});
  let owner = '';
  let revision = 0;
  let controller: AbortController | null = null;
  let session: HistoryContext | null = null;
  let dependencies: HistoryServices | null = null;

  /**
   * identity. Read the place identity without retaining device coordinates.
   * @param place The named weather location.
   * @returns The location key used to isolate historical data.
   */
  function identity(place: {
    readonly city: string;
    readonly country: string;
    readonly timeZone: string;
  }): string {
    return JSON.stringify([place.city, place.country, place.timeZone]);
  }
  /** cancel. Abort pending history and ignore its late responses. */
  function cancel(): void {
    revision++;
    controller?.abort();
    controller = null;
  }
  /**
   * restore. Restore the last successful historical summaries for the saved location.
   * @param data The validated daily summaries from the saved forecast.
   * @param place The saved weather location.
   * @param savedAt The local snapshot time.
   */
  function restore(
    data: readonly ForecastDay[],
    place: { readonly city: string; readonly country: string; readonly timeZone: string },
    savedAt: number,
  ): void {
    cancel();
    owner = identity(place);
    days.value = data;
    savedTimes.value = Object.fromEntries(data.map((day) => [day.date, savedAt]));
    failures.value = {};
  }
  /**
   * day. Read one loaded historical summary.
   * @param date The local historical calendar date.
   * @returns The latest successful daily summary when available.
   */
  function day(date: string): ForecastDay | undefined {
    return days.value.find((value) => value.date === date);
  }
  /**
   * load. Refresh both historical dates while retaining valid previous data.
   * @param context The resolved place and current local date.
   * @param services The native historical request dependency.
   * @param signal The optional boundary action cancellation signal.
   * @returns A promise that settles after both independent requests finish.
   */
  async function load(
    context: HistoryContext,
    services: HistoryServices,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return;
    cancel();
    session = context;
    dependencies = services;
    const key = identity(context);
    const dates = Object.values(weatherHistoryDates(context.today));
    days.value = owner === key ? days.value.filter((value) => dates.includes(value.date)) : [];
    if (owner !== key) savedTimes.value = {};
    owner = key;
    failures.value = {};
    const token = revision;
    const active = new AbortController();
    controller = active;
    /** abort. Cancel history only while this gesture owns the request. */
    function abort(): void {
      if (controller === active) cancel();
    }
    signal?.addEventListener('abort', abort, { once: true });
    await Promise.all(
      dates.map(async (date) => {
        try {
          const result = await services.history(context, date, active.signal);
          if (token !== revision || active.signal.aborted) return;
          if (result.date !== date || result.hours.length !== 0)
            throw new ApiError('invalidResponse');
          days.value = [...days.value.filter((value) => value.date !== date), result];
          savedTimes.value = Object.fromEntries(
            Object.entries(savedTimes.value).filter(([key]) => key !== date),
          );
        } catch (error) {
          if (token !== revision || active.signal.aborted) return;
          failures.value = {
            ...failures.value,
            [date]: error instanceof ApiError ? error.kind : 'connection',
          };
          reportFailure(error, 'forecast', day(date) !== undefined);
        }
      }),
    );
    signal?.removeEventListener('abort', abort);
    if (token === revision) controller = null;
  }
  /** retry. Retry the historical dates for the last resolved place. */
  function retry(): void {
    if (session && dependencies) void load(session, dependencies);
  }
  return { days, failures, savedTimes, day, load, restore, cancel, retry };
});
