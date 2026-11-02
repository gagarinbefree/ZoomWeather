import { describe, expect, it } from 'vitest';
import { buildProfile } from '@/app/config/build-profile';

describe('buildProfile', () => {
  it('isolates F Droid from browser workers and the Google location entry', () => {
    expect(buildProfile('fdroid')).toEqual({
      native: true,
      fdroid: true,
      output: 'dist-fdroid',
      entry: '/src/app/main.fdroid.ts',
    });
  });
  it('keeps existing Android and browser builds separate', () => {
    expect(buildProfile('android')).toEqual({
      native: true,
      fdroid: false,
      output: 'dist-android',
      entry: '/src/app/main.android.ts',
    });
    expect(buildProfile('production')).toEqual({
      native: false,
      fdroid: false,
      output: 'dist',
      entry: '/src/app/main.ts',
    });
    expect(buildProfile('e2e').output).toBe('dist-e2e');
  });
});
