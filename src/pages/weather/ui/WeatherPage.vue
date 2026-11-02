<script setup lang="ts">
import { storeToRefs } from 'pinia';
import type { Position } from 'tikitaki';
import { computed, inject, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import {
  CurrentWeatherCard,
  addWeatherMaps,
  addWeatherHistory,
  weatherPrimaryRow,
  weatherPrimaryColumn,
  weatherRowStartColumn,
  readWeatherSnapshot,
  writeWeatherSnapshot,
  useWeatherGridStore,
  type WeatherSnapshot,
} from '@/entities/weather';
import { currentWeatherServicesKey, useCurrentWeatherStore } from '@/features/current-weather';
import { ForecastCell, forecastServicesKey, useForecastStore } from '@/features/forecast';
import { HistoryCell, historyServicesKey, useHistoryStore } from '@/features/history';
import { WeatherMap } from '@/features/weather-map';
import { messages } from '@/shared/locales';
import { LoadingIndicator } from '@/shared/ui/loading-indicator';
import { baseThemeStyle } from '@/shared/themes';
import { WeatherGrid } from '@/widgets/weather-grid';

const props = withDefaults(defineProps<{ readonly navigationReset?: number }>(), {
  navigationReset: 0,
});

const { grid } = storeToRefs(useWeatherGridStore());
const weather = useCurrentWeatherStore();
const forecast = useForecastStore();
const history = useHistoryStore();
const historyServices = inject(historyServicesKey, null);
const services = inject(currentWeatherServicesKey, null);
const forecastServices = inject(forecastServicesKey, null);
const { state, locale } = storeToRefs(weather);
const text = computed(() => messages[locale.value]);
const online = shallowRef(navigator.onLine);
const mapNow = shallowRef(Date.now());
const mapGrid = computed(() =>
  addWeatherHistory(
    addWeatherMaps(grid.value, {
      now: mapNow.value,
      timeZone: state.value.status === 'ready' ? state.value.weather.timeZone : 'UTC',
    }),
  ),
);
let mapClock: ReturnType<typeof setInterval> | undefined;

/** updateMapClock. Recheck available forecast dates when the app returns or a minute passes. */
function updateMapClock(): void {
  mapNow.value = Date.now();
}

/**
 * mapRowStart. Keep daily weather in the main column with or without forecast maps.
 * @param row The selected forecast row.
 * @returns The logical column of the first real cell.
 */
function mapRowStart(row: number): number {
  return weatherRowStartColumn(mapGrid.value, row);
}
const mapLocation = computed(() =>
  state.value.status === 'ready' && state.value.location.source !== 'automatic'
    ? state.value.location
    : null,
);
let loadRevision = 0;

/**
 * saveSnapshot. Save the latest successful weather and loaded forecast days
 *
 * @param forecastDays The currently available normalized forecast.
 */
function saveSnapshot(forecastDays = forecast.days): void {
  const current = weather.state;
  if (current.status !== 'ready' || current.cachedAt !== null) return;
  const snapshot: WeatherSnapshot = {
    version: 1,
    savedAt: Date.now(),
    locale: weather.locale,
    weather: current.weather,
    forecast: { days: forecastDays },
    history: history.days,
  };
  writeWeatherSnapshot(snapshot);
}

/**
 * reloadWeather. Refresh the current observation and restart the forecast in the background.
 *
 * @param signal The optional boundary action cancellation signal.
 * @returns A promise that settles once the current card is updated.
 */
async function reloadWeather(signal?: AbortSignal): Promise<void> {
  if (!services || weather.loading || signal?.aborted) return;
  const token = ++loadRevision;
  if (weather.state.status !== 'ready') forecast.cancel();
  const loaded = await weather.load(services, {
    preserveCurrent: weather.state.status === 'ready',
    ...(signal ? { signal } : {}),
  });
  if (!loaded || token !== loadRevision || signal?.aborted) return;
  const current = weather.state;
  if (current.status !== 'ready' || current.cachedAt !== null) return;
  if (forecastServices)
    forecast.start(
      {
        location: current.location,
        locale: weather.locale,
        timeZone: current.weather.timeZone,
        now: current.now,
      },
      forecastServices,
    );
  const today = grid.value[0]?.[0]?.date;
  const historyLoad =
    historyServices && today
      ? history.load(
          {
            today,
            city: current.weather.city,
            country: current.weather.country,
            location: current.location,
            timeZone: current.weather.timeZone,
            locale: weather.locale,
          },
          historyServices,
          signal,
        )
      : Promise.resolve();
  saveSnapshot([]);
  await nextTick();
  if (signal) await historyLoad;
}

/**
 * retry. Reload current weather from a button or a restored connection.
 */
function retry(): void {
  void reloadWeather();
}

/**
 * dayIndex. Find the grid row for a local date
 *
 * @param date The local date of a visible weather cell.
 * @returns Its row index in the swipe grid.
 */
function dayIndex(date: string): number {
  return grid.value.findIndex((row) => row[0]?.date === date);
}

/**
 * onPositionChange. Load the forecast needed by the selected grid row
 *
 * @param position The selected grid row and column.
 */
function onPositionChange(position: Position): void {
  if (position.row >= weatherPrimaryRow) forecast.focus(position.row - weatherPrimaryRow);
}
/**
 * start. Show saved weather and start loading fresh data
 */
function start(): void {
  const snapshot = readWeatherSnapshot();
  if (snapshot) {
    try {
      weather.restore(snapshot);
      history.restore(snapshot.history ?? [], snapshot.weather, snapshot.savedAt);
      forecast.restore(
        snapshot.forecast,
        weather.state.status === 'ready' ? weather.state.now : Date.now(),
        snapshot.weather.timeZone,
      );
    } catch {
      // An invalid saved time zone or calendar must not prevent a fresh load.
    }
  }
  if (navigator.onLine) retry();
  else weather.offline();
}

/** onOnline. Restore map connectivity and refresh weather after reconnecting. */
function onOnline(): void {
  updateMapClock();
  online.value = true;
  retry();
}
/** onOffline. Retain offline state while map cards mount and unmount. */
function onOffline(): void {
  online.value = false;
}

onMounted(() => {
  start();
  mapClock = setInterval(updateMapClock, 60000);
  window.addEventListener('focus', updateMapClock);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
});
onBeforeUnmount(() => {
  clearInterval(mapClock);
  window.removeEventListener('focus', updateMapClock);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  loadRevision++;
  weather.cancel();
  forecast.cancel();
  history.cancel();
});
watch(
  () => forecast.days,
  (days) => {
    saveSnapshot(days);
  },
);
watch(
  () => history.days,
  () => {
    saveSnapshot();
  },
);
watch(
  locale,
  (language) => {
    document.documentElement.lang = language;
  },
  { immediate: true },
);
</script>

<template>
  <main class="weather-page" :style="baseThemeStyle" :aria-label="text.weather">
    <h1 class="visually-hidden">{{ text.appName }}</h1>
    <WeatherGrid
      :key="props.navigationReset"
      :grid="mapGrid"
      :primary-column="weatherPrimaryColumn"
      :primary-row="weatherPrimaryRow"
      :row-start-column="mapRowStart"
      :locale="locale"
      :refresh="reloadWeather"
      :refresh-enabled="state.status === 'ready' && !weather.loading"
      @position-change="onPositionChange"
    >
      <template #default="{ cell, active }">
        <WeatherMap
          v-if="cell.kind === 'map'"
          :layer="cell.layer"
          :timestamp="cell.timestamp"
          :condition-code="
            cell.timestamp === undefined && state.status === 'ready'
              ? state.weather.conditionCode
              : forecast.day(cell.date)?.conditionCode
          "
          :is-day="
            cell.timestamp === undefined && state.status === 'ready' ? state.weather.isDay : true
          "
          :time-zone="state.status === 'ready' ? state.weather.timeZone : 'UTC'"
          :location="mapLocation"
          :city="state.status === 'ready' ? state.weather.city : ''"
          :locale="locale"
          :active="active"
          :online="online"
        />
        <HistoryCell
          v-else-if="cell.kind === 'history' && state.status === 'ready'"
          :cell="cell"
          :city="state.weather.city"
          :time-zone="state.weather.timeZone"
          :locale="locale"
        />
        <CurrentWeatherCard
          v-else-if="cell.kind === 'current' && state.status === 'ready'"
          :weather="state.weather"
          :locale="locale"
          :cached-at="state.weather.serverCachedAt ?? state.cachedAt"
          :sun-times="forecast.day(cell.date)"
          @retry="retry"
        />
        <section
          v-else-if="cell.kind === 'current' && state.status === 'error'"
          class="weather-error"
        >
          <p role="alert">{{ text.failures[state.failure] }}</p>
          <button type="button" class="btn" @click="retry">{{ text.retry }}</button>
        </section>
        <ForecastCell
          v-else-if="state.status === 'ready' && (cell.kind === 'daily' || cell.kind === 'hourly')"
          :cell="cell"
          :day-index="dayIndex(cell.date)"
          :city="state.weather.city"
          :time-zone="state.weather.timeZone"
          :locale="locale"
          :cached-at="state.cachedAt"
        />
        <LoadingIndicator
          v-else
          :label="
            state.status === 'loading' && state.phase === 'location'
              ? text.locating
              : text.loadingWeather
          "
        />
      </template>
    </WeatherGrid>
  </main>
</template>

<style scoped>
@layer custom {
  .weather-error {
    display: grid;
    gap: var(--spacer);
    justify-items: start;
    inline-size: 100%;
    padding: var(--spacer-4);
    background: var(--weather-error-background);
    border-radius: var(--radius-5);
  }
  .weather-error p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .weather-error .btn {
    --btn-bg: var(--weather-surface);
    --btn-color: var(--weather-ink);
    --btn-border-color: var(--weather-muted);
    --btn-hover-bg: var(--weather-page);
    white-space: normal;
  }
}
</style>
