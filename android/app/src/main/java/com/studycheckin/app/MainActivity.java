package com.studycheckin.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;

public class MainActivity extends BridgeActivity {
    private MockLocationHelper mockLocationHelper;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mockLocationHelper = new MockLocationHelper(this);

        // 在 WebView 中注入 JavaScript 接口，让 JS 层可以调用原生 Mock Location
        Bridge bridge = this.getBridge();
        if (bridge != null) {
            bridge.getWebView().addJavascriptInterface(new MockLocationInterface(), "AndroidMockLocation");
        }
    }

    /**
     * JavaScript 接口，通过 AndroidMockLocation 对象调用。
     * 用法: AndroidMockLocation.start(lat, lon)
     *       AndroidMockLocation.stop()
     */
    class MockLocationInterface {
        @JavascriptInterface
        public void start(double lat, double lon) {
            runOnUiThread(() -> {
                mockLocationHelper.startMock(lat, lon);
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(() -> {
                mockLocationHelper.stopMock();
            });
        }

        @JavascriptInterface
        public boolean isMocking() {
            return mockLocationHelper.isMocking();
        }
    }
}
