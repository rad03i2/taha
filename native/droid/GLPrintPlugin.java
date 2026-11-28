package com.taha.generator;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/** طباعة على طابعات الإيصالات الحرارية عبر بلوتوث (SPP/RFCOMM) بأوامر ESC/POS تُبنى في الواجهة. */
@SuppressLint("MissingPermission")
@CapacitorPlugin(
  name = "GLPrint",
  permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth") }
)
public class GLPrintPlugin extends Plugin {
  private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

  private boolean granted() {
    return Build.VERSION.SDK_INT < 31 || getPermissionState("bluetooth") == PermissionState.GRANTED;
  }

  @PluginMethod
  public void state(PluginCall call) {
    BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
    JSObject r = new JSObject();
    r.put("adapter", a != null);
    r.put("enabled", a != null && a.isEnabled());
    r.put("granted", granted());
    call.resolve(r);
  }

  @PluginMethod
  public void requestPerm(PluginCall call) {
    if (granted()) { state(call); return; }
    requestPermissionForAlias("bluetooth", call, "permResult");
  }

  @PermissionCallback
  private void permResult(PluginCall call) {
    state(call);
  }

  // الأجهزة المقرونة (يُقرن الجهاز أولًا من إعدادات بلوتوث الهاتف)
  @PluginMethod
  public void devices(PluginCall call) {
    if (!granted()) { call.reject("need_permission"); return; }
    BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
    if (a == null) { call.reject("no bluetooth"); return; }
    JSArray arr = new JSArray();
    try {
      Set<BluetoothDevice> set = a.getBondedDevices();
      for (BluetoothDevice d : set) {
        JSObject o = new JSObject();
        o.put("name", d.getName() == null ? "" : d.getName());
        o.put("address", d.getAddress());
        boolean imaging = false;
        try { BluetoothClass c = d.getBluetoothClass(); imaging = c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING; } catch (Exception e) { /* لا شيء */ }
        o.put("printer", imaging);
        arr.put(o);
      }
    } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); return; }
    JSObject r = new JSObject();
    r.put("devices", arr);
    call.resolve(r);
  }

  @PluginMethod
  public void openSettings(PluginCall call) {
    try {
      Intent i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
    } catch (Exception e) { /* لا شيء */ }
    call.resolve();
  }

  // data: ملف ESC/POS كاملًا مرمّزًا base64
  @PluginMethod
  public void print(final PluginCall call) {
    final String address = call.getString("address", "");
    final String data = call.getString("data", "");
    if (address.isEmpty() || data.isEmpty()) { call.reject("bad args"); return; }
    if (!granted()) { call.reject("need_permission"); return; }
    new Thread(new Runnable() {
      @Override public void run() {
        BluetoothSocket s = null;
        try {
          BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
          if (a == null || !a.isEnabled()) { call.reject("bluetooth off"); return; }
          // لا نستدعي cancelDiscovery(): تحتاج إذن BLUETOOTH_SCAN ولا بحث جارٍ أصلًا (نتصل بجهاز مقرون)
          BluetoothDevice d = a.getRemoteDevice(address);
          s = d.createRfcommSocketToServiceRecord(SPP);
          try {
            s.connect();
          } catch (Exception e1) {
            // بعض الطابعات تحتاج المنفذ 1 مباشرة
            try { s.close(); } catch (Exception e2) { /* لا شيء */ }
            s = (BluetoothSocket) d.getClass().getMethod("createRfcommSocket", int.class).invoke(d, 1);
            s.connect();
          }
          OutputStream os = s.getOutputStream();
          byte[] b = Base64.decode(data, Base64.DEFAULT);
          int off = 0;
          while (off < b.length) {
            int n = Math.min(512, b.length - off);
            os.write(b, off, n);
            os.flush();
            off += n;
            Thread.sleep(14); // الطابعات الصغيرة ذاكرتها قصيرة: نرسل على دفعات
          }
          Thread.sleep(900); // نمهلها لتُنهي الاستقبال قبل إغلاق الاتصال
          JSObject r = new JSObject();
          r.put("bytes", b.length);
          call.resolve(r);
        } catch (Exception e) {
          call.reject(String.valueOf(e.getMessage()));
        } finally {
          try { if (s != null) s.close(); } catch (Exception e) { /* لا شيء */ }
        }
      }
    }).start();
  }
}
