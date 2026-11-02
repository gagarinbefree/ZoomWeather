package com.gagarinbefree.zoomweather;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class NativeLocationPolicyTest {
    @Test
    public void acceptsOnlyRecentMonotonicMeasurements() {
        assertTrue(NativeLocationPolicy.isRecent(1_000_000_000L, 2_000_000_000L, 1500));
        assertFalse(NativeLocationPolicy.isRecent(1_000_000_000L, 3_000_000_000L, 1500));
        assertFalse(NativeLocationPolicy.isRecent(3_000_000_000L, 2_000_000_000L, 1500));
        assertFalse(NativeLocationPolicy.isRecent(0, 2_000_000_000L, 1500));
        assertFalse(NativeLocationPolicy.isRecent(1_000_000_000L, 2_000_000_000L, 0));
    }
}
