package com.gagarinbefree.zoomweather;

/** Rules for accepting a recently measured device location. */
public final class NativeLocationPolicy {
    private NativeLocationPolicy() {}

    /**
     * isRecent. Accept a cached fix only while it meets the requested maximum age.
     * @param measuredNanos The elapsed device time when the fix was measured.
     * @param nowNanos The current elapsed device time.
     * @param maximumAgeMs The largest accepted age in milliseconds.
     * @return Whether the fix is recent without relying on the wall clock.
     */
    public static boolean isRecent(long measuredNanos, long nowNanos, int maximumAgeMs) {
        long age = nowNanos - measuredNanos;
        return maximumAgeMs > 0 && measuredNanos > 0 && age >= 0 && age / 1_000_000 <= maximumAgeMs;
    }
}
