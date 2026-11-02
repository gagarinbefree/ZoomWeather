import { describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import {
  initializeDiagnostics,
  recordApiRequest,
  reportFailure,
} from '@/app/platforms/android/fdroid-diagnostics';

describe('F Droid diagnostics', () => {
  it('never sends requests even when a collector DSN was supplied', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    try {
      initializeDiagnostics(createApp({}), 'Android', 'https://public@example.com/1');
      recordApiRequest('https://example.com/weather', 100, 503, 'unavailable');
      reportFailure(new Error('offline'), 'current', true);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
