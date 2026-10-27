package com.qisas.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.content.res.AssetManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {

    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full screen
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebChromeClient(new WebChromeClient());

        // Initialize Android Native TextToSpeech Engine
        initTTS();

        // Register AndroidTTS Javascript Interface
        webView.addJavascriptInterface(new AndroidTTSInterface(), "AndroidTTS");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();

                if (url.startsWith("file:///android_asset/")) {
                    String assetPath = url.replace("file:///android_asset/", "");
                    try {
                        assetPath = java.net.URLDecoder.decode(assetPath, "UTF-8");
                    } catch (Exception e) {}
                    try {
                        AssetManager am = getAssets();
                        InputStream is = am.open(assetPath);
                        String mimeType = getMimeType(assetPath);
                        return new WebResourceResponse(mimeType, "UTF-8", is);
                    } catch (IOException e) {}
                }

                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        webView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void initTTS() {
        try {
            tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (status == TextToSpeech.SUCCESS) {
                        try {
                            int res = tts.setLanguage(Locale.US);
                            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                                tts.setLanguage(Locale.getDefault());
                            }
                        } catch (Exception e) {}
                        ttsReady = true;

                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override
                            public void onStart(final String utteranceId) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (webView != null) {
                                            webView.evaluateJavascript("if (window.onAndroidTTSStart) window.onAndroidTTSStart('" + utteranceId + "');", null);
                                        }
                                    }
                                });
                            }

                            @Override
                            public void onDone(final String utteranceId) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (webView != null) {
                                            webView.evaluateJavascript("if (window.onAndroidTTSDone) window.onAndroidTTSDone('" + utteranceId + "');", null);
                                        }
                                    }
                                });
                            }

                            @Override
                            public void onError(final String utteranceId) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (webView != null) {
                                            webView.evaluateJavascript("if (window.onAndroidTTSError) window.onAndroidTTSError('" + utteranceId + "');", null);
                                        }
                                    }
                                });
                            }

                            @Override
                            public void onRangeStart(final String utteranceId, final int start, final int end, int frame) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (webView != null) {
                                            webView.evaluateJavascript("if (window.onAndroidTTSBoundary) window.onAndroidTTSBoundary('" + utteranceId + "', " + start + ", " + end + ");", null);
                                        }
                                    }
                                });
                            }
                        });

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (webView != null) {
                                    webView.evaluateJavascript("if (window.onAndroidTTSReady) window.onAndroidTTSReady();", null);
                                }
                            }
                        });
                    }
                }
            });
        } catch (Exception e) {}
    }

    public class AndroidTTSInterface {
        @JavascriptInterface
        public boolean isReady() {
            return ttsReady;
        }

        @JavascriptInterface
        public void speak(final String text, final float rate, final float pitch, final String voiceName, final String utteranceId) {
            if (tts == null) return;
            if (!ttsReady) {
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        speak(text, rate, pitch, voiceName, utteranceId);
                    }
                }, 300);
                return;
            }
            try {
                tts.setSpeechRate(rate);
                tts.setPitch(pitch);
                if (voiceName != null && !voiceName.isEmpty()) {
                    try {
                        Set<Voice> voices = tts.getVoices();
                        if (voices != null) {
                            for (Voice v : voices) {
                                if (v.getName().equals(voiceName)) {
                                    tts.setVoice(v);
                                    break;
                                }
                            }
                        }
                    } catch (Throwable t) {}
                }
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public void stop() {
            if (ttsReady && tts != null) {
                try {
                    tts.stop();
                } catch (Exception e) {}
            }
        }

        @JavascriptInterface
        public String getVoicesJson() {
            if (!ttsReady || tts == null) return "[]";
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices == null || voices.isEmpty()) return "[]";
                StringBuilder sb = new StringBuilder("[");
                boolean first = true;
                for (Voice v : voices) {
                    if (!first) sb.append(",");
                    first = false;
                    sb.append("{");
                    sb.append("\"name\":").append(JSONObject.quote(v.getName())).append(",");
                    sb.append("\"lang\":").append(JSONObject.quote(v.getLocale().toLanguageTag()));
                    sb.append("}");
                }
                sb.append("]");
                return sb.toString();
            } catch (Throwable t) {
                return "[]";
            }
        }
    }

    private String getMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".pdf")) return "application/pdf";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".ico")) return "image/x-icon";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.evaluateJavascript(
                "(function() { " +
                "  if (typeof window.handleAndroidBack === 'function') { " +
                "    return window.handleAndroidBack(); " +
                "  } " +
                "  return false; " +
                "})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"true".equals(value)) {
                            if (webView.canGoBack()) {
                                webView.goBack();
                            } else {
                                finish();
                            }
                        }
                    }
                }
            );
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception e) {}
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}