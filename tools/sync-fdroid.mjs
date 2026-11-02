import { spawnSync } from 'node:child_process';
import process from 'node:process';

const result = spawnSync(
  process.execPath,
  ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'],
  {
    stdio: 'inherit',
    env: { ...process.env, ZOOMWEATHER_DISTRIBUTION: 'fdroid' },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
