package com.taha.generator;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** يعيد تشغيل خدمة التنبيهات بعد إعادة تشغيل الهاتف أو تحديث التطبيق. */
public class GLBootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context ctx, Intent intent) {
    try {
      String t = ctx.getSharedPreferences(GLWatchService.PREFS, Context.MODE_PRIVATE).getString("token", "");
      if (t != null && !t.isEmpty()) GLWatchService.start(ctx);
    } catch (Exception e) { /* لا شيء */ }
  }
}
