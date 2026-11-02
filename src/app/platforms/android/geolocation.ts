import type { DeviceGeolocation } from '@/entities/location';

export interface NativeGeolocation {
  readonly getCurrentPosition: (options: PositionOptions) => Promise<{
    readonly coords: { readonly latitude: number; readonly longitude: number };
  }>;
}

/**
 * createAndroidGeolocation. Adapt native Android location to the shared location service
 *
 * @param native The Capacitor geolocation plugin.
 * @returns The device interface used by the shared location service.
 */
export function createAndroidGeolocation(native: NativeGeolocation): DeviceGeolocation {
  return {
    getCurrentPosition(success, failure, options): void {
      void native
        .getCurrentPosition({ ...options, enableHighAccuracy: true, timeout: 11000 })
        .then(success, failure);
    },
  };
}
