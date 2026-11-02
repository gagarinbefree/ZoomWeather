import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { weatherHistoryDates, type ForecastDay } from '@/entities/weather';
import { ApiError } from '@/shared/api';
import { reportFailure } from '@/shared/diagnostics';
import type { HistoryContext, HistoryServices } from './services';

/**
 * useHistoryStore. Load optional history quietly for the current session without persistent storage.
 * @returns Successful historical summaries and their cancellable background loader.
 */
export const useHistoryStore = defineStore('weather-history', () => {
  const days = shallowRef<readonly ForecastDay[]>([]);
  let owner = '';
  let revision = 0;
  let controller: AbortController | null = null;

  /** cancel. Abort pending history and ignore its late responses. */
  function cancel(): void {
    revision++;
    controller?.abort();
    controller = null;
  }
  /**
   * day. Read a successful historical summary in the current session.
   * @param date The local calendar date.
   * @returns The summary when the API supplied complete data.
   */
  function day(date: string): ForecastDay | undefined {
    return days.value.find((value) => value.date === date);
  }
  /**
   * load. Fetch both optional summaries without saving errors or unavailable cards.
   * @param context The resolved place and current local date.
   * @param services The historical request dependency.
   * @param signal The optional gesture cancellation token.
   * @returns A promise that settles after both background requests finish.
   */
  async function load(
    context: HistoryContext,
    services: HistoryServices,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return;
    cancel();
    const key = JSON.stringify([context.city, context.country, context.timeZone]);
    if (owner !== key) days.value = [];
    owner = key;
    const token = revision;
    const active = new AbortController();
    controller = active;
    /** abort. Cancel history only while this gesture owns the request. */
    function abort(): void {
      if (controller === active) cancel();
    }
    signal?.addEventListener('abort', abort, { once: true });
    const results = await Promise.all(
      Object.values(weatherHistoryDates(context.today)).map(async (date) => {
        try {
          const result = await services.history(context, date, active.signal);
          if (result.date !== date || result.hours.length !== 0)
            throw new ApiError('invalidResponse');
          return result;
        } catch (error) {
          if (token === revision && !active.signal.aborted) reportFailure(error, 'forecast', true);
          return null;
        }
      }),
    );
    signal?.removeEventListener('abort', abort);
    if (token !== revision || active.signal.aborted) return;
    days.value = results.filter((value): value is ForecastDay => value !== null);
    controller = null;
  }
  return { days, day, load, cancel };
});
