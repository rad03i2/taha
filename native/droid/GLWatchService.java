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
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
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
  static volatile boolean running = false;
  static volatile boolean live = false;     // قناة Realtime متصلة
  static volatile boolean legacy = false;   // الخادم بلا notif_pull: نسحب عبر sync_pull
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
  private volatile long lastRx = 0;     // آخر رسالة وصلت من القناة (لاكتشاف الانقطاع الصامت)
  private long serverMs = 0; // وقت الخادم من ترويسة Date (لتفادي فرق ساعة الهاتف)

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
    running = true;
    http = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build();
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
    h.postDelayed(beat, 10000);
    return START_STICKY;
  }

  @Override public void onDestroy() {
    alive = false;
    running = false;
    live = false;
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
      h.postDelayed(this, joined ? 60000 : 20000); // بلا قناة لحظية نسحب كل 20 ثانية
    }
  };
  private final Runnable beat = new Runnable() {
    @Override public void run() {
      if (!alive) return;
      WebSocket s = sock;
      if (s != null) {
        if (joined && System.currentTimeMillis() - lastRx > 35000) {
          chan("لا ردّ من القناة منذ 35 ثانية: إعادة الاتصال");
          closeSock(); connect();
        } else {
          s.send("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"" + (++seq) + "\"}");
        }
      }
      h.postDelayed(this, 10000);
    }
  };

  // آخر حدث للقناة وعدد الانقطاعات (يظهر في الإعدادات دون إغراق سجل الأحداث)
  private void chan(String text) {
    SharedPreferences p = prefs();
    int n = p.getInt("flaps", 0) + ((text.startsWith("انقطعت") || text.startsWith("لا ردّ")) ? 1 : 0);
    String t = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
    p.edit().putString("chanEv", t + " " + text).putInt("flaps", n).apply();
  }

  private void closeSock() {
    joined = false; live = false;
    WebSocket s = sock; sock = null;
    if (s != null) { try { s.close(1000, null); } catch (Exception e) { /* لا شيء */ } }
  }

  private void connect() {
    if (sock != null || !alive || token.isEmpty()) return;
    final String topic = "realtime:gl-" + ws;
    String u = url.replaceFirst("^http", "ws") + "/realtime/v1/websocket?apikey=" + key + "&vsn=1.0.0";
    sock = http.newWebSocket(new Request.Builder().url(u).build(), new WebSocketListener() {
      @Override public void onOpen(WebSocket w, Response r) {
        lastRx = System.currentTimeMillis();
        w.send("{\"topic\":\"" + topic + "\",\"event\":\"phx_join\",\"payload\":{\"config\":{\"broadcast\":{\"self\":false,\"ack\":false},\"presence\":{\"key\":\"\"},\"postgres_changes\":[]}},\"ref\":\"" + (++seq) + "\"}");
      }
      @Override public void onMessage(WebSocket w, String t) {
        lastRx = System.currentTimeMillis();
        try {
          JSONObject m = new JSONObject(t);
          String ev = m.optString("event");
          if ("phx_reply".equals(ev) && topic.equals(m.optString("topic"))) {
            joined = "ok".equals(m.getJSONObject("payload").optString("status"));
            live = joined;
            chan(joined ? "متصلة" : "رفض الانضمام للقناة");
            if (joined) { backoff = 2000; pollNow(); }
          } else if ("broadcast".equals(ev)) {
            pollNow();
          }
        } catch (Exception e) { /* لا شيء */ }
      }
      @Override public void onClosed(WebSocket w, int code, String reason) { lost(w, "إغلاق " + code + " " + reason); }
      @Override public void onFailure(WebSocket w, Throwable t, Response r) { lost(w, "فشل: " + t.getClass().getSimpleName() + " " + t.getMessage()); }
    });
  }

  private void lost(final WebSocket w, final String why) {
    h.post(() -> {
      if (w != sock) return;
      chan("انقطعت — " + why);
      sock = null; joined = false; live = false;
      if (alive) { h.postDelayed(this::connect, backoff); backoff = Math.min(backoff * 2, 30000); }
    });
  }

  private void pollNow() {
    try { io.execute(this::poll); } catch (Exception e) { /* لا شيء */ }
  }

  private String call(String fn, JSONObject body) throws Exception, Missing {
    Request.Builder rb = new Request.Builder().url(url + "/rest/v1/rpc/" + fn)
        .header("apikey", key)
        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")));
    if (key.startsWith("eyJ")) rb.header("Authorization", "Bearer " + key);
    try (Response r = http.newCall(rb.build()).execute()) {
      String t = r.body() != null ? r.body().string() : "";
      String dh = r.header("Date");
      if (dh != null) {
        try {
          SimpleDateFormat f = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US);
          serverMs = f.parse(dh).getTime();
        } catch (ParseException e) { /* لا شيء */ }
      }
      if (!r.isSuccessful()) {
        if (t.contains("forbidden")) throw new SecurityException("forbidden");
        if (r.code() == 404 && t.contains("PGRST202")) throw new Missing();
        throw new Exception("http " + r.code());
      }
      return t;
    }
  }

  private static String iso(long ms) {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("UTC"));
    return f.format(new Date(ms));
  }

  private void status(String st) {
    prefs().edit().putString("status", st).putLong("last", System.currentTimeMillis()).apply();
  }

  // السحب: notif_pull (خفيف) إن وُجد في الخادم، وإلا sync_pull مع تصفية سجلات النشاط محليًا
  private synchronized void poll() {
    try {
      SharedPreferences p = prefs();
      String cur = p.getString("cursor", "");
      if (cur.isEmpty()) {
        // أول مرة: نبدأ من الآن دون عرض الماضي
        if (!legacy) {
          try {
            JSONObject b0 = new JSONObject(); b0.put("p_token", token); b0.put("p_since", JSONObject.NULL);
            JSONObject r0 = new JSONObject(call("notif_pull", b0));
            if (!r0.isNull("cursor")) cur = r0.optString("cursor", "");
          } catch (Missing m) { legacy = true; }
        }
        if (cur.isEmpty()) cur = iso(serverMs > 0 ? serverMs : System.currentTimeMillis());
        p.edit().putString("cursor", cur).apply();
        status("ok");
        return;
      }
      JSONArray out = new JSONArray();
      String next = cur;
      if (!legacy) {
        try {
          JSONObject b = new JSONObject(); b.put("p_token", token); b.put("p_since", cur);
          JSONObject r = new JSONObject(call("notif_pull", b));
          if (!r.isNull("cursor")) next = r.optString("cursor", cur);
          JSONArray it = r.optJSONArray("items");
          if (it != null) out = it;
        } catch (Missing m) { legacy = true; }
      }
      if (legacy) {
        JSONObject b = new JSONObject(); b.put("p_token", token); b.put("p_since", cur);
        JSONObject r = new JSONObject(call("sync_pull", b));
        if (!r.isNull("cursor")) next = r.optString("cursor", cur);
        JSONArray it = r.optJSONArray("items");
        String me = p.getString("name", "");
        for (int i = 0; it != null && i < it.length(); i++) {
          JSONObject o = it.optJSONObject(i);
          if (o == null || !"log".equals(o.optString("kind"))) continue;
          JSONObject d = o.optJSONObject("data");
          if (d != null && !me.equals(d.optString("by", ""))) out.put(d);
        }
      }
      if (out.length() > 0) { ev(this, "سحب " + out.length() + " حركة جديدة من الآخرين"); show(out); }
      if (!next.isEmpty()) p.edit().putString("cursor", next).apply();
      status("ok");
    } catch (SecurityException e) {
      // انتهت الجلسة: نتوقف ولا نعيد المحاولة
      prefs().edit().clear().apply();
      h.post(this::stopSelf);
    } catch (Exception e) {
      status("err:" + String.valueOf(e.getMessage()));
      ev(this, "خطأ في السحب: " + String.valueOf(e.getMessage()));
    }
  }

  private static class Missing extends Exception { Missing() { super("missing"); } }

  private void show(JSONArray items) {
    if (appVisible) { ev(this, "وصلت " + items.length() + " حركة لكن التطبيق ظاهر فلم يُعرض إشعار هاتف"); return; } // والتطبيق مفتوح يعرض إشعاره الداخلي
    long now = System.currentTimeMillis();
    List<JSONObject> fresh = new ArrayList<>();
    for (int i = 0; i < items.length(); i++) {
      JSONObject d = items.optJSONObject(i);
      if (d == null) continue;
      long at = d.optLong("at", now);
      if (now - at < 10 * 60 * 1000L) fresh.add(d); // نتجاهل القديم جدًا (بعد انقطاع طويل)
    }
    if (fresh.isEmpty()) { ev(this, "وصلت " + items.length() + " حركة قديمة جدًا (أكثر من 10 دقائق) فتُجوهلت"); return; }
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
    String r = notifyStatic(this, id, title, text, route, when);
    ev(this, r == null ? "عُرض إشعار: " + clip(text) : "فشل العرض: " + r);
  }

  private static String clip(String t) { return t == null ? "" : (t.length() > 28 ? t.substring(0, 28) + "…" : t); }

  // يبني الإشعار ويعرضه. يرجع null عند النجاح أو سبب الفشل
  static String notifyStatic(Context c, int id, String title, String text, String route, long when) {
    try {
      ensureChannels(c);
      if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return "الإشعارات معطّلة للتطبيق";
      Intent i = new Intent(c, MainActivity.class);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      i.putExtra("route", route);
      int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
      PendingIntent pi = PendingIntent.getActivity(c, id, i, fl);
      Notification n = new NotificationCompat.Builder(c, CH_ALERT)
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
      NotificationManagerCompat.from(c).notify(id, n);
      return null;
    } catch (Exception e) { return String.valueOf(e.getMessage()); }
  }

  // أهمية قناة التنبيهات الحالية (0 = محجوبة، 4 = تظهر فوق الشاشة بصوت)، أو -1 قبل أندرويد 8
  static int channelImportance(Context c) {
    if (Build.VERSION.SDK_INT < 26) return -1;
    try {
      NotificationChannel ch = ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).getNotificationChannel(CH_ALERT);
      return ch == null ? -2 : ch.getImportance();
    } catch (Exception e) { return -3; }
  }

  // سجل أحداث مختصر يظهر في الإعدادات للتشخيص (آخر 12 سطرًا)
  static synchronized void ev(Context c, String line) {
    try {
      SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      String t = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
      String[] old = p.getString("events", "").split("\n");
      StringBuilder b = new StringBuilder(t + " " + line);
      for (int k = 0; k < old.length && k < 11; k++) if (!old[k].isEmpty()) b.append('\n').append(old[k]);
      p.edit().putString("events", b.toString()).apply();
    } catch (Exception e) { /* لا شيء */ }
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

  private void makeChannels() { ensureChannels(this); }

  static void ensureChannels(Context c) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
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
