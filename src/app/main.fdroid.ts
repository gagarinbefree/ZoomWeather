// Load shared Bootstrap layers before component styles.
import '@assets/styles/main.scss';
import { registerPlugin } from '@capacitor/core';
import FdroidApp from './platforms/android/FdroidApp.vue';
import { createAndroidGeolocation, type NativeGeolocation } from './platforms/android/geolocation';
import { mountWeatherApp } from './bootstrap';

const location = registerPlugin<NativeGeolocation>('NativeLocation');
mountWeatherApp(FdroidApp, createAndroidGeolocation(location));
