package com.taha.generator;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** جسر بين الواجهة وأندرويد: خدمة التنبيهات، استثناء البطارية، إذن الإشعارات، فتح الإعدادات. */
@CapacitorPlugin(
  name = "GLPower",
  permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class GLPowerPlugin extends Plugin {
  static volatile String pendingRoute = null;

  private boolean launch(Intent i) {
    try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); return true; } catch (Exception e) { return false; }
  }
  private Uri pkg() { return Uri.parse("package:" + getContext().getPackageName()); }

  @PluginMethod
  public void isIgnoring(PluginCall call) {
    boolean v = true;
    if (Build.VERSION.SDK_INT >= 23) {
      PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
      v = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }
    JSObject r = new JSObject();
    r.put("value", v);
    call.resolve(r);
  }

  @PluginMethod
  public void request(PluginCall call) {
    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
    i.setData(pkg());
    if (!launch(i)) launch(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
    call.resolve();
  }

  @PluginMethod
  public void notificationSettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 26) {
      Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
      i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
      if (launch(i)) { call.resolve(); return; }
    }
    appSettings(call);
  }

  @PluginMethod
  public void appSettings(PluginCall call) {
    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    i.setData(pkg());
    launch(i);
    call.resolve();
  }

  private boolean notifGranted() {
    return Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
  }

  @PluginMethod
  public void notifState(PluginCall call) {
    JSObject r = new JSObject();
    r.put("granted", notifGranted());
    call.resolve(r);
  }

  @PluginMethod
  public void requestNotif(PluginCall call) {
    if (notifGranted()) { notifState(call); return; }
    requestPermissionForAlias("notifications", call, "notifResult");
  }

  @PermissionCallback
  private void notifResult(PluginCall call) {
    notifState(call);
  }

  @PluginMethod
  public void startWatch(PluginCall call) {
    SharedPreferences p = getContext().getSharedPreferences(GLWatchService.PREFS, Context.MODE_PRIVATE);
    String tok = call.getString("token", "");
    String old = p.getString("token", "");
    SharedPreferences.Editor e = p.edit()
        .putString("url", call.getString("url", ""))
        .putString("key", call.getString("key", ""))
        .putString("token", tok)
        .putString("ws", call.getString("ws", ""));
    if (!tok.equals(old)) e.remove("cursor");
    e.apply();
    try { GLWatchService.start(getContext()); } catch (Exception ex) { /* الخدمة لا تبدأ من الخلفية */ }
    call.resolve();
  }

  @PluginMethod
  public void stopWatch(PluginCall call) {
    getContext().getSharedPreferences(GLWatchService.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    GLWatchService.stop(getContext());
    call.resolve();
  }

  // المسار الذي طلبه المستخدم بالنقر على إشعار (تستهلكه الواجهة مرة واحدة)
  @PluginMethod
  public void takeRoute(PluginCall call) {
    JSObject r = new JSObject();
    r.put("route", pendingRoute == null ? "" : pendingRoute);
    pendingRoute = null;
    call.resolve(r);
  }

  // ───── تحديث التطبيق من GitHub: تنزيل ملف APK ثم تثبيته ─────
  private File apkFile() {
    File d = new File(getContext().getCacheDir(), "updates");
    d.mkdirs();
    return new File(d, "update.apk");
  }

  @PluginMethod
  public void downloadApk(final PluginCall call) {
    final String url = call.getString("url", "");
    if (!url.startsWith("https://")) { call.reject("bad url"); return; }
    new Thread(new Runnable() {
      @Override public void run() {
        HttpURLConnection c = null;
        try {
          c = (HttpURLConnection) new URL(url).openConnection();
          c.setInstanceFollowRedirects(true);
          c.setConnectTimeout(20000);
          c.setReadTimeout(30000);
          c.connect();
          if (c.getResponseCode() / 100 != 2) { call.reject("http " + c.getResponseCode()); return; }
          long total = c.getContentLengthLong();
          File f = apkFile();
          if (f.exists()) f.delete();
          InputStream in = c.getInputStream();
          FileOutputStream out = new FileOutputStream(f);
          byte[] buf = new byte[32768];
          long done = 0; int lastPct = -1; int n;
          while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            done += n;
            int pct = total > 0 ? (int) (done * 100 / total) : 0;
            if (pct != lastPct) {
              lastPct = pct;
              JSObject o = new JSObject();
              o.put("pct", pct); o.put("done", done); o.put("total", total);
              notifyListeners("updateProgress", o);
            }
          }
          out.close(); in.close();
          JSObject r = new JSObject();
          r.put("size", f.length());
          call.resolve(r);
        } catch (Exception e) {
          call.reject(String.valueOf(e.getMessage()));
        } finally {
          if (c != null) c.disconnect();
        }
      }
    }).start();
  }

  @PluginMethod
  public void installApk(PluginCall call) {
    JSObject r = new JSObject();
    try {
      if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
        // يحتاج المستخدم السماح لهذا التطبيق بتثبيت التطبيقات (مرة واحدة)
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        i.setData(pkg());
        launch(i);
        r.put("needPermission", true);
        call.resolve(r);
        return;
      }
      File f = apkFile();
      if (!f.exists()) { call.reject("no file"); return; }
      Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
      Intent i = new Intent(Intent.ACTION_VIEW);
      i.setDataAndType(u, "application/vnd.android.package-archive");
      i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      r.put("needPermission", false);
      call.resolve(r);
    } catch (Exception e) {
      call.reject(String.valueOf(e.getMessage()));
    }
  }
}
