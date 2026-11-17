import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent } from 'vue';
import * as sentry from '@sentry/vue';
import {
  initializeDiagnostics,
  recordApiRequest,
  reportFailure,
  sanitizeEvent,
} from '@/shared/diagnostics';

vi.mock('@sentry/vue', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  globalHandlersIntegration: vi.fn(),
  browserApiErrorsIntegration: vi.fn(),
  vueIntegration: vi.fn(),
}));

const diagnosticRoot = defineComponent({});
beforeEach(() => {
  initializeDiagnostics(createApp(diagnosticRoot), 'Browser', '');
});
afterEach(() => vi.useRealTimers());

describe('Hawk diagnostics', () => {
  it('disables reporting without a valid HTTPS collector DSN', () => {
    initializeDiagnostics(
      createApp(diagnosticRoot),
      'Browser',
      'https://private-key@hawk.test/0?key=secret',
    );
    reportFailure(new Error('private message'), 'current');
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('initializes the same collector for browser PWA and Android with bounded context', () => {
    initializeDiagnostics(createApp(diagnosticRoot), 'Android', 'https://public@hawk.test/0');
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@hawk.test/0',
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        defaultIntegrations: false,
        maxBreadcrumbs: 30,
        beforeSend: sanitizeEvent,
      }),
    );
  });

  it('records safe request summaries instead of URLs query values or response payloads', () => {
    initializeDiagnostics(createApp(diagnosticRoot), 'PWA', 'https://public@hawk.test/0');
    recordApiRequest(
      'https://157.22.180.167:8443/api/weatherapi/v1/current.json?key=private&q=58.0047,56.2514',
      123,
      503,
      'unavailable',
    );
    const event = sanitizeEvent({
      type: undefined,
      message: 'URL https://example.test?token=private',
      extra: { private: 'private' },
      user: { ip_address: '188.16.96.136' },
      request: { url: 'https://example.test?key=private' },
      tags: { operation: 'current', failure: 'unavailable' },
    });
    const json = JSON.stringify(event);
    expect(json).toContain('WeatherAPI');
    expect(json).toContain('503');
    expect(json).not.toMatch(/private|58\.0047|56\.2514|188\.16\.96\.136|example\.test/);
    expect(event?.extra?.['recent_requests']).toHaveLength(1);
  });

  it('keeps only thirty recent requests and deduplicates repeated failures', () => {
    initializeDiagnostics(createApp(diagnosticRoot), 'Browser', 'https://public@hawk.test/0');
    for (let index = 0; index < 40; index++)
      recordApiRequest('https://get.geojs.io/v1/ip/geo.json', index, 200);
    const input = { type: undefined, tags: { operation: 'current', failure: 'timeout' } } as const;
    const first = sanitizeEvent(input);
    expect(first?.extra?.['recent_requests']).toHaveLength(30);
    expect(sanitizeEvent(input)).toBeNull();
  });

  it('does not send cancelled requests or let collector failures interrupt the application', () => {
    initializeDiagnostics(createApp(diagnosticRoot), 'Android', 'https://public@hawk.test/0');
    reportFailure({ kind: 'cancelled' }, 'forecast');
    expect(sentry.captureException).not.toHaveBeenCalled();
    vi.mocked(sentry.captureException).mockImplementationOnce(() => {
      throw new Error('collector unavailable');
    });
    expect(() => {
      reportFailure({ kind: 'timeout' }, 'current');
    }).not.toThrow();
  });
});
