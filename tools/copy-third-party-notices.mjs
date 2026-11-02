import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const root = process.argv[2];
if (!root) throw new Error('Specify the completed distribution directory');
const notices = {
  'Inter-OFL.txt': 'shared/assets/fonts/LICENSE.txt',
  'Fluent-Icons-MIT.txt': 'shared/assets/icons/LICENSE',
  'TikiTaki-MIT.txt': 'node_modules/tikitaki/LICENSE',
  'TikiTaki-Vue-MIT.txt': 'node_modules/@tikitaki_gagarinbefree/vue/LICENSE',
  'Vue-MIT.txt': 'node_modules/vue/LICENSE',
  'Pinia-MIT.txt': 'node_modules/pinia/LICENSE',
  'Bootstrap-MIT.txt': 'node_modules/bootstrap/LICENSE',
  'Capacitor-Core-MIT.txt': 'node_modules/@capacitor/core/LICENSE',
  'Capacitor-Android-MIT.txt': 'node_modules/@capacitor/android/LICENSE',
  'Timezone-Lookup-MIT.txt': 'node_modules/@photostructure/tz-lookup/LICENSE',
};
await mkdir(join(root, 'licenses'), { recursive: true });
for (const [name, source] of Object.entries(notices))
  await copyFile(source, join(root, 'licenses', name));
