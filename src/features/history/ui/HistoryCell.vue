<script setup lang="ts">
import { computed } from 'vue';
import { ForecastWeatherCard, type HistoryWeatherCell } from '@/entities/weather';
import { messages, type Locale } from '@/shared/locales';
import { LoadingIndicator } from '@/shared/ui/loading-indicator';
import { useHistoryStore } from '@/features/history/model/history-store';

const props = defineProps<{
  readonly cell: HistoryWeatherCell;
  readonly city: string;
  readonly timeZone: string;
  readonly locale: Locale;
}>();
const history = useHistoryStore();
const text = computed(() => messages[props.locale]);
const data = computed(() => history.day(props.cell.date));
const failure = computed(() => history.failures[props.cell.date]);
</script>

<template>
  <ForecastWeatherCard
    v-if="data"
    :forecast="data"
    kind="daily"
    :day-index="-1"
    :heading="text[cell.period]"
    :city="city"
    :time-zone="timeZone"
    :locale="locale"
    :cached-at="data.serverCachedAt ?? history.savedTimes[cell.date]"
  />
  <section v-else-if="failure" class="history-error">
    <h2>{{ text[cell.period] }}</h2>
    <p role="alert">{{ text.failures[failure] }}</p>
    <button type="button" class="btn btn-primary" @click="history.retry">{{ text.retry }}</button>
  </section>
  <LoadingIndicator v-else :label="text.loadingWeather" />
</template>

<style scoped>
@layer custom {
  .history-error {
    display: grid;
    gap: var(--spacer);
    justify-items: start;
    inline-size: 100%;
    padding: var(--spacer-4);
    background: var(--weather-error-background);
    border-radius: var(--radius-5);
  }
  .history-error p {
    margin: 0;
    overflow-wrap: anywhere;
  }
}
</style>
