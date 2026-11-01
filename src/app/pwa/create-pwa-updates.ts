import type { registerSW } from 'virtual:pwa-register';
import { isInstalledPwa } from './installed-mode';

interface PwaUpdates {
  readonly applyUpdate: () => Promise<void>;
  readonly dispose: () => void;
}

/**
 * createPwaUpdates. Keep open browser tabs and installed apps aware of new versions.
 * @param register The service worker registration function.
 * @param notify The callback that offers an update in an installed app.
 * @param installed The check for an installed app display mode.
 * @returns The update action and cleanup for timers and browser listeners.
 */
export function createPwaUpdates(
  register: typeof registerSW,
  notify: () => void,
  installed: () => boolean = isInstalledPwa,
): PwaUpdates {
  let registration: ServiceWorkerRegistration | undefined;
  let checking = false;
  let disposed = false;

  /** check. Look for a new worker without interrupting weather when the network fails. */
  async function check(): Promise<void> {
    if (disposed || checking || !registration || !navigator.onLine) return;
    checking = true;
    try {
      await registration.update();
    } catch {
      // The next focus or reconnection will retry this optional update check.
    } finally {
      checking = false;
    }
  }

  const update = register({
    immediate: true,
    onNeedRefresh: () => {
      if (disposed) return;
      if (installed()) notify();
      else void applyUpdate();
    },
    onRegisteredSW: (_url, next) => {
      registration = next;
      void check();
    },
  });

  /**
   * applyUpdate. Activate the downloaded version and reload its page.
   * @returns A promise that settles after the activation request.
   */
  async function applyUpdate(): Promise<void> {
    try {
      await update(true);
    } catch {
      // Keep the current version usable if activation cannot finish yet.
    }
  }

  /** requestCheck. Start an update check from a browser event or timer. */
  function requestCheck(): void {
    void check();
  }

  window.addEventListener('focus', requestCheck);
  window.addEventListener('online', requestCheck);
  const timer = window.setInterval(requestCheck, 15 * 60 * 1000);

  /** dispose. Release update polling and listeners when the app unmounts. */
  function dispose(): void {
    disposed = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', requestCheck);
    window.removeEventListener('online', requestCheck);
  }

  return { applyUpdate, dispose };
}
