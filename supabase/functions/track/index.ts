// bellhive99.com - track edge function (visitor log for ADMIN > Visitors)
//
// Called by auth/track.js on each page view: POST { page, referrer }.
// Works for signed-out visitors (login page) and signed-in users (Authorization: Bearer <session>).
// Stores only an approximate location (city/region/country) and a salted hash of the IP -
// never the IP itself. Deploy with "Verify JWT" OFF (anonymous visitors must be counted).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const done = (status = 204) => new Response(null, { status, headers: cors });

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|phantom|python|curl|wget|httpclient|okhttp|go-http|java\/|monitor|uptime|lighthouse|scan/i;
const PAGES = /^[a-z0-9_-]{1,32}$/;

// in-memory: skip repeat hits from the same visitor+page within 10 minutes; cache lookups
const recent = new Map<string, number>();
const geoCache = new Map<string, { at: number; geo: Geo | null }>();
type Geo = { city?: string; region?: string; country?: string; country_code?: string; lat?: number; lon?: number; isp?: string };

async function sha256(text: string) {
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function lookup(ip: string): Promise<Geo | null> {
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.geo;
  let geo: Geo | null = null;
  const timeout = () => AbortSignal.timeout(3500);
  try {
    const r = await fetch('https://ipwho.is/' + encodeURIComponent(ip) + '?fields=success,city,region,country,country_code,latitude,longitude,connection', { signal: timeout() });
    const j = await r.json();
    if (j && j.success) geo = { city: j.city, region: j.region, country: j.country, country_code: j.country_code, lat: j.latitude, lon: j.longitude, isp: j.connection?.isp || j.connection?.org };
  } catch { /* try the backup */ }
  if (!geo) {
    try {
      const r = await fetch('https://ipapi.co/' + encodeURIComponent(ip) + '/json/', { signal: timeout(), headers: { 'User-Agent': 'bellhive99-visitors' } });
      const j = await r.json();
      if (j && !j.error && j.country_name) geo = { city: j.city, region: j.region, country: j.country_name, country_code: j.country_code, lat: j.latitude, lon: j.longitude, isp: j.org };
    } catch { /* give up - visit is still counted */ }
  }
  geoCache.set(ip, { at: Date.now(), geo });
  if (geoCache.size > 2000) geoCache.clear();
  return geo;
}
function device(ua: string) {
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'Tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'Phone';
  return 'Desktop';
}
function browser(ua: string) {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return done(405);
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty */ }
    const page = String(body.page || '').toLowerCase();
    if (!PAGES.test(page)) return done(400);

    let secret = '';
    try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
    if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false, autoRefreshToken: false } });

    // signed in? (optional - anonymous visits are fine)
    let userId: string | null = null;
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (token && token.split('.').length === 3) {
      const { data } = await db.auth.getUser(token);
      if (data?.user) userId = data.user.id;
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
    const ua = req.headers.get('user-agent') || '';

    // salt for hashing IPs, created once and kept server-side
    const { data: saltRow } = await db.from('integration_secrets').select('data').eq('name', 'visits_salt').maybeSingle();
    let salt = (saltRow?.data as any)?.salt as string | undefined;
    if (!salt) {
      salt = crypto.randomUUID() + crypto.randomUUID();
      await db.from('integration_secrets').upsert({ name: 'visits_salt', data: { salt } });
    }
    const visitorHash = ip ? (await sha256(salt + '|' + ip)).slice(0, 32) : null;

    const dedupeKey = (visitorHash || 'x') + '|' + page + '|' + (userId || '');
    const last = recent.get(dedupeKey);
    if (last && Date.now() - last < 10 * 60e3) return done();
    recent.set(dedupeKey, Date.now());
    if (recent.size > 5000) recent.clear();

    const geo = ip ? await lookup(ip) : null;
    let referrer: string | null = null;
    try { const ref = String(body.referrer || ''); if (ref) referrer = new URL(ref).hostname.replace(/^www\./, '').slice(0, 100); } catch { /* ignore */ }

    await db.from('site_visits').insert({
      page, signed_in: !!userId, user_id: userId, visitor_hash: visitorHash,
      city: geo?.city || null, region: geo?.region || null, country: geo?.country || null, country_code: geo?.country_code || null,
      lat: typeof geo?.lat === 'number' ? geo.lat : null, lon: typeof geo?.lon === 'number' ? geo.lon : null,
      isp: geo?.isp ? String(geo.isp).slice(0, 100) : null, referrer,
      device: device(ua), browser: browser(ua), is_bot: BOT.test(ua) || !ua,
    });
    return done();
  } catch (e) {
    console.error('track failed', (e as Error).message);
    return done(204);   // never bother the visitor
  }
});
