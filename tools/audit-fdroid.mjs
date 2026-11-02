import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { log } from 'node:console';

const root = process.argv[2] ?? 'dist-fdroid';
const forbidden = [
  'api.github.com/repos/gagarinbefree/ZoomWeather/releases',
  'ZoomWeather-Android.apk',
  'sentry.javascript',
  '@sentry/',
  'app.glitchtip.com',
  'hawk.so',
];

/**
 * inspect. Reject telemetry and the external APK updater in the F Droid assets.
 * @param {string} directory The completed web assets directory.
 * @returns {Promise<number>} The number of checked executable assets.
 */
async function inspect(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = join(directory, entry.name);
    if (entry.isDirectory()) count += await inspect(name);
    else if (entry.name.endsWith('.js')) {
      const content = await readFile(name, 'utf8');
      if (forbidden.some((token) => content.includes(token)))
        throw new Error(`Forbidden F Droid integration in ${name}`);
      count++;
    }
  }
  return count;
}
const count = await inspect(root);
if (!count) throw new Error('F Droid assets are missing');
log(`Verified ${count} F Droid executable assets without remote diagnostics or an APK updater`);
