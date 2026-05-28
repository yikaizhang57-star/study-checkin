package com.studycheckin.app;

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

/**
 * Android 原生 Mock Location Provider 备用方案.
 *
 * 需要用户在"开发者选项 > 选择模拟位置信息应用"中选择本应用。
 *
 * WebView JS 层调用:
 *   AndroidMockLocation.startMockLocation(latitude, longitude)
 *   AndroidMockLocation.stopMockLocation()
 */
public class MockLocationHelper {
    private static final String TAG = "MockLocationHelper";
    private static final String PROVIDER_NAME = LocationManager.GPS_PROVIDER;
    private LocationManager locationManager;
    private boolean isMocking = false;

    public MockLocationHelper(Context context) {
        this.locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    }

    public void startMock(double latitude, double longitude) {
        if (locationManager == null) {
            Log.e(TAG, "LocationManager is null");
            return;
        }

        try {
            // 添加 test provider (Android 8.0+ 不再需要显式 addTestProvider)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                if (!locationManager.getProvider(PROVIDER_NAME).getName().equals(PROVIDER_NAME)) {
                    locationManager.addTestProvider(
                            PROVIDER_NAME,
                            false,    // requiresNetwork
                            false,    // requiresSatellite
                            false,    // requiresCell
                            false,    // hasMonetaryCost
                            false,    // supportsAltitude
                            false,    // supportsSpeed
                            false,    // supportsBearing
                            android.location.Criteria.POWER_LOW,
                            android.location.Criteria.ACCURACY_FINE
                    );
                }
                locationManager.setTestProviderEnabled(PROVIDER_NAME, true);
            }

            // 构造 mock location
            Location mockLocation = new Location(PROVIDER_NAME);
            mockLocation.setLatitude(latitude);
            mockLocation.setLongitude(longitude);
            mockLocation.setAltitude(0);
            mockLocation.setAccuracy(5.0f);  // 高精度
            mockLocation.setTime(System.currentTimeMillis());

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                mockLocation.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
            }

            locationManager.setTestProviderLocation(PROVIDER_NAME, mockLocation);
            isMocking = true;
            Log.i(TAG, "Mock location set: " + latitude + ", " + longitude);
        } catch (SecurityException e) {
            Log.e(TAG, "Mock location permission denied. Please enable in Developer Options.", e);
        } catch (Exception e) {
            Log.e(TAG, "Failed to set mock location", e);
        }
    }

    public void stopMock() {
        if (locationManager == null || !isMocking) return;
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                locationManager.setTestProviderEnabled(PROVIDER_NAME, false);
                locationManager.removeTestProvider(PROVIDER_NAME);
            }
            isMocking = false;
            Log.i(TAG, "Mock location stopped");
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop mock location", e);
        }
    }

    public boolean isMocking() {
        return isMocking;
    }
}
