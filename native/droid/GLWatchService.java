package com.taha.generator;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * خدمة تعمل في الخلفية (Foreground Service) تحافظ على اتصال بقناة Supabase Realtime وتعرض إشعارات الهاتف
 * لحركات بقية الفريق فور حدوثها، حتى والتطبيق مغلق وبعد إعادة تشغيل الهاتف. لا تحتاج Firebase.
 */
public class GLWatchService extends Service {
  static volatile boolean appVisible = false;
  static final String PREFS = "gl_watch";
  static final String CH_SVC = "gl-service";
  static final String CH_ALERT = "gl-alerts";
  static final int FG_ID = 1;

  private final Handler h = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private OkHttpClient http;
  private WebSocket sock;
  private boolean joined = false;
  private boolean alive = false;
  private long backoff = 2000;
  private int seq = 0;
  private String url = "", key = "", token = "", ws = "";
  private ConnectivityManager.NetworkCallback netCb;

  static void start(Context c) {
    Intent i = new Intent(c, GLWatchService.class);
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
  }

  static void stop(Context c) {
    c.stopService(new Intent(c, GLWatchService.class));
  }

  static void clearAlerts(Context c) {
    try {
      NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      if (Build.VERSION.SDK_INT >= 23) {
        for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() != FG_ID) nm.cancel(n.getId());
      }
    } catch (Exception e) { /* لا شيء */ }
  }

  @Override public IBinder onBind(Intent intent) { return null; }

  @Override public void onCreate() {
    super.onCreate();
    alive = true;
    http = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).pingInterval(30, TimeUnit.SECONDS).build();
    if (Build.VERSION.SDK_INT >= 24) {
      try {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        netCb = new ConnectivityManager.NetworkCallback() {
          @Override public void onAvailable(Network n) {
            h.post(() -> { backoff = 2000; closeSock(); connect(); pollNow(); });
          }
        };
        cm.registerDefaultNetworkCallback(netCb);
      } catch (Exception e) { netCb = null; }
    }
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    makeChannels();
    Notification n = foregroundNotification();
    if (Build.VERSION.SDK_INT >= 34) startForeground(FG_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    else startForeground(FG_ID, n);
    reload();
    h.removeCallbacks(loop);
    h.postDelayed(loop, 60000);
    h.removeCallbacks(beat);
    h.postDelayed(beat, 25000);
    return START_STICKY;
  }

  @Override public void onDestroy() {
    alive = false;
    h.removeCallbacksAndMessages(null);
    closeSock();
    io.shutdownNow();
    if (Build.VERSION.SDK_INT >= 24 && netCb != null) {
      try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCb); } catch (Exception e) { /* لا شيء */ }
    }
    super.onDestroy();
  }

  private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  private void reload() {
    SharedPreferences p = prefs();
    url = p.getString("url", ""); key = p.getString("key", ""); token = p.getString("token", ""); ws = p.getString("ws", "");
    if (token.isEmpty() || url.isEmpty()) { stopSelf(); return; }
    backoff = 2000;
    closeSock();
    connect();
    pollNow();
  }

  // مراقبة دورية: تعيد الاتصال إن انقطع، وتسحب كشبكة أمان
  private final Runnable loop = new Runnable() {
    @Override public void run() {
      if (!alive) return;
      if (!joined) { closeSock(); connect(); }
      pollNow();
      h.postDelayed(this, 60000);
    }
  };
  private final Runnable beat = new Runnable() {
    @Override public void run() {
      if (!alive) return;
      WebSocket s = sock;
      if (s != null) s.send("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"" + (++seq) + "\"}");
      h.postDelayed(this, 25000);
    }
  };

  private void closeSock() {
    joined = false;
    WebSocket s = sock; sock = null;
    if (s != null) { try { s.close(1000, null); } catch (Exception e) { /* لا شيء */ } }
  }

  private void connect() {
    if (sock != null || !alive || token.isEmpty()) return;
    final String topic = "realtime:gl-" + ws;
    String u = url.replaceFirst("^http", "ws") + "/realtime/v1/websocket?apikey=" + key + "&vsn=1.0.0";
    sock = http.newWebSocket(new Request.Builder().url(u).build(), new WebSocketListener() {
      @Override public void onOpen(WebSocket w, Response r) {
        w.send("{\"topic\":\"" + topic + "\",\"event\":\"phx_join\",\"payload\":{\"config\":{\"broadcast\":{\"self\":false,\"ack\":false},\"presence\":{\"key\":\"\"},\"postgres_changes\":[]}},\"ref\":\"" + (++seq) + "\"}");
      }
      @Override public void onMessage(WebSocket w, String t) {
        try {
          JSONObject m = new JSONObject(t);
          String ev = m.optString("event");
          if ("phx_reply".equals(ev) && topic.equals(m.optString("topic"))) {
            joined = "ok".equals(m.getJSONObject("payload").optString("status"));
            if (joined) { backoff = 2000; pollNow(); }
          } else if ("broadcast".equals(ev)) {
            pollNow();
          }
        } catch (Exception e) { /* لا شيء */ }
      }
      @Override public void onClosed(WebSocket w, int code, String reason) { lost(w); }
      @Override public void onFailure(WebSocket w, Throwable t, Response r) { lost(w); }
    });
  }

  private void lost(final WebSocket w) {
    h.post(() -> {
      if (w != sock) return;
      sock = null; joined = false;
      if (alive) { h.postDelayed(this::connect, backoff); backoff = Math.min(backoff * 2, 30000); }
    });
  }

  private void pollNow() {
    try { io.execute(this::poll); } catch (Exception e) { /* لا شيء */ }
  }

  private String call(String fn, JSONObject body) throws Exception {
    Request.Builder rb = new Request.Builder().url(url + "/rest/v1/rpc/" + fn)
        .header("apikey", key)
        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")));
    if (key.startsWith("eyJ")) rb.header("Authorization", "Bearer " + key);
    try (Response r = http.newCall(rb.build()).execute()) {
      String t = r.body() != null ? r.body().string() : "";
      if (!r.isSuccessful()) {
        if (t.contains("forbidden")) throw new SecurityException("forbidden");
        throw new Exception("http " + r.code());
      }
      return t;
    }
  }

  private synchronized void poll() {
    try {
      SharedPreferences p = prefs();
      String cur = p.getString("cursor", "");
      JSONObject b = new JSONObject();
      b.put("p_token", token);
      b.put("p_since", cur.isEmpty() ? JSONObject.NULL : cur);
      JSONObject r = new JSONObject(call("notif_pull", b));
      String next = r.isNull("cursor") ? cur : r.optString("cursor", cur);
      if (!cur.isEmpty()) {
        JSONArray items = r.optJSONArray("items");
        if (items != null && items.length() > 0) show(items);
      }
      if (!next.isEmpty()) p.edit().putString("cursor", next).apply();
    } catch (SecurityException e) {
      // انتهت الجلسة: نتوقف ولا نعيد المحاولة
      prefs().edit().clear().apply();
      h.post(this::stopSelf);
    } catch (Exception e) { /* لا اتصال: نعيد لاحقًا */ }
  }

  private void show(JSONArray items) {
    if (appVisible) return; // والتطبيق مفتوح يعرض إشعاره الداخلي
    long now = System.currentTimeMillis();
    List<JSONObject> fresh = new ArrayList<>();
    for (int i = 0; i < items.length(); i++) {
      JSONObject d = items.optJSONObject(i);
      if (d == null) continue;
      long at = d.optLong("at", now);
      if (now - at < 10 * 60 * 1000L) fresh.add(d); // نتجاهل القديم جدًا (بعد انقطاع طويل)
    }
    if (fresh.isEmpty()) return;
    if (fresh.size() > 3) {
      JSONObject last = fresh.get(fresh.size() - 1);
      post(100, "حسابات المولدة", fresh.size() + " حركات جديدة — آخرها: " + last.optString("text"), "/log", last.optLong("at", now));
      return;
    }
    for (JSONObject d : fresh) {
      String sub = d.optString("subId", "");
      String k = d.optString("k", "");
      String route = !sub.isEmpty() ? "/sub/" + sub : "note".equals(k) ? "/notes" : "/log";
      String by = d.optString("by", "");
      post(200 + (int) (d.optLong("at", now) % 700), by.isEmpty() ? "حسابات المولدة" : by, d.optString("text"), route, d.optLong("at", now));
    }
  }

  private void post(int id, String title, String text, String route, long when) {
    try {
      Intent i = new Intent(this, MainActivity.class);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      i.putExtra("route", route);
      int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
      PendingIntent pi = PendingIntent.getActivity(this, id, i, fl);
      Notification n = new NotificationCompat.Builder(this, CH_ALERT)
          .setSmallIcon(R.drawable.ic_stat_bolt)
          .setContentTitle(title)
          .setContentText(text)
          .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
          .setPriority(NotificationCompat.PRIORITY_MAX)
          .setCategory(NotificationCompat.CATEGORY_MESSAGE)
          .setDefaults(NotificationCompat.DEFAULT_ALL)
          .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
          .setAutoCancel(true)
          .setWhen(when)
          .setContentIntent(pi)
          .build();
      NotificationManagerCompat.from(this).notify(id, n);
    } catch (Exception e) { /* الإذن غير ممنوح */ }
  }

  private Notification foregroundNotification() {
    Intent i = new Intent(this, MainActivity.class);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    return new NotificationCompat.Builder(this, CH_SVC)
        .setSmallIcon(R.drawable.ic_stat_bolt)
        .setContentTitle("حسابات المولدة")
        .setContentText("متصل لاستقبال التنبيهات")
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setOngoing(true)
        .setShowWhen(false)
        .setContentIntent(PendingIntent.getActivity(this, 1, i, fl))
        .build();
  }

  private void makeChannels() {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    NotificationChannel svc = new NotificationChannel(CH_SVC, "اتصال التنبيهات", NotificationManager.IMPORTANCE_MIN);
    svc.setDescription("إشعار صامت يبقي التطبيق جاهزًا لاستقبال التنبيهات");
    svc.setShowBadge(false);
    nm.createNotificationChannel(svc);
    NotificationChannel al = new NotificationChannel(CH_ALERT, "تنبيهات المولدة", NotificationManager.IMPORTANCE_HIGH);
    al.setDescription("التسديد والملاحظات وحركات الفريق");
    al.enableVibration(true);
    al.setShowBadge(true);
    al.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(al);
  }
}
