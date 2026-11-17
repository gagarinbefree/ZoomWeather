# Weather backend

The website, installed PWA and Android app use the same backend configuration in
`shared/assets/config/weather-server.json`. The default address is
`https://157.22.180.167:8443/`. `VITE_WEATHER_SERVER_URL` can override this public address.
Only HTTPS is accepted outside local development. URLs with credentials, queries or fragments are
rejected. The Vite environment allowlist excludes obsolete provider keys even if an old local
`.env` file still contains them.

All weather requests use the VPS routes:

- `/api/weatherapi/v1/current.json` and `/api/weatherapi/v1/forecast.json`
- `/api/open-meteo/v1/forecast`
- `/api/openweathermap/data/2.5/weather` and `/api/openweathermap/data/2.5/forecast`

The client sends no WeatherAPI `key` or OpenWeatherMap `appid`. Provider credentials exist only in
WeatherServer secret mounts and repository secrets. ZoomWeather builds do not receive provider
secrets. Production site and Android bundle audits reject direct provider URLs and obsolete key
wiring after each build. This includes the Android web assets copied by Capacitor.

Native provider parsing, units, localization, progressive loading and forecast horizons remain in
the existing shared adapters. Device location and public GeoJS and reverse geocoding requests keep
their existing flow. Before requesting weather the client requires valid coordinates, a city and a
country code. Device coordinates wait up to eight seconds for reverse geocoding. Incomplete or
mismatched place results produce a localized location error and a retry button. The app does not
replace valid GPS coordinates with an unrelated IP city when reverse geocoding fails.
The last saved forecast is shown immediately for its original location. It stays visible while
coordinates, city and country are resolved and fresh weather is requested. Only a successful weather
response replaces it. Failed location or weather requests leave the saved forecast available,
including when the newly detected location is different.

Current weather and daily and hourly forecasts use Open-Meteo first, WeatherAPI second and
OpenWeatherMap third. A fresh complete response stops fallback requests. The extended forecast can
combine available calendar days up to 16 days. On shared dates it keeps the preferred source;
backups fill missing later days. Each day keeps its provider and actual display interval, including
the three hour OpenWeatherMap forecast. Legacy device snapshots without provider metadata still load.

Fresh weather is preferred over server snapshots. If every live source fails, the newest retained
response is shown with its original server fetch time. Forecast merging prefers fresh readings for
shared dates and can retain saved later days with their own saved markers. Local offline snapshots
keep the server timestamps, so restarting the app does not make old server data look fresh.
A shared backend 429 stops attempts to other provider routes on the same server; a provider 429 can
still use another provider. No additional automatic retry loops are introduced.

The server validates CORS origins for the GitHub Pages site and Android web view, exposes cache
headers and applies input, rate, concurrency and provider budget limits. A server outage continues
to use the existing device snapshot when one is available.
