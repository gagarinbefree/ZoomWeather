import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

for (const [label, source, valid] of [
  ['plain weather code', 'const weather = 20;', true],
  ['an external APK updater', 'const url = "ZoomWeather-Android.apk";', false],
  ['a diagnostics SDK', 'const sdk = "sentry.javascript.vue";', false],
]) {
  test(`F Droid asset audit checks ${label}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zoomweather-fdroid-audit-'));
    const file = join(directory, 'app.js');
    try {
      await writeFile(file, source);
      const result = spawnSync(process.execPath, ['tools/audit-fdroid.mjs', directory], {
        encoding: 'utf8',
      });
      assert.equal(result.status === 0, valid, result.stderr);
    } finally {
      await unlink(file);
      await rmdir(directory);
    }
  });
}
