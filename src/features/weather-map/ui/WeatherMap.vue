<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import type { WeatherMapLayer } from '@/entities/weather';
import { isWindyForecastAvailable } from '@/shared/weather/windy-forecast-time';
import { windyConfig } from '@/shared/config/windy';
import { messages, type Locale } from '@/shared/locales';
import { baseThemeStyle } from '@/shared/themes';
import { weatherPresentation } from '@/shared/weather';
import { LoadingIndicator } from '@/shared/ui/loading-indicator';
import { createWindyUrl, type MapLocation } from '@/features/weather-map/model/create-windy-url';

const props = withDefaults(
  defineProps<{
    readonly layer: WeatherMapLayer;
    readonly location: MapLocation | null;
    readonly city: string;
    readonly locale: Locale;
    readonly active: boolean;
    readonly conditionCode?: number | undefined;
    readonly isDay?: boolean;
    readonly timestamp?: number | undefined;
    readonly timeZone?: string;
    readonly online?: boolean;
  }>(),
  { online: true, timeZone: 'UTC', timestamp: undefined, conditionCode: Number.NaN, isDay: true },
);
const text = computed(() => messages[props.locale]);
const mapStyle = computed(() => ({
  ...baseThemeStyle,
  ...weatherPresentation(props.conditionCode, props.isDay).style,
}));
const title = computed(() => text.value.mapLayers[props.layer]);
const loaded = shallowRef(false);
const failed = shallowRef(false);
const revision = shallowRef(0);
const requestedAt = shallowRef(Date.now());
const forecastAvailable = computed(
  () =>
    props.timestamp === undefined || isWindyForecastAvailable(props.timestamp, requestedAt.value),
);
const displayTime = computed(() => props.timestamp ?? requestedAt.value);
const timeLabel = computed(() =>
  new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(displayTime.value),
);
const src = computed(() =>
  props.active && props.location && forecastAvailable.value
    ? createWindyUrl(
        props.layer,
        props.location,
        props.locale,
        props.timestamp === undefined
          ? undefined
          : { timestamp: props.timestamp, now: requestedAt.value },
      )
    : null,
);
const enabled = computed(() => props.active && props.online && src.value !== null);
watch(
  [(): boolean => props.active, (): boolean => props.online],
  () => {
    if (props.active) requestedAt.value = Date.now();
  },
  { flush: 'sync' },
);
let timeout: ReturnType<typeof setTimeout> | undefined;

/** stopTimer. Release the pending map loading timeout. */
function stopTimer(): void {
  clearTimeout(timeout);
  timeout = undefined;
}
/** restart. Retry the selected iframe without changing weather data. */
function restart(): void {
  requestedAt.value = Date.now();
  revision.value++;
}
/** finish. Stop the spinner when the embedded document finishes loading. */
function finish(): void {
  stopTimer();
  loaded.value = true;
  failed.value = false;
}
watch(
  [enabled, src, revision],
  () => {
    stopTimer();
    loaded.value = false;
    failed.value = false;
    if (enabled.value)
      timeout = setTimeout(() => {
        failed.value = true;
      }, windyConfig.loadTimeoutMs);
  },
  { immediate: true },
);
onBeforeUnmount(stopTimer);
</script>

<template>
  <article class="weather-map" :style="mapStyle" :aria-label="title">
    <header class="weather-map__header" data-map-swipe-area>
      <h2>{{ title }}</h2>
      <p>{{ city }}</p>
      <p class="weather-map__hint">{{ text.mapSwipeHint }}</p>
      <div class="weather-map__navigation-space btn">
        <time class="weather-map__time" :datetime="new Date(displayTime).toISOString()">{{
          timeLabel
        }}</time>
      </div>
    </header>
    <div class="weather-map__body">
      <iframe
        v-if="enabled && src"
        :key="revision"
        :src="src"
        :title="title"
        referrerpolicy="strict-origin-when-cross-origin"
        @load="finish"
        @error="failed = true"
      />
      <div v-if="active && !props.online" class="weather-map__notice">{{ text.mapOffline }}</div>
      <div v-else-if="active && !location" class="weather-map__notice">
        {{ text.mapLocationPending }}
      </div>
      <div v-else-if="active && !forecastAvailable" class="weather-map__notice">
        {{ text.mapForecastUnavailable }}
      </div>
      <div v-else-if="active && failed" class="weather-map__notice">
        <p>{{ text.mapFailed }}</p>
        <button type="button" class="btn" data-map-retry @click="restart">{{ text.retry }}</button>
        <a v-if="src" :href="src" target="_blank" rel="noopener noreferrer">{{ text.mapOpen }}</a>
      </div>
      <div v-else-if="enabled && !loaded" class="weather-map__loading">
        <LoadingIndicator :label="text.mapLoading" />
      </div>
    </div>
    <footer class="weather-map__footer" data-map-swipe-area>{{ text.mapGestureHint }}</footer>
  </article>
</template>
