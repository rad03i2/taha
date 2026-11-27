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
# RTL + name
sed -i 's/<application/<application android:supportsRtl="true"/' $A/app/src/main/AndroidManifest.xml || true
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
echo "patched"
