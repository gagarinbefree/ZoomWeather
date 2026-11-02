package com.gagarinbefree.zoomweather;

import android.Manifest;
import android.annotation.SuppressLint;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

/** Device location using Android providers without Google Play Services. */
@CapacitorPlugin(name = "NativeLocation", permissions = {
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
    @Permission(alias = "coarseLocation", strings = {Manifest.permission.ACCESS_COARSE_LOCATION})
})
public class NativeLocationPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<LocationRequest> requests = new HashSet<>();

    /**
     * getCurrentPosition. Request permission and read one current device fix.
     * @param call The pending JavaScript request with timeout and maximum age options.
     */
    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (getPermissionState("coarseLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermissionResult");
            return;
        }
        handler.post(() -> start(call));
    }

    /**
     * locationPermissionResult. Continue only when approximate or precise location is allowed.
     * @param call The request waiting for Android permission.
     */
    @PermissionCallback
    private void locationPermissionResult(PluginCall call) {
        if (getPermissionState("coarseLocation") != PermissionState.GRANTED) {
            call.reject(getContext().getString(R.string.native_location_denied));
            return;
        }
        handler.post(() -> start(call));
    }

    /**
     * start. Attach a bounded request to the enabled Android location providers.
     * @param call The permitted JavaScript request.
     */
    private void start(PluginCall call) {
        LocationManager manager = getContext().getSystemService(LocationManager.class);
        if (manager == null) {
            call.reject(getContext().getString(R.string.native_location_unavailable));
            return;
        }
        LocationRequest request = new LocationRequest(call, manager);
        requests.add(request);
        request.begin();
    }

    /** handleOnDestroy. Remove device listeners and reject abandoned requests. */
    @Override
    protected void handleOnDestroy() {
        handler.post(() -> {
            for (LocationRequest request : new ArrayList<>(requests)) request.fail();
        });
    }

    private final class LocationRequest implements LocationListener, Runnable {
        private final PluginCall call;
        private final LocationManager manager;
        private boolean finished;

        /**
         * LocationRequest. Keep the promise and native provider for one bounded request.
         * @param call The pending JavaScript request.
         * @param manager The Android location provider manager.
         */
        private LocationRequest(PluginCall call, LocationManager manager) {
            this.call = call;
            this.manager = manager;
        }

        /** begin. Reuse only a fresh fix or wait briefly for a live device measurement. */
        @SuppressLint("MissingPermission")
        private void begin() {
            int maximumAge = Math.max(0, call.getInt("maximumAge", 0));
            int timeout = Math.max(1000, Math.min(30000, call.getInt("timeout", 11000)));
            int subscribed = 0;
            Location newest = null;
            for (String provider : new String[] {LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                try {
                    if (!manager.isProviderEnabled(provider)) continue;
                    Location cached = manager.getLastKnownLocation(provider);
                    if (cached != null && NativeLocationPolicy.isRecent(cached.getElapsedRealtimeNanos(), SystemClock.elapsedRealtimeNanos(), maximumAge)
                            && (newest == null || cached.getElapsedRealtimeNanos() > newest.getElapsedRealtimeNanos())) newest = cached;
                    manager.requestLocationUpdates(provider, 0L, 0f, this, Looper.getMainLooper());
                    subscribed++;
                } catch (SecurityException | IllegalArgumentException ignored) {
                    // Approximate permission may allow only the network provider.
                }
            }
            if (newest != null) {
                onLocationChanged(newest);
            } else if (subscribed == 0) {
                fail();
            } else {
                handler.postDelayed(this, timeout);
            }
        }

        /**
         * onLocationChanged. Resolve the JavaScript request once with native coordinates.
         * @param location The fix supplied by an enabled Android provider.
         */
        @Override
        public void onLocationChanged(Location location) {
            if (finished) return;
            cleanup();
            JSObject coordinates = new JSObject();
            coordinates.put("latitude", location.getLatitude());
            coordinates.put("longitude", location.getLongitude());
            JSObject result = new JSObject();
            result.put("coords", coordinates);
            call.resolve(result);
        }

        /** run. Fail a request that exceeded its location timeout. */
        @Override
        public void run() { fail(); }

        /** fail. Allow the shared application service to fall back to IP location. */
        private void fail() {
            if (finished) return;
            cleanup();
            call.reject(getContext().getString(R.string.native_location_unavailable));
        }

        /** cleanup. Remove the listener and timer before settling the promise. */
        private void cleanup() {
            finished = true;
            handler.removeCallbacks(this);
            try {
                manager.removeUpdates(this);
            } catch (SecurityException ignored) {
                // Android may revoke location permission while a request is pending.
            }
            requests.remove(this);
        }

        /**
         * onStatusChanged. Keep waiting until a fix or the request deadline arrives.
         * @param provider The reporting Android provider.
         * @param status The provider status.
         * @param extras The optional provider details.
         */
        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {}

        /**
         * onProviderEnabled. Keep waiting for the newly enabled provider.
         * @param provider The enabled Android provider.
         */
        @Override
        public void onProviderEnabled(String provider) {}

        /**
         * onProviderDisabled. Keep the existing deadline when a provider stops.
         * @param provider The disabled Android provider.
         */
        @Override
        public void onProviderDisabled(String provider) {}
    }
}
