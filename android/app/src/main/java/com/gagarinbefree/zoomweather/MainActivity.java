package com.gagarinbefree.zoomweather;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * onCreate. Register system location for the F Droid distribution before loading the app.
     * @param savedInstanceState The activity state supplied by Android.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (BuildConfig.FDROID) registerPlugin(NativeLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
