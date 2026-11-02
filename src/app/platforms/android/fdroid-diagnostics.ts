import type * as Diagnostics from '@/shared/diagnostics';

/**
 * initializeDiagnostics. Keep remote diagnostics disabled in the F Droid distribution.
 * @param app The application being mounted.
 * @param applicationPlatform The native application platform.
 * @param dsn The ignored collector configuration.
 */
export const initializeDiagnostics: typeof Diagnostics.initializeDiagnostics = (): void => {};

/**
 * reportFailure. Leave handled failures on the device without sending reports.
 * @param error The handled failure.
 * @param operation The failed operation.
 * @param retained Whether a previous forecast is still visible.
 */
export const reportFailure: typeof Diagnostics.reportFailure = (): void => {};

/**
 * recordApiRequest. Avoid collecting request history in the F Droid distribution.
 * @param address The request address.
 * @param elapsedMs The elapsed request time.
 * @param status The optional HTTP status.
 * @param failure The optional failure category.
 */
export const recordApiRequest: typeof Diagnostics.recordApiRequest = (): void => {};
