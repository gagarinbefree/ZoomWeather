import { copyFile, mkdir } from 'node:fs/promises';

for (const [locale, language] of [
  ['en-US', 'en'],
  ['ru-RU', 'ru'],
]) {
  const directory = `fastlane/metadata/android/${locale}/images`;
  await mkdir(`${directory}/phoneScreenshots`, { recursive: true });
  await copyFile('shared/assets/branding/app-icon-512.png', `${directory}/icon.png`);
  for (const [index, kind] of ['current', 'hourly', 'daily'].entries()) {
    await copyFile(
      `shared/assets/screenshots/fdroid-${language}-${kind}.png`,
      `${directory}/phoneScreenshots/${index + 1}.png`,
    );
  }
}
