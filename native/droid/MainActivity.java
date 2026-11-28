package com.taha.generator;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(GLPowerPlugin.class);
    super.onCreate(savedInstanceState);
    capture(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    capture(intent);
  }

  @Override
  public void onStart() {
    super.onStart();
    GLWatchService.appVisible = true;
    GLWatchService.clearAlerts(this); // فتح التطبيق يزيل إشعاراته المتراكمة
  }

  @Override
  public void onStop() {
    GLWatchService.appVisible = false;
    super.onStop();
  }

  private void capture(Intent i) {
    if (i == null) return;
    String r = i.getStringExtra("route");
    if (r != null && !r.isEmpty()) GLPowerPlugin.pendingRoute = r;
  }
}
