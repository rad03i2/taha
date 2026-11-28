#!/usr/bin/env bash
# Applies branding & build tweaks to the generated Capacitor android project.
set -euo pipefail
A=android
RES=$A/app/src/main/res
# icons
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "$RES/mipmap-$d"
  cp branding/res/mipmap-$d/*.png "$RES/mipmap-$d/"
done
mkdir -p "$RES/values"
cat > "$RES/values/ic_launcher_background.xml" <<'X'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#0A2342</color></resources>
X
# splash
for f in $(find "$RES" -name 'splash.png'); do cp branding/splash.png "$f"; done
# stable signing with committed debug keystore
cp branding/debug.keystore $A/app/debug.keystore
python3 - <<'P'
import re
p='android/app/build.gradle'
s=open(p).read()
if 'signingConfigs' not in s:
    s=s.replace('buildTypes {','''signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {''',1)
open(p,'w').write(s)
P
# vibration permission (haptic feedback)
M=$A/app/src/main/AndroidManifest.xml
grep -q 'android.permission.VIBRATE' "$M" || sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.VIBRATE" />#' "$M"
# permissions: vibration, notifications (Android 13+), battery-optimization exemption request
for PERM in VIBRATE POST_NOTIFICATIONS REQUEST_IGNORE_BATTERY_OPTIMIZATIONS; do
  grep -q "android.permission.$PERM" "$M" || sed -i "s#<uses-permission android:name=\"android.permission.INTERNET\" />#<uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.$PERM\" />#" "$M"
done

# native plugin GLPower: ask Android to exempt the app from battery optimization + open notification settings
J=$A/app/src/main/java/com/taha/generator
mkdir -p "$J"
cat > "$J/GLPowerPlugin.java" <<'JAVA'
package com.taha.generator;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GLPower")
public class GLPowerPlugin extends Plugin {
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
}
JAVA
cat > "$J/MainActivity.java" <<'JAVA'
package com.taha.generator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(GLPowerPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
JAVA

# Firebase (push notifications): enabled automatically when branding/google-services.json exists
if [ -f branding/google-services.json ]; then
  cp branding/google-services.json $A/app/google-services.json
  sed -i "s/export const PUSH = false;/export const PUSH = true;/" www/js/config.js
  echo "push enabled (google-services.json found)"
fi
echo "patched"
