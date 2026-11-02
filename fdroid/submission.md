# ZoomWeather F-Droid submission

Request for packaging submitted on November 2, 2026: [ZoomWeather #4728](https://gitlab.com/fdroid/rfp/-/work_items/4728). The request is open and awaits maintainer review. The application is licensed under MIT and is not yet published on F-Droid. Full fdroidserver source and binary scanner checks remain pending.

## Application

- Name: ZoomWeather
- Package: com.gagarinbefree.tikweather
- Source: https://github.com/gagarinbefree/ZoomWeather
- Website: https://gagarinbefree.github.io/ZoomWeather/
- Build recipe: fdroid/com.gagarinbefree.tikweather.yml
- Store metadata: fastlane/metadata/android
- Application license: MIT

## Description for reviewers

ZoomWeather shows current, hourly, daily and available historical weather in swipe cards. The Android application bundles its web UI and uses native GPS, rather than opening the public website. It retains the last successful forecast on the device for offline use. Historical summaries remain in memory only.

The F-Droid profile uses Android LocationManager without Google Play Services. It excludes remote error reporting and the GitHub APK update prompt. F-Droid manages its updates and signs its own build. No weather API keys or CI secrets are required to build the app. The Android package ID is retained from the original TikWeather name to preserve application identity.

Weather queries use the author's public WeatherServer instance. Its source is https://github.com/gagarinbefree/WeatherServer. The app also uses GeoJS and BigDataCloud for location names or IP fallback, and optionally displays Windy iframe maps. Please review the NonFreeNet and TetheredNet labels. These services receive the IP address and the coordinates needed for their requests.

The project is young. It is already used and tested on a physical Android device and an emulator. The first-release age and evidence of actual use should be reviewed under the inclusion policy rather than asserting that acceptance is automatic.

## Build tool review

The draft recipe uses an official checksum pinned Node binary and narrowly lists the FLOSS native npm build tools. These paths and licenses require F-Droid scanner review; they do not hide the entire node_modules directory. The proprietary location package is removed before scanning. The web compilation belongs to the actual build phase. The first MIT licensed release is v0.1.58, pinned to commit `68818762b8d6f6359742e862ea62a7caf2e15be0`. All GitHub Actions jobs passed for that release, including the separate unsigned F-Droid build. This is not a substitute for fdroidserver scanner checks.

## Submission destination

Follow maintainer feedback in request #4728. Once the packaging checks are complete, open a merge request against https://gitlab.com/fdroid/fdroiddata with the recipe in metadata/com.gagarinbefree.tikweather.yml and reference the existing request. Do not create a duplicate packaging request. Publication follows the maintainers' review; a GitHub build does not publish the app to F-Droid.
