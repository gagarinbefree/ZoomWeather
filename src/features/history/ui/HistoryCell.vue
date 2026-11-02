<script setup lang="ts">
import { computed } from 'vue';
import { ForecastWeatherCard, type HistoryWeatherCell } from '@/entities/weather';
import { messages, type Locale } from '@/shared/locales';
const props = defineProps<{
  readonly cell: HistoryWeatherCell;
  readonly city: string;
  readonly timeZone: string;
  readonly locale: Locale;
}>();
const text = computed(() => messages[props.locale]);
</script>

<template>
  <ForecastWeatherCard
    :forecast="cell.weather"
    kind="daily"
    :day-index="-1"
    :heading="text[cell.period]"
    :city="city"
    :time-zone="timeZone"
    :locale="locale"
  />
</template>
