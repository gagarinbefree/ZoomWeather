<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { registerSW } from 'virtual:pwa-register';
import { useCurrentWeatherStore } from '@/features/current-weather';
import { WeatherPage } from '@/pages/weather';
import { useUpdatePrompt } from '@/app/model/use-update-prompt';
import { createPwaUpdates } from './pwa/create-pwa-updates';
import PwaUpdatePrompt from './ui/PwaUpdatePrompt.vue';

const { locale } = storeToRefs(useCurrentWeatherStore());
const { updateAvailable, navigationReset, dismissUpdate } = useUpdatePrompt();
const { applyUpdate, dispose } = createPwaUpdates(registerSW, () => {
  updateAvailable.value = true;
});
onBeforeUnmount(dispose);
</script>

<template>
  <WeatherPage :navigation-reset="navigationReset" />
  <PwaUpdatePrompt
    v-if="updateAvailable"
    :locale="locale"
    @update="applyUpdate"
    @dismiss="dismissUpdate"
  />
</template>
