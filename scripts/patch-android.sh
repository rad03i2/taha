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
# permissions: vibration, notifications (Android 13+), battery exemption, background service, start after boot
for PERM in VIBRATE POST_NOTIFICATIONS REQUEST_IGNORE_BATTERY_OPTIMIZATIONS FOREGROUND_SERVICE FOREGROUND_SERVICE_SPECIAL_USE RECEIVE_BOOT_COMPLETED; do
  grep -q "android.permission.$PERM\"" "$M" || sed -i "s#<uses-permission android:name=\"android.permission.INTERNET\" />#<uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.$PERM\" />#" "$M"
done

# background alerts service + boot receiver (declared before </application>)
python3 - "$M" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
if 'GLWatchService' not in s:
    s = s.replace('</application>', """    <service android:name=".GLWatchService" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="team_alerts_realtime" />
        </service>
        <receiver android:name=".GLBootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    </application>""", 1)
open(p, 'w').write(s)
PY

# OkHttp (websocket for the background service)
python3 - "$A/app/build.gradle" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
if 'okhttp' not in s:
    s = re.sub(r'(?m)^dependencies \{', "dependencies {\n    implementation 'com.squareup.okhttp3:okhttp:4.12.0'", s, count=1)
open(p, 'w').write(s)
PY

# native sources (native/android/*)
J=$A/app/src/main/java/com/taha/generator
mkdir -p "$J" "$RES/drawable"
cp native/android/*.java "$J/"
cp native/android/ic_stat_bolt.xml "$RES/drawable/"
echo "patched"
