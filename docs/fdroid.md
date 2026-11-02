# F-Droid distribution

## Build from source

Use OpenJDK 21, Android SDK platform 36, build tools 36.0.0 and the Node version in `.node-version`.

```sh
npm ci
npm run android:sync:fdroid
./android/gradlew -p android :app:testDebugUnitTest :app:assembleRelease -Pfdroid=true -PappVersionCode=58 -PappVersionName=0.1.58
```

On Windows use `android\gradlew.bat` and quote the Gradle property arguments. The resulting candidate is `android/app/build/outputs/apk/release/app-release-unsigned.apk`. F-Droid signs its builds. This unsigned candidate is not an installable store release.

The F-Droid build needs no Hawk DSN, weather provider key or signing secret. `build:fdroid` removes the diagnostics SDK and GitHub updater from its web entry. `android:sync:fdroid` excludes the Capacitor Google location plugin. The native bridge uses Android GPS and network providers, accepts approximate permission, times out, removes its listeners and lets the shared location service fall back to IP.

The `fdroid=true` Gradle guard rejects GMS, Firebase and the Ionic location backend if they enter the dependency graph. GitHub Actions builds the candidate separately after tests and uploads the unsigned APK, native unit results and dependency report as `ZoomWeather-FDroid-unsigned`.

## Return to the normal Android profile

Both distributions use the same generated Capacitor project. Run `npm run android:sync` before building the normal GitHub Android app, and do not pass `fdroid=true`. Generated Capacitor files must be committed in their normal Android state. App artwork and runtime assets remain in `shared/assets`.

## Metadata and versions

The source recipe is in `fdroid/com.gagarinbefree.tikweather.yml`. Copy it to the `metadata` directory of an fdroiddata fork when submitting. The current recipe follows `v0.1.N` tags and extracts `N` as the version code, matching GitHub Actions. Update the recipe when changing the major or minor version strategy.

Localized store descriptions live in `fastlane/metadata/android`. Run `npm run metadata:sync` to export store artwork from the shared screenshots and branding assets. These are generated distribution copies, not a second runtime asset source. The F-Droid APK also includes the upstream license notices for its fonts, icons and direct runtime libraries.

## Publication status

The app has not been submitted to or published on F-Droid. The native candidate and its dependency guard were tested locally; the full fdroidserver source and binary scans still require a Linux packaging environment. The application is licensed under MIT in the root `LICENSE` file. The recipe is intentionally disabled until the F-Droid packaging review is complete. The font and icon licenses already live in `shared/assets/fonts/LICENSE.txt` and `shared/assets/icons/LICENSE`; they retain their own terms. The author must also have the right to redistribute the supplied background drawings and app artwork.

Once these checks are satisfied, select a release tag that includes the approved license, resolve it to a full commit hash, update the recipe version, remove `Disabled`, set the approved SPDX license and open a GitLab merge request using `fdroid/submission.md`. A GitLab login is needed for that final step. The maintainers decide acceptance and may require recipe adjustments or additional evidence of actual use for this young project.

F-Droid normally signs the package with its own key. Switching from the GitHub APK to that package may require uninstalling the previous installation, which removes its local saved forecast.

The declared `NonFreeNet` and `TetheredNet` labels disclose the external map and weather services and the default WeatherServer instance. These labels require maintainer review and do not imply acceptance or rejection by themselves.

References: [inclusion policy](https://f-droid.org/en/docs/Inclusion_Policy/), [submission guide](https://f-droid.org/en/docs/Submitting_to_F-Droid_Quick_Start_Guide/), [build metadata](https://f-droid.org/en/docs/Build_Metadata_Reference/).
