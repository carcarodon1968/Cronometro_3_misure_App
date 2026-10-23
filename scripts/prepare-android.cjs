const fs = require("fs");

const verCode = process.env.VER_CODE || "101";
const appVer = process.env.APP_VER || "1.0.6";

let gradle = fs.readFileSync("android/app/build.gradle", "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, "versionCode " + verCode);
gradle = gradle.replace(/versionName\s+"[^"]*"/, 'versionName "' + appVer + '"');

const signingBlock = [
  "    signingConfigs {",
  "        debug {",
  '            storeFile file("/tmp/fixed_debug.keystore")',
  '            storePassword "android"',
  '            keyAlias "androiddebugkey"',
  '            keyPassword "android"',
  "        }",
  "    }",
  "    buildTypes {",
  "        debug {",
  "            signingConfig signingConfigs.debug",
  "        }"
].join("\n");

gradle = gradle.replace(/    buildTypes\s*\{/, signingBlock);
fs.writeFileSync("android/app/build.gradle", gradle);

const manifestPath = "android/app/src/main/AndroidManifest.xml";
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, "utf8");
  const requiredPermissions = [
    '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.FLASHLIGHT" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    '<uses-feature android:name="android.hardware.camera.flash" android:required="false" />',
    '<uses-feature android:name="android.hardware.microphone" android:required="false" />'
  ];
  let additions = "";
  for (const entry of requiredPermissions) {
    if (!manifest.includes(entry)) {
      additions += `    ${entry}\n`;
    }
  }
  if (additions) {
    manifest = manifest.replace("</manifest>", `${additions}</manifest>`);
    fs.writeFileSync(manifestPath, manifest);
  }
}

const filePathsXml = "android/app/src/main/res/xml/file_paths.xml";
if (fs.existsSync(filePathsXml)) {
  const xmlContent = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<paths xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <external-path name="my_images" path="." />',
    '    <cache-path name="my_cache_images" path="." />',
    '    <external-files-path name="external_files" path="." />',
    '    <files-path name="files" path="." />',
    "</paths>",
    ""
  ].join("\n");
  fs.writeFileSync(filePathsXml, xmlContent);
}

const mainActivityPath = "android/app/src/main/java/com/cronometro3misure/app/MainActivity.java";
if (fs.existsSync(mainActivityPath)) {
  const mainActivityJava = `package com.cronometro3misure.app;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private File pendingApkFile = null;
    private boolean waitingForInstallPermission = false;
    private volatile boolean isDownloadingApk = false;
    private volatile boolean cancelDownloadRequested = false;
    private AlertDialog progressDialog = null;
    private ProgressBar progressBar = null;
    private TextView progressText = null;
    private TorchBridge torchBridgeInstance = null;
    private SpeechBridge speechBridgeInstance = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            final android.view.View contentView = findViewById(android.R.id.content);
            if (contentView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
                contentView.setOnApplyWindowInsetsListener(new android.view.View.OnApplyWindowInsetsListener() {
                    @Override
                    public android.view.WindowInsets onApplyWindowInsets(android.view.View v, android.view.WindowInsets insets) {
                        int top = 0;
                        int bottom = 0;
                        int left = 0;
                        int right = 0;
                        if (Build.VERSION.SDK_INT >= 30) {
                            android.graphics.Insets sysBars = insets.getInsets(
                                android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout()
                            );
                            top = sysBars.top;
                            bottom = sysBars.bottom;
                            left = sysBars.left;
                            right = sysBars.right;
                        } else {
                            top = insets.getSystemWindowInsetTop();
                            bottom = insets.getSystemWindowInsetBottom();
                            left = insets.getSystemWindowInsetLeft();
                            right = insets.getSystemWindowInsetRight();
                        }
                        v.setPadding(left, top, right, bottom);
                        return insets;
                    }
                });
            }
        } catch (Exception ignored) {}
        torchBridgeInstance = new TorchBridge();
        speechBridgeInstance = new SpeechBridge();
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new ApkUpdaterBridge(), "AndroidApkUpdater");
            webView.addJavascriptInterface(torchBridgeInstance, "AndroidTorch");
            webView.addJavascriptInterface(speechBridgeInstance, "AndroidSpeech");
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    try {
                        request.grant(request.getResources());
                    } catch (Exception ignored) {}
                }
            });
            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                    startNativeApkDownload(url, "Cronometro_3_misure_update.apk");
                }
            });
            webView.reload();
        }
    }

    @Override
    public void startActivity(Intent intent) {
        if (shouldInterceptApkIntent(intent)) {
            return;
        }
        super.startActivity(intent);
    }

    @Override
    public void startActivity(Intent intent, Bundle options) {
        if (shouldInterceptApkIntent(intent)) {
            return;
        }
        super.startActivity(intent, options);
    }

    private boolean shouldInterceptApkIntent(Intent intent) {
        try {
            if (intent == null) return false;
            if (!Intent.ACTION_VIEW.equals(intent.getAction())) return false;
            Uri uri = intent.getData();
            if (uri == null) return false;
            String scheme = uri.getScheme();
            if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
                return false;
            }
            String url = uri.toString();
            if (url.contains(".apk") || url.contains("/releases/download/") || url.contains("update.html")) {
                startNativeApkDownload(url, "Cronometro_3_misure_update.apk");
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    @Override
    public void onResume() {
        super.onResume();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (waitingForInstallPermission && pendingApkFile != null && pendingApkFile.exists()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                waitingForInstallPermission = false;
                triggerInstallApk(pendingApkFile);
            }
        }
    }

    @Override
    public void onPause() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        try {
            if (torchBridgeInstance != null && torchBridgeInstance.isTorchOn()) {
                torchBridgeInstance.setTorch(false);
            }
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void showNativeProgressDialog() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    dismissNativeProgressDialog();
                    LinearLayout layout = new LinearLayout(MainActivity.this);
                    layout.setOrientation(LinearLayout.VERTICAL);
                    int pad = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 22, getResources().getDisplayMetrics());
                    layout.setPadding(pad, pad, pad, pad / 2);

                    progressBar = new ProgressBar(MainActivity.this, null, android.R.attr.progressBarStyleHorizontal);
                    progressBar.setIndeterminate(false);
                    progressBar.setMax(100);
                    progressBar.setProgress(0);
                    layout.addView(progressBar);

                    progressText = new TextView(MainActivity.this);
                    progressText.setText("Connessione al server per scaricare l\\u2019aggiornamento...");
                    progressText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
                    progressText.setGravity(Gravity.CENTER_HORIZONTAL);
                    progressText.setPadding(0, pad / 2, 0, 0);
                    layout.addView(progressText);

                    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                    builder.setTitle("Aggiornamento App in corso");
                    builder.setView(layout);
                    builder.setCancelable(false);
                    builder.setNegativeButton("Annulla", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            cancelDownloadRequested = true;
                            dialog.dismiss();
                        }
                    });
                    progressDialog = builder.create();
                    progressDialog.show();
                } catch (Exception ignored) {}
            }
        });
    }

    private void updateNativeProgressDialog(final int percent, final long downloadedBytes, final long totalBytes, final String customMsg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (progressBar != null) {
                        progressBar.setIndeterminate(totalBytes <= 0 && percent <= 0);
                        progressBar.setProgress(Math.max(0, Math.min(100, percent)));
                    }
                    if (progressText != null) {
                        if (totalBytes > 0) {
                            double dlMb = downloadedBytes / (1024.0 * 1024.0);
                            double totMb = totalBytes / (1024.0 * 1024.0);
                            progressText.setText(String.format(Locale.US, "Scaricamento diretto: %d%% (%.2f / %.2f MB)", percent, dlMb, totMb));
                        } else if (customMsg != null && !customMsg.isEmpty()) {
                            progressText.setText(customMsg);
                        }
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void dismissNativeProgressDialog() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (progressDialog != null && progressDialog.isShowing()) {
                        progressDialog.dismiss();
                    }
                } catch (Exception ignored) {}
                progressDialog = null;
            }
        });
    }

    private void sendProgressToJs(final String status, final int percent, final long downloadedBytes, final long totalBytes, final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (getBridge() == null || getBridge().getWebView() == null) return;
                    org.json.JSONObject detail = new org.json.JSONObject();
                    detail.put("status", status);
                    detail.put("percent", percent);
                    detail.put("downloadedBytes", downloadedBytes);
                    detail.put("totalBytes", totalBytes);
                    detail.put("message", message == null ? "" : message);
                    String js = "window.dispatchEvent(new CustomEvent(\\"apk-download-progress\\", { detail: " + detail.toString() + " }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                } catch (Exception ignored) {}
            }
        });
    }

    private void triggerInstallApk(final File apkFile) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (apkFile == null || !apkFile.exists()) return;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        if (!getPackageManager().canRequestPackageInstalls()) {
                            waitingForInstallPermission = true;
                            AlertDialog.Builder b = new AlertDialog.Builder(MainActivity.this);
                            b.setTitle("Autorizzazione Aggiornamento");
                            b.setMessage("Per installare l\\u2019aggiornamento, attiva \\"Consenti da questa fonte\\" nella schermata successiva e poi torna indietro.");
                            b.setCancelable(false);
                            b.setPositiveButton("Apri Impostazioni", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface d, int w) {
                                    Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                        Uri.parse("package:" + getPackageName()));
                                    permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    MainActivity.super.startActivity(permIntent, null);
                                }
                            });
                            b.show();
                            return;
                        }
                    }
                    waitingForInstallPermission = false;
                    Uri apkUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        apkFile
                    );
                    Intent installIntent = new Intent(Intent.ACTION_VIEW);
                    installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    MainActivity.super.startActivity(installIntent, null);
                } catch (Exception e) {
                    sendProgressToJs("error", 0, 0, 0, e.getMessage());
                }
            }
        });
    }

    private String extractVersionFromUrl(String rawUrl) {
        try {
            if (rawUrl == null) return "1.0.6";
            Uri u = Uri.parse(rawUrl);
            String qv = u.getQueryParameter("v");
            if (qv != null && !qv.trim().isEmpty()) {
                return qv.trim().replaceAll("^[vV]\\\\.?", "");
            }
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("v\\\\.([0-9]+\\\\.[0-9]+\\\\.[0-9]+)").matcher(rawUrl);
            if (m.find()) {
                return m.group(1);
            }
        } catch (Exception ignored) {}
        return "1.0.6";
    }

    private boolean isValidApkFile(File f) {
        if (f == null || !f.exists() || f.length() < 100000L) return false;
        FileInputStream fis = null;
        try {
            fis = new FileInputStream(f);
            int b0 = fis.read();
            int b1 = fis.read();
            return (b0 == 0x50 && b1 == 0x4B);
        } catch (Exception e) {
            return false;
        } finally {
            try { if (fis != null) fis.close(); } catch (Exception ignored) {}
        }
    }

    private void startNativeApkDownload(final String rawUrl, final String fileName) {
        if (isDownloadingApk) return;
        isDownloadingApk = true;
        cancelDownloadRequested = false;
        showNativeProgressDialog();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String ver = extractVersionFromUrl(rawUrl);
                    String pagesDirect = "https://carcarodon1968.github.io/Cronometro_3_misure_App/Cronometro_3_misure_v." + ver + ".apk";
                    String pagesLatest = "https://carcarodon1968.github.io/Cronometro_3_misure_App/Cronometro_3_misure_latest.apk";
                    String ghRelease = "https://github.com/carcarodon1968/Cronometro_3_misure_App/releases/download/v." + ver + "/Cronometro_3_misure_v." + ver + ".apk";
                    List<String> candidates = new ArrayList<String>();
                    if (rawUrl != null && rawUrl.contains(".apk") && !rawUrl.contains("update.html")) {
                        candidates.add(rawUrl);
                    }
                    if (!candidates.contains(pagesDirect)) candidates.add(pagesDirect);
                    if (!candidates.contains(pagesLatest)) candidates.add(pagesLatest);
                    if (!candidates.contains(ghRelease)) candidates.add(ghRelease);

                    File targetDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (targetDir == null) targetDir = getCacheDir();
                    if (!targetDir.exists()) targetDir.mkdirs();
                    String cleanName = (fileName != null && fileName.endsWith(".apk")) ? fileName : ("Cronometro_3_misure_v." + ver + ".apk");
                    cleanName = cleanName.replaceAll("[^a-zA-Z0-9._-]", "_");
                    File tempFile = new File(targetDir, cleanName + ".part");
                    File finalFile = new File(targetDir, cleanName);

                    Exception lastErr = null;
                    boolean downloadedOk = false;

                    for (int cIdx = 0; cIdx < candidates.size(); cIdx++) {
                        if (cancelDownloadRequested) throw new Exception("Download annullato");
                        String candidateUrl = candidates.get(cIdx);
                        HttpURLConnection conn = null;
                        InputStream in = null;
                        FileOutputStream out = null;
                        try {
                            sendProgressToJs("downloading", 0, 0, 0, "Connessione al server...");
                            updateNativeProgressDialog(0, 0, 0, "Connessione al server...");
                            String currentUrl = candidateUrl;
                            for (int i = 0; i < 10; i++) {
                                URL url = new URL(currentUrl);
                                conn = (HttpURLConnection) url.openConnection();
                                conn.setInstanceFollowRedirects(false);
                                conn.setConnectTimeout(20000);
                                conn.setReadTimeout(30000);
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android)");
                                conn.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
                                conn.connect();
                                int code = conn.getResponseCode();
                                if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                                    code == HttpURLConnection.HTTP_MOVED_TEMP ||
                                    code == HttpURLConnection.HTTP_SEE_OTHER ||
                                    code == 307 || code == 308) {
                                    String location = conn.getHeaderField("Location");
                                    conn.disconnect();
                                    if (location == null) break;
                                    currentUrl = new URL(url, location).toString();
                                } else {
                                    break;
                                }
                            }
                            if (conn == null || conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                                throw new Exception("HTTP " + (conn != null ? conn.getResponseCode() : -1));
                            }
                            long totalBytes = conn.getContentLengthLong();
                            if (tempFile.exists()) tempFile.delete();
                            in = conn.getInputStream();
                            out = new FileOutputStream(tempFile);
                            byte[] buffer = new byte[16384];
                            long downloadedBytes = 0;
                            int bytesRead;
                            int lastPercent = -1;
                            while ((bytesRead = in.read(buffer)) != -1) {
                                if (cancelDownloadRequested) {
                                    throw new Exception("Download annullato");
                                }
                                out.write(buffer, 0, bytesRead);
                                downloadedBytes += bytesRead;
                                int percent = totalBytes > 0 ? (int) ((downloadedBytes * 100L) / totalBytes) : 0;
                                if (percent != lastPercent) {
                                    lastPercent = percent;
                                    sendProgressToJs("downloading", percent, downloadedBytes, totalBytes, "Download in corso...");
                                    updateNativeProgressDialog(percent, downloadedBytes, totalBytes, "Download in corso...");
                                }
                            }
                            out.flush();
                            out.close();
                            out = null;
                            in.close();
                            in = null;

                            if (isValidApkFile(tempFile)) {
                                if (finalFile.exists()) finalFile.delete();
                                if (!tempFile.renameTo(finalFile)) {
                                    finalFile = tempFile;
                                }
                                downloadedOk = true;
                                pendingApkFile = finalFile;
                                sendProgressToJs("completed", 100, downloadedBytes, totalBytes, "Download completato!");
                                updateNativeProgressDialog(100, downloadedBytes, totalBytes, "Download completato!");
                                break;
                            } else {
                                if (tempFile.exists()) tempFile.delete();
                                throw new Exception("File APK non valido");
                            }
                        } catch (Exception candidateEx) {
                            lastErr = candidateEx;
                            if (cancelDownloadRequested) break;
                        } finally {
                            try { if (out != null) out.close(); } catch (Exception ignored) {}
                            try { if (in != null) in.close(); } catch (Exception ignored) {}
                            if (conn != null) conn.disconnect();
                        }
                    }

                    dismissNativeProgressDialog();
                    if (downloadedOk && pendingApkFile != null && pendingApkFile.exists()) {
                        triggerInstallApk(pendingApkFile);
                    } else if (!cancelDownloadRequested) {
                        String errMsg = lastErr != null ? lastErr.getMessage() : "Impossibile scaricare APK";
                        sendProgressToJs("error", 0, 0, 0, errMsg);
                    }
                } catch (Exception e) {
                    dismissNativeProgressDialog();
                    sendProgressToJs("error", 0, 0, 0, e.getMessage());
                } finally {
                    isDownloadingApk = false;
                }
            }
        }).start();
    }

    public class TorchBridge {
        private String cameraIdWithFlash = null;
        private boolean isTorchOn = false;

        private String getCameraId() {
            if (cameraIdWithFlash != null) return cameraIdWithFlash;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
            try {
                CameraManager camManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (camManager != null) {
                    for (String id : camManager.getCameraIdList()) {
                        CameraCharacteristics characteristics = camManager.getCameraCharacteristics(id);
                        Boolean hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                        Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
                        if (hasFlash != null && hasFlash && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                            cameraIdWithFlash = id;
                            return id;
                        }
                    }
                    for (String id : camManager.getCameraIdList()) {
                        CameraCharacteristics characteristics = camManager.getCameraCharacteristics(id);
                        Boolean hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                        if (hasFlash != null && hasFlash) {
                            cameraIdWithFlash = id;
                            return id;
                        }
                    }
                }
            } catch (Exception ignored) {}
            return null;
        }

        @JavascriptInterface
        public boolean isAvailable() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
            try {
                return getCameraId() != null;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean setTorch(final boolean enabled) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
            try {
                final String id = getCameraId();
                if (id == null) return false;
                final CameraManager camManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (camManager == null) return false;
                camManager.setTorchMode(id, enabled);
                isTorchOn = enabled;
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean toggleTorch() {
            return setTorch(!isTorchOn);
        }

        @JavascriptInterface
        public boolean isTorchOn() {
            return isTorchOn;
        }
    }

    public class ApkUpdaterBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public void installPendingApk() {
            if (pendingApkFile != null && pendingApkFile.exists()) {
                triggerInstallApk(pendingApkFile);
            }
        }

        @JavascriptInterface
        public void downloadAndInstall(final String apkUrl, final String fileName) {
            startNativeApkDownload(apkUrl, fileName);
        }
    }

    public class SpeechBridge {
        private SpeechRecognizer speechRecognizer = null;
        private boolean isListening = false;

        @JavascriptInterface
        public boolean isAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public boolean isListening() {
            return isListening;
        }

        @JavascriptInterface
        public void startListening(final String lang) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 202);
                                dispatchSpeechEvent("error", "permission_denied", "");
                                return;
                            }
                        }
                        if (speechRecognizer != null) {
                            try { speechRecognizer.destroy(); } catch (Exception ignored) {}
                            speechRecognizer = null;
                        }
                        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, (lang != null && !lang.isEmpty()) ? lang : "it-IT");
                        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

                        speechRecognizer.setRecognitionListener(new RecognitionListener() {
                            @Override
                            public void onReadyForSpeech(Bundle params) {
                                isListening = true;
                                dispatchSpeechEvent("ready", "", "");
                            }
                            @Override
                            public void onBeginningOfSpeech() {
                                dispatchSpeechEvent("listening", "", "");
                            }
                            @Override
                            public void onRmsChanged(float rmsdB) {}
                            @Override
                            public void onBufferReceived(byte[] buffer) {}
                            @Override
                            public void onEndOfSpeech() {
                                isListening = false;
                                dispatchSpeechEvent("end", "", "");
                            }
                            @Override
                            public void onError(int error) {
                                isListening = false;
                                dispatchSpeechEvent("error", "code_" + error, "");
                            }
                            @Override
                            public void onResults(Bundle results) {
                                isListening = false;
                                ArrayList<String> matches = (results != null) ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                                String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                                dispatchSpeechEvent("result", "", text);
                            }
                            @Override
                            public void onPartialResults(Bundle partialResults) {
                                ArrayList<String> matches = (partialResults != null) ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                                String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                                if (!text.isEmpty()) {
                                    dispatchSpeechEvent("partial", "", text);
                                }
                            }
                            @Override
                            public void onEvent(int eventType, Bundle params) {}
                        });
                        speechRecognizer.startListening(intent);
                    } catch (Exception e) {
                        isListening = false;
                        dispatchSpeechEvent("error", e.getMessage(), "");
                    }
                }
            });
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (speechRecognizer != null) {
                            speechRecognizer.stopListening();
                        }
                    } catch (Exception ignored) {}
                    isListening = false;
                    dispatchSpeechEvent("end", "", "");
                }
            });
        }

        private void dispatchSpeechEvent(final String type, final String error, final String text) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            String safeText = text != null ? text.replace("\\\\", "\\\\\\\\").replace("\"", "\\\\\"").replace("\n", " ") : "";
                            String safeError = error != null ? error.replace("\\\\", "\\\\\\\\").replace("\"", "\\\\\"") : "";
                            String js = "window.dispatchEvent(new CustomEvent('androidSpeechEvent', { detail: { type: '" + type + "', error: '" + safeError + "', text: '" + safeText + "' } }));";
                            getBridge().getWebView().evaluateJavascript(js, null);
                        } catch (Exception ignored) {}
                    }
                });
            }
        }
    }
}
`;
  fs.writeFileSync(mainActivityPath, mainActivityJava);
}
console.log("Prepared Android project for version", appVer, "versionCode", verCode);
