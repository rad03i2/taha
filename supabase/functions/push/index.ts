// دالة Supabase Edge: ترسل إشعارًا إلى هواتف بقية أعضاء المساحة عبر Firebase Cloud Messaging (HTTP v1).
// الاستدعاء: POST { p_token, title, body, data }  — p_token هو رمز جلسة المرسِل (يُتحقق منه عبر دالة me).
// الأسرار المطلوبة (Edge Function Secrets):  FCM_SERVICE_ACCOUNT  = محتوى ملف JSON لحساب الخدمة في Firebase كاملًا.
// يجب تعطيل «Verify JWT» لهذه الدالة (المفاتيح الجديدة ليست JWT)، فالتحقق يتم برمز الجلسة.

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const b64u = (b: ArrayBuffer | string) => {
  const s = typeof b === 'string' ? btoa(unescape(encodeURIComponent(b))) : btoa(String.fromCharCode(...new Uint8Array(b)));
  return s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
};

let cached: { t: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.t;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = String(SA.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64u(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('oauth: ' + JSON.stringify(j).slice(0, 200));
  cached = { t: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.t;
}

const rest = (path: string, init: RequestInit = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: SRK, authorization: `Bearer ${SRK}`, 'content-type': 'application/json', ...(init.headers || {}) } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b: { p_token?: string; title?: string; body?: string; data?: Record<string, unknown> };
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!b.p_token) return json({ error: 'forbidden' }, 401);

  // تحقق من الجلسة عبر دالة me (تُرجع المستخدم أو خطأ forbidden)
  const me = await rest('rpc/me', { method: 'POST', body: JSON.stringify({ p_token: b.p_token }) });
  if (!me.ok) return json({ error: 'forbidden' }, 401);
  const u = await me.json();

  const tk = await rest(`push_tokens?ws=eq.${encodeURIComponent(u.ws)}&user_id=neq.${u.id}&select=token`);
  const tokens: string[] = (await tk.json()).map((x: { token: string }) => x.token);
  if (!tokens.length) return json({ sent: 0 });

  const at = await accessToken();
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data ?? {})) data[k] = String(v).slice(0, 200);
  let sent = 0; const dead: string[] = [];
  await Promise.all(tokens.map(async (token) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        notification: { title: String(b.title ?? '').slice(0, 80), body: String(b.body ?? '').slice(0, 240) },
        data,
        android: { priority: 'HIGH', ttl: '3600s', notification: { channel_id: 'gl-alerts', sound: 'default', default_vibrate_timings: true, notification_priority: 'PRIORITY_MAX', visibility: 'PUBLIC' } },
      } }),
    });
    if (r.ok) sent++;
    else if (r.status === 404 || r.status === 400) { const t = await r.text(); if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(t)) dead.push(token); }
  }));
  if (dead.length) await rest(`push_tokens?token=in.(${dead.map((t) => `"${t}"`).join(',')})`, { method: 'DELETE' });
  return json({ sent, removed: dead.length });
});
