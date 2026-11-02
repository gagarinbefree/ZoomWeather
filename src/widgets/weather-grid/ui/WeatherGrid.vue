<script setup lang="ts">
import { computed, shallowRef, useId, type Slot } from 'vue';
import type { Position } from 'tikitaki';
import type { WeatherCell, WeatherGrid } from '@/entities/weather';
import { messages } from '@/shared/locales';
import { LoadingIndicator } from '@/shared/ui/loading-indicator';
import {
  useWeatherSwipe,
  weatherRefreshOptions,
} from '@/widgets/weather-grid/model/use-weather-swipe';

const props = withDefaults(
  defineProps<{
    readonly grid: WeatherGrid;
    readonly primaryColumn?: number;
    readonly primaryRow?: number;
    readonly rowStartColumn?: (row: number) => number;
    readonly locale?: 'ru' | 'en';
    readonly refresh?: ((signal: AbortSignal) => Promise<void>) | null;
    readonly refreshEnabled?: boolean;
  }>(),
  {
    locale: 'ru',
    refreshEnabled: true,
    refresh: null,
    primaryRow: 0,
    primaryColumn: 0,
    rowStartColumn: () => 0,
  },
);
const emit = defineEmits<{ positionChange: [position: Position]; error: [error: Error] }>();
defineSlots<{
  default?: Slot<{
    readonly cell: WeatherCell;
    readonly active: boolean;
  }>;
}>();
const container = shallowRef<HTMLElement | null>(null);
const instructionId = useId();
const text = computed(() => messages[props.locale]);
const { cells, position, failed, refreshState, onKeydown } = useWeatherSwipe(
  container,
  () => props.grid,
  (next) => {
    emit('positionChange', next);
  },
  (error) => {
    emit('error', error);
  },
  (signal) => props.refresh?.(signal) ?? Promise.resolve(),
  () => props.refresh !== null && props.refreshEnabled,
  props.primaryColumn,
  props.rowStartColumn,
  props.primaryRow,
);
const refreshing = computed(() => refreshState.value?.phase === 'loading');
const refreshVisible = computed(
  () => refreshState.value !== null && refreshState.value.phase !== 'idle',
);
const refreshLabel = computed(() =>
  refreshState.value?.phase === 'armed'
    ? text.value.releaseToRefresh
    : refreshState.value?.phase === 'pulling'
      ? text.value.pullToRefresh
      : text.value.refreshingWeather,
);
const activeId = computed(
  () =>
    props.grid[position.value.row]?.[position.value.col - props.rowStartColumn(position.value.row)]
      ?.id,
);
</script>

<template>
  <section v-if="failed" class="weather-viewport" role="alert">
    {{ text.navigationFailed }}
  </section>
  <section
    v-else
    ref="container"
    class="weather-viewport"
    role="region"
    tabindex="0"
    :aria-label="text.forecastNavigation"
    :aria-describedby="instructionId"
    :style="{ '--weather-refresh-height': `${weatherRefreshOptions.holdOffset}px` }"
    :aria-busy="refreshing"
    :data-refresh-phase="refreshState?.phase ?? 'idle'"
    :data-active-cell="activeId"
    :data-grid-rows="grid.length"
    :data-row="position.row"
    :data-column="position.col"
    @keydown="onKeydown"
  >
    <div v-show="refreshVisible" class="weather-refresh" data-refresh-indicator>
      <LoadingIndicator v-if="refreshVisible" :label="refreshLabel" />
    </div>
  </section>
  <p :id="instructionId" class="visually-hidden">{{ text.swipeInstructions }}</p>
  <Teleport v-for="cell in cells" :key="cell.key" :to="cell.host">
    <section class="weather-cell" :data-cell-id="cell.item.id">
      <slot :cell="cell.item" :active="cell.item.id === activeId">
        <LoadingIndicator :label="text.loadingWeather" />
      </slot>
    </section>
  </Teleport>
</template>

<style scoped>
.weather-viewport:focus-visible {
  outline: var(--focus-ring-width) solid var(--weather-accent);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.weather-cell {
  display: grid;
  place-items: safe center;
  inline-size: 100%;
  block-size: 100%;
  overflow-y: auto;
  touch-action: none;
  padding-block: max(var(--spacer), env(safe-area-inset-top))
    max(var(--spacer), env(safe-area-inset-bottom));
  padding-inline: max(var(--spacer), env(safe-area-inset-left))
    max(var(--spacer), env(safe-area-inset-right));
}
</style>
