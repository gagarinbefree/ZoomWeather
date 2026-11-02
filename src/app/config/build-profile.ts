/**
 * buildProfile. Select the entry and assets for each distribution.
 * @param mode The Vite build mode.
 * @returns The isolated application entry and output directory.
 */
export function buildProfile(
  mode: string,
): Readonly<{ native: boolean; fdroid: boolean; output: string; entry: string }> {
  const fdroid = mode === 'fdroid';
  const native = fdroid || mode === 'android';
  return {
    native,
    fdroid,
    output: native
      ? fdroid
        ? 'dist-fdroid'
        : 'dist-android'
      : mode === 'e2e'
        ? 'dist-e2e'
        : 'dist',
    entry: fdroid
      ? '/src/app/main.fdroid.ts'
      : native
        ? '/src/app/main.android.ts'
        : '/src/app/main.ts',
  };
}
