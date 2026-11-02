// bellhive99.com - audiobooks edge function (AUDIOBOOKS > Library)
//
// Looks up one audiobook's details by its Audible ASIN so the Library page can add a new
// purchase without an OpenAudible export. Details come from Audnexus (api.audnex.us), the
// open audiobook-metadata service Audiobookshelf and Plex use; it reads Audible's catalog.
// Nothing is written here: the page saves the book through the caller's own session, so
// row level security decides as usual.
//
//   lookup { asin, region? }  -> { book: { asin, title, subtitle, authors, narrators, series_name,
//                                  series_seq, genre, publisher, release_date, duration_seconds,
//                                  rating, language, abridged, cover_url, summary, file_guess } }
//
// Deploy with "Verify JWT" OFF - the function checks the caller itself (signed-in, active member).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const REGIONS = ['us', 'ca', 'uk', 'au', 'fr', 'de', 'jp', 'it', 'in', 'es'];

/* Audnexus summaries are HTML: keep the paragraphs, drop the tags. */
function htmlToText(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, ' • ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  let secret = '';
  try { secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || ''; } catch { /* fall back */ }
  if (!secret) secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) return json({ error: 'Server keys are not configured.' }, 500);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- who is calling? ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in.' }, 401);
  const { data: who, error: whoErr } = await db.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: 'Not signed in.' }, 401);
  const { data: me } = await db.from('profiles').select('active').eq('id', who.user.id).single();
  if (!me || !me.active) return json({ error: 'Account not active.' }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');

  try {
    if (action === 'lookup') {
      const asin = String(body.asin || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) return json({ error: 'That does not look like an Audible ASIN (10 letters/numbers, e.g. B0FXY6DVJS).' }, 400);
      const region = REGIONS.includes(String(body.region || 'us')) ? String(body.region || 'us') : 'us';
      const r = await fetch('https://api.audnex.us/books/' + asin + '?region=' + region, { headers: { 'User-Agent': 'bellhive99.com audiobooks' } });
      if (r.status === 404 || r.status === 400) return json({ error: 'Audible has no book with ASIN ' + asin + ' (' + region.toUpperCase() + ' store).' }, 404);
      if (!r.ok) return json({ error: 'The book lookup service answered ' + r.status + '. Try again in a minute.' }, 502);
      const a: any = await r.json();
      const names = (list: any[]) => (Array.isArray(list) ? list.map((x) => x && x.name).filter(Boolean).join(', ') : '');
      const genres = Array.isArray(a.genres) ? a.genres : [];
      const g1 = genres.find((x: any) => x.type === 'genre');
      const t1 = genres.find((x: any) => x.type === 'tag' && x.name !== (g1 && g1.name) && x.name !== 'Genre Fiction');
      const title = String(a.title || '').trim();
      const subtitle = String(a.subtitle || '').trim();
      const full = subtitle ? title + ' - ' + subtitle : title;
      return json({ book: {
        asin,
        title: full,
        subtitle,
        authors: names(a.authors),
        narrators: names(a.narrators),
        series_name: a.seriesPrimary?.name || null,
        series_seq: a.seriesPrimary?.position ? String(a.seriesPrimary.position) : null,
        genre: g1 ? g1.name + (t1 ? ':' + t1.name : '') : null,
        publisher: a.publisherName || null,
        release_date: a.releaseDate ? String(a.releaseDate).slice(0, 10) : null,
        duration_seconds: a.runtimeLengthMin ? Number(a.runtimeLengthMin) * 60 : null,
        rating: a.rating ? Number(a.rating) : null,
        language: a.language || null,
        abridged: a.formatType ? a.formatType === 'abridged' : null,
        cover_url: a.image || null,
        summary: htmlToText(a.summary || a.description || '') || null,
        // OpenAudible names files "<Title> - <Subtitle>.m4b" with ':' turned into '-'
        file_guess: full.replace(/:/g, '-').replace(/[\\/*?"<>|]/g, '').trim() + '.m4b',
      } });
    }
    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Something went wrong.' }, 500);
  }
});
