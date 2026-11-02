import type { InjectionKey } from 'vue';
import type { ForecastDay } from '@/entities/weather';
import type { LocationQuery } from '@/shared/api';
import type { Locale } from '@/shared/locales';

export interface HistoryContext {
  readonly today: string;
  readonly city: string;
  readonly country: string;
  readonly location: LocationQuery;
  readonly timeZone: string;
  readonly locale: Locale;
}
export interface HistoryServices {
  /**
   * history. Request one historical daily summary for the resolved location.
   * @param context The local date and named weather location.
   * @param date The historical calendar date to request.
   * @param signal The token used to cancel the request.
   * @returns The normalized historical day without hourly data.
   */
  readonly history: (
    context: HistoryContext,
    date: string,
    signal: AbortSignal,
  ) => Promise<ForecastDay>;
}
export const historyServicesKey: InjectionKey<HistoryServices> = Symbol('history-services');
