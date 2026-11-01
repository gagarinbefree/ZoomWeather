import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { registerSW } from 'virtual:pwa-register';
import { createPwaUpdates } from '@/app/pwa/create-pwa-updates';

type WorkerOptions = NonNullable<Parameters<typeof registerSW>[0]>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('PWA version updates', () => {
  it('activates a ready update in a regular browser without showing the PWA prompt', () => {
    let options: WorkerOptions = {};
    const activate = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();
    const updates = createPwaUpdates(
      (callbacks) => {
        options = callbacks ?? {};
        return activate;
      },
      notify,
      () => false,
    );
    try {
      options.onNeedRefresh?.();
      expect(activate).toHaveBeenCalledWith(true);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      updates.dispose();
    }
  });

  it('keeps an installed PWA update pending until the user accepts it', async () => {
    let options: WorkerOptions = {};
    const activate = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();
    const updates = createPwaUpdates(
      (callbacks) => {
        options = callbacks ?? {};
        return activate;
      },
      notify,
      () => true,
    );
    try {
      options.onNeedRefresh?.();
      expect(notify).toHaveBeenCalledOnce();
      expect(activate).not.toHaveBeenCalled();
      await updates.applyUpdate();
      expect(activate).toHaveBeenCalledWith(true);
    } finally {
      updates.dispose();
    }
  });

  it('checks again on focus and reconnection and releases listeners when disposed', async () => {
    let options: WorkerOptions = {};
    const check = vi.fn().mockResolvedValue(undefined);
    const registration = { update: check } as unknown as ServiceWorkerRegistration;
    const updates = createPwaUpdates(
      (callbacks) => {
        options = callbacks ?? {};
        return vi.fn().mockResolvedValue(undefined);
      },
      vi.fn(),
      () => true,
    );
    options.onRegisteredSW?.('/ZoomWeather/sw.js', registration);
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalledTimes(1);
    });
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalledTimes(2);
    });
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalledTimes(3);
    });
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(check).toHaveBeenCalledTimes(4);
    updates.dispose();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(check).toHaveBeenCalledTimes(4);
  });

  it('keeps weather usable when an update check fails and retries after reconnection', async () => {
    let options: WorkerOptions = {};
    const check = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    const updates = createPwaUpdates(
      (callbacks) => {
        options = callbacks ?? {};
        return vi.fn().mockResolvedValue(undefined);
      },
      vi.fn(),
      () => true,
    );
    try {
      options.onRegisteredSW?.('/ZoomWeather/sw.js', {
        update: check,
      } as unknown as ServiceWorkerRegistration);
      await vi.waitFor(() => {
        expect(check).toHaveBeenCalledOnce();
      });
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => {
        expect(check).toHaveBeenCalledTimes(2);
      });
    } finally {
      updates.dispose();
    }
  });
});
