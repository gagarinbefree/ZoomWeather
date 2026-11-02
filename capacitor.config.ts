import type { CapacitorConfig } from '@capacitor/cli';

const fdroid = process.env['ZOOMWEATHER_DISTRIBUTION'] === 'fdroid';

const config: CapacitorConfig = {
  // Keep the installed package identity so existing Android apps can update.
  appId: 'com.gagarinbefree.tikweather',
  appName: 'ZoomWeather',
  webDir: fdroid ? 'dist-fdroid' : 'dist-android',
  ...(fdroid ? { includePlugins: [] } : {}),
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
