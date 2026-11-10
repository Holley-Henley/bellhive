// bellhive99.com - music edge function: read the tags inside an audio file.
//
// Works through a Reader that fetches byte ranges on demand, so only the parts of a file
// that hold the tags are downloaded (usually the first 64 KB), never the whole song.
//   MP3 / MP2      ID3v2.2-2.4 (+ ID3v1 at the end), length from the Xing/Info/VBRI header or bitrate
//   FLAC           STREAMINFO + Vorbis comments + PICTURE (also FLAC with an ID3 tag in front)
//   OGG / Opus     Vorbis comments, length from the last page
//   M4A / MP4 / ALAC   iTunes 'ilst' atoms, length from mvhd
//   WAV            LIST/INFO and an embedded 'id3 ' chunk;  AIFF: COMM + 'ID3 ' chunk
//   DSF            its ID3v2 block;  APE / WavPack / Musepack: APEv2 tags
// Anything else (WMA, ...) gets nothing here and falls back to the file name.

export type Picture = { mime: string; data: Uint8Array };
export type Tags = {
  title?: string; artist?: string; album_artist?: string; album?: string; composer?: string; genre?: string;
  track_no?: number; track_total?: number; disc_no?: number; disc_total?: number; year?: number;
  duration_seconds?: number; bitrate?: number; sample_rate?: number; bits?: number; channels?: number;
  has_art?: boolean; picture?: Picture; error?: string;
};
export type Reader = { size: number; get(off: number, len: number): Promise<Uint8Array> };

/* ---------- byte helpers ---------- */
const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const be24 = (b: Uint8Array, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const be32 = (b: Uint8Array, o: number) => b[o] * 16777216 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const le16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const le32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
const ss32 = (b: Uint8Array, o: number) => (b[o] & 127) * 2097152 + (b[o + 1] & 127) * 16384 + (b[o + 2] & 127) * 128 + (b[o + 3] & 127);
const latin1 = (b: Uint8Array) => new TextDecoder('windows-1252').decode(b);
const utf8 = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);
const clean = (s: string) => s.replace(/[\u0000\ufeff\ufffe]/g, '').replace(/\s+/g, ' ').trim();
function find(hay: Uint8Array, needle: string, from = 0) {
  const n = Array.from(needle, (c) => c.charCodeAt(0));
  outer: for (let i = from; i <= hay.length - n.length; i++) {
    for (let k = 0; k < n.length; k++) if (hay[i + k] !== n[k]) continue outer;
    return i;
  }
  return -1;
}
function unsync(b: Uint8Array) {
  const out = new Uint8Array(b.length);
  let w = 0;
  for (let i = 0; i < b.length; i++) { out[w++] = b[i]; if (b[i] === 0xff && b[i + 1] === 0x00) i++; }
  return out.subarray(0, w);
}
const sub = (r: Reader, base: number, len: number): Reader => ({ size: len, get: (o, n) => r.get(base + o, Math.min(n, len - o)) });
function sniff(data: Uint8Array, mime: string) {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
  return /^image\//.test(mime) ? mime : 'image/jpeg';
}

/* ---------- setting values ---------- */
const GENRES = ['Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies',
  'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack',
  'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game',
  'Sound Clip', 'Gospel', 'Noise', 'Alternative Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop',
  'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream',
  'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret',
  'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical',
  'Rock & Roll', 'Hard Rock'];
function genreName(s: string) {
  s = clean(s);
  const m = s.match(/^\((\d+)\)\s*(.*)$/);
  if (m) return m[2] || GENRES[+m[1]] || '';
  if (/^\d+$/.test(s)) return GENRES[+s] || '';
  if (s === '(RX)' || s === 'RX') return 'Remix';
  if (s === '(CR)' || s === 'CR') return 'Cover';
  return s;
}
function pair(s: string): [number | undefined, number | undefined] {
  const m = String(s).match(/^\s*(\d+)\s*(?:\/\s*(\d+))?/);
  if (!m) return [undefined, undefined];
  return [+m[1] || undefined, m[2] ? +m[2] || undefined : undefined];
}
function setText(t: Tags, k: 'title' | 'artist' | 'album_artist' | 'album' | 'composer' | 'genre', vals: string[], force = false) {
  const v = vals.map(clean).filter(Boolean);
  if (!v.length || (t[k] && !force)) return;
  t[k] = k === 'genre' ? Array.from(new Set(v.map(genreName).filter(Boolean))).join('; ') : Array.from(new Set(v)).join('; ');
}
function setYear(t: Tags, s: string, force = false) {
  const m = String(s).match(/(1[89]\d\d|20\d\d)/);
  if (m && (force || !t.year)) t.year = +m[1];
}
/* Vorbis / APE style KEY=value pairs (keys upper case) */
function applyKV(t: Tags, key: string, vals: string[]) {
  const k = key.replace(/[\s_]/g, '');
  if (k === 'TITLE') setText(t, 'title', vals);
  else if (k === 'ARTIST') setText(t, 'artist', vals);
  else if (k === 'ALBUMARTIST') setText(t, 'album_artist', vals);
  else if (k === 'ALBUM') setText(t, 'album', vals);
  else if (k === 'GENRE') setText(t, 'genre', vals);
  else if (k === 'COMPOSER') setText(t, 'composer', vals);
  else if (k === 'TRACKNUMBER' || k === 'TRACK') { const [n, tot] = pair(vals[0]); if (n && !t.track_no) t.track_no = n; if (tot && !t.track_total) t.track_total = tot; }
  else if (k === 'TRACKTOTAL' || k === 'TOTALTRACKS') { const [n] = pair(vals[0]); if (n) t.track_total = n; }
  else if (k === 'DISCNUMBER' || k === 'DISC') { const [n, tot] = pair(vals[0]); if (n && !t.disc_no) t.disc_no = n; if (tot && !t.disc_total) t.disc_total = tot; }
  else if (k === 'DISCTOTAL' || k === 'TOTALDISCS') { const [n] = pair(vals[0]); if (n) t.disc_total = n; }
  else if (k === 'DATE' || k === 'YEAR') setYear(t, vals[0], true);
  else if (k === 'ORIGINALDATE' || k === 'ORIGINALYEAR') setYear(t, vals[0]);
}

/* ---------- ID3v2 ---------- */
function id3Strings(d: Uint8Array): string[] {
  if (!d.length) return [];
  const enc = d[0], b = d.subarray(1);
  let s: string;
  if (enc === 0) s = latin1(b);
  else if (enc === 3) s = utf8(b);
  else {
    let be = enc === 2;
    if (b[0] === 0xfe && b[1] === 0xff) be = true; else if (b[0] === 0xff && b[1] === 0xfe) be = false;
    s = new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(b.subarray(0, b.length - (b.length % 2)));
  }
  return s.split('\u0000').map(clean).filter(Boolean);
}
function id3Frame(id: string, d: Uint8Array, t: Tags) {
  const v = id3Strings(d);
  if (!v.length) return;
  switch (id) {
    case 'TIT2': case 'TT2': setText(t, 'title', v); break;
    case 'TPE1': case 'TP1': setText(t, 'artist', v); break;
    case 'TPE2': case 'TP2': setText(t, 'album_artist', v); break;
    case 'TALB': case 'TAL': setText(t, 'album', v); break;
    case 'TCON': case 'TCO': setText(t, 'genre', v); break;
    case 'TCOM': case 'TCM': setText(t, 'composer', v); break;
    case 'TRCK': case 'TRK': { const [n, tot] = pair(v[0]); if (n) t.track_no = n; if (tot) t.track_total = tot; break; }
    case 'TPOS': case 'TPA': { const [n, tot] = pair(v[0]); if (n) t.disc_no = n; if (tot) t.disc_total = tot; break; }
    case 'TDRC': case 'TYER': case 'TYE': setYear(t, v[0], true); break;
    case 'TDOR': case 'TORY': case 'TOR': setYear(t, v[0]); break;
    case 'TLEN': case 'TLE': { const ms = parseInt(v[0]); if (ms > 0 && !t.duration_seconds) t.duration_seconds = ms / 1000; break; }
    case 'TXXX': case 'TXX': { const desc = (v[0] || '').toUpperCase().replace(/[\s_]/g, ''); if (desc === 'ALBUMARTIST') setText(t, 'album_artist', v.slice(1)); break; }
  }
}
function id3Pic(d: Uint8Array, v: number): Picture | undefined {
  const enc = d[0];
  let i = 1, mime = '';
  if (v === 2) { mime = 'image/' + latin1(d.subarray(1, 4)).toLowerCase().replace('jpg', 'jpeg'); i = 4; }
  else { const z = d.indexOf(0, 1); if (z < 0) return; mime = latin1(d.subarray(1, z)).toLowerCase(); i = z + 1; }
  i += 1; // picture type
  if (enc === 1 || enc === 2) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; i += 2; }
  else { while (i < d.length && d[i] !== 0) i++; i++; }
  if (i >= d.length) return;
  const data = d.slice(i);
  return { mime: sniff(data, mime.includes('/') ? mime : 'image/' + mime), data };
}
/* returns where the tag ends (= where the audio starts), 0 if there is none */
async function id3v2(r: Reader, t: Tags, want: boolean, base = 0): Promise<number> {
  const h = await r.get(base, 10);
  if (h.length < 10 || h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return base;
  const v = h[3], flags = h[5], size = ss32(h, 6);
  const end = base + 10 + size + (flags & 0x10 ? 10 : 0);
  if (v < 2 || v > 4) return end;
  let whole: Uint8Array | null = null;                       // whole-tag unsynchronisation (v2.2 / v2.3)
  if ((flags & 0x80) && v < 4) whole = unsync(await r.get(base + 10, Math.min(size, 16 << 20)));
  const at = async (o: number, n: number) => (whole ? whole.subarray(o, o + n) : await r.get(base + 10 + o, n));
  const limit = whole ? whole.length : size;
  let p = 0;
  if ((flags & 0x40) && v >= 3) { const e = await at(0, 4); p = v === 4 ? ss32(e, 0) : be32(e, 0) + 4; }
  const hl = v === 2 ? 6 : 10;
  for (let guard = 0; guard < 400 && p + hl <= limit; guard++) {
    const fh = await at(p, hl);
    if (fh.length < hl || fh[0] === 0) break;
    const id = latin1(fh.subarray(0, v === 2 ? 3 : 4));
    const fs = v === 2 ? be24(fh, 3) : v === 4 ? ss32(fh, 4) : be32(fh, 4);
    if (!/^[A-Z0-9]{3,4}$/.test(id) || fs <= 0 || p + hl + fs > limit + 16) break;
    const fl = v === 2 ? 0 : fh[9];
    const pic = id === 'APIC' || id === 'PIC';
    if (pic) t.has_art = true;
    const skip = (v === 3 && (fl & 0xc0)) || (v === 4 && (fl & 0x0c));   // compressed / encrypted
    if (!skip && ((id[0] === 'T' && fs < (1 << 20)) || (pic && want && !t.picture))) {
      let d = await at(p + hl, fs);
      if (v === 4 && (fl & 0x02)) d = unsync(d);
      if (v === 4 && (fl & 0x01)) d = d.subarray(4);
      if (pic) t.picture = id3Pic(d, v); else id3Frame(id, d, t);
    }
    p += hl + fs;
  }
  return end;
}
async function id3v1(r: Reader, t: Tags) {
  if (r.size < 128) return;
  const b = await r.get(r.size - 128, 128);
  if (latin1(b.subarray(0, 3)) !== 'TAG') return;
  const s = (a: number, z: number) => clean(latin1(b.subarray(a, z)).split('\u0000')[0]);
  setText(t, 'title', [s(3, 33)]); setText(t, 'artist', [s(33, 63)]); setText(t, 'album', [s(63, 93)]); setYear(t, s(93, 97));
  if (b[125] === 0 && b[126] && !t.track_no) t.track_no = b[126];
  if (!t.genre && GENRES[b[127]]) t.genre = GENRES[b[127]];
}

/* ---------- MPEG audio length ---------- */
const BR1 = [[0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]];
const BR2 = [[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]];
async function mpegInfo(r: Reader, start: number, t: Tags) {
  const b = await r.get(start, 16384);
  for (let i = 0; i + 4 < b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const ver = (b[i + 1] >> 3) & 3, layerBits = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, mode = b[i + 3] >> 6;
    if (ver === 1 || layerBits === 0 || bri === 0 || bri === 15 || sri === 3) continue;
    const mpeg1 = ver === 3, layer = 4 - layerBits;
    const sr = [44100, 48000, 32000][sri] / (mpeg1 ? 1 : ver === 2 ? 2 : 4);
    const br = (mpeg1 ? BR1 : BR2)[layer - 1][bri];
    const spf = layer === 1 ? 384 : layer === 3 && !mpeg1 ? 576 : 1152;
    t.sample_rate = sr; t.channels = mode === 3 ? 1 : 2;
    let frames = 0, bytes = 0;
    const x = i + 4 + (mpeg1 ? (mode === 3 ? 17 : 32) : (mode === 3 ? 9 : 17));
    const tag = latin1(b.subarray(x, x + 4));
    if ((tag === 'Xing' || tag === 'Info') && x + 16 <= b.length) {
      const fl = be32(b, x + 4); let o = x + 8;
      if (fl & 1) { frames = be32(b, o); o += 4; }
      if (fl & 2) bytes = be32(b, o);
    } else if (latin1(b.subarray(i + 36, i + 40)) === 'VBRI' && i + 54 <= b.length) {
      bytes = be32(b, i + 46); frames = be32(b, i + 50);
    }
    const audio = r.size - start - i;
    if (frames) {
      t.duration_seconds = (frames * spf) / sr;
      t.bitrate = Math.round(((bytes || audio) * 8) / t.duration_seconds / 1000);
    } else {
      t.duration_seconds = (audio * 8) / (br * 1000);
      t.bitrate = br;
    }
    return;
  }
}

/* ---------- Vorbis comments / FLAC ---------- */
function flacPic(b: Uint8Array): Picture | undefined {
  let o = 4;
  const ml = be32(b, o); o += 4; const mime = latin1(b.subarray(o, o + ml)); o += ml;
  const dl = be32(b, o); o += 4 + dl + 16;
  const len = be32(b, o); o += 4;
  if (o + len > b.length) return;
  const data = b.slice(o, o + len);
  return { mime: sniff(data, mime), data };
}
function vorbis(b: Uint8Array, t: Tags, want: boolean) {
  let o = 0;
  const vl = le32(b, o); o += 4 + vl;
  const n = le32(b, o); o += 4;
  const all: Record<string, string[]> = {};
  for (let k = 0; k < n && k < 2000 && o + 4 <= b.length; k++) {
    const l = le32(b, o); o += 4;
    if (o + l > b.length) break;
    const s = utf8(b.subarray(o, o + l)); o += l;
    const e = s.indexOf('=');
    if (e < 1) continue;
    (all[s.slice(0, e).toUpperCase()] ||= []).push(s.slice(e + 1));
  }
  for (const k of Object.keys(all)) {
    if (k === 'METADATA_BLOCK_PICTURE') {
      t.has_art = true;
      if (want && !t.picture) { try { t.picture = flacPic(Uint8Array.from(atob(all[k][0]), (c) => c.charCodeAt(0))); } catch { /* bad base64 */ } }
    } else applyKV(t, k, all[k]);
  }
}
async function flac(r: Reader, start: number, t: Tags, want: boolean) {
  let o = start + 4;
  for (let k = 0; k < 128; k++) {
    const h = await r.get(o, 4);
    if (h.length < 4) break;
    const last = h[0] & 0x80, type = h[0] & 0x7f, len = be24(h, 1);
    if (type === 0) {
      const b = await r.get(o + 4, 34);
      const sr = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
      const total = (b[13] & 0x0f) * 4294967296 + be32(b, 14);
      t.sample_rate = sr; t.channels = ((b[12] >> 1) & 7) + 1; t.bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
      if (sr && total) t.duration_seconds = total / sr;
    } else if (type === 4) vorbis(await r.get(o + 4, Math.min(len, 4 << 20)), t, want);
    else if (type === 6) { t.has_art = true; if (want && !t.picture) t.picture = flacPic(await r.get(o + 4, len)); }
    o += 4 + len;
    if (last) break;
  }
}

/* ---------- OGG (Vorbis, Opus, FLAC-in-Ogg) ---------- */
async function ogg(r: Reader, t: Tags, want: boolean) {
  const b = await r.get(0, 262144);
  const parts: Uint8Array[] = [];
  let o = 0;
  for (let pages = 0; pages < 24 && o + 27 <= b.length && latin1(b.subarray(o, o + 4)) === 'OggS'; pages++) {
    const nseg = b[o + 26];
    let plen = 0;
    for (let s = 0; s < nseg; s++) plen += b[o + 27 + s];
    parts.push(b.subarray(o + 27 + nseg, o + 27 + nseg + plen));
    o += 27 + nseg + plen;
  }
  const cat = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let w = 0; for (const p of parts) { cat.set(p, w); w += p.length; }
  let rate = 0, preskip = 0;
  const vi = find(cat, '\x01vorbis'), oi = find(cat, 'OpusHead');
  if (vi >= 0) { t.channels = cat[vi + 11]; rate = le32(cat, vi + 12); t.sample_rate = rate; }
  else if (oi >= 0) { t.channels = cat[oi + 9]; preskip = le16(cat, oi + 10); rate = 48000; t.sample_rate = le32(cat, oi + 12) || 48000; }
  const vc = find(cat, '\x03vorbis'), oc = find(cat, 'OpusTags');
  if (vc >= 0) vorbis(cat.subarray(vc + 7), t, want);
  else if (oc >= 0) vorbis(cat.subarray(oc + 8), t, want);
  if (rate) {
    const n = Math.min(r.size, 65536);
    const tail = await r.get(r.size - n, n);
    for (let i = tail.length - 27; i >= 0; i--) {
      if (tail[i] === 0x4f && tail[i + 1] === 0x67 && tail[i + 2] === 0x67 && tail[i + 3] === 0x53) {
        const g = le32(tail, i + 6) + le32(tail, i + 10) * 4294967296;
        if (g > 0) t.duration_seconds = (g - preskip) / rate;
        break;
      }
    }
  }
}

/* ---------- MP4 / M4A ---------- */
function boxes(b: Uint8Array, cb: (type: string, body: Uint8Array) => void) {
  let o = 0;
  while (o + 8 <= b.length) {
    let sz = be32(b, o), hl = 8;
    const ty = latin1(b.subarray(o + 4, o + 8));
    if (sz === 1) { sz = be32(b, o + 8) * 4294967296 + be32(b, o + 12); hl = 16; } else if (sz === 0) sz = b.length - o;
    if (sz < hl || o + sz > b.length) break;
    cb(ty, b.subarray(o + hl, o + sz));
    o += sz;
  }
}
async function mp4(r: Reader, t: Tags, want: boolean) {
  let o = 0, moov: Uint8Array | null = null;
  for (let k = 0; k < 64 && o + 8 <= r.size; k++) {
    const h = await r.get(o, 16);
    let sz = be32(h, 0), hl = 8;
    const ty = latin1(h.subarray(4, 8));
    if (sz === 1) { sz = be32(h, 8) * 4294967296 + be32(h, 12); hl = 16; } else if (sz === 0) sz = r.size - o;
    if (sz < hl) break;
    if (ty === 'moov') { if (sz <= (48 << 20)) moov = await r.get(o + hl, sz - hl); break; }
    o += sz;
  }
  if (!moov) return;
  const item = (ty: string, x: Uint8Array) => {
    boxes(x, (dt, dd) => {
      if (dt !== 'data' || dd.length < 8) return;
      const kind = be32(dd, 0) & 0xffffff, val = dd.subarray(8);
      const text = () => [utf8(val)];
      switch (ty) {
        case '©nam': setText(t, 'title', text()); break;
        case '©ART': setText(t, 'artist', text()); break;
        case 'aART': setText(t, 'album_artist', text()); break;
        case '©alb': setText(t, 'album', text()); break;
        case '©gen': setText(t, 'genre', text()); break;
        case '©wrt': setText(t, 'composer', text()); break;
        case '©day': setYear(t, utf8(val)); break;
        case 'gnre': if (!t.genre && val.length >= 2 && GENRES[be16(val, 0) - 1]) t.genre = GENRES[be16(val, 0) - 1]; break;
        case 'trkn': if (val.length >= 6) { t.track_no = be16(val, 2) || undefined; t.track_total = be16(val, 4) || undefined; } break;
        case 'disk': if (val.length >= 6) { t.disc_no = be16(val, 2) || undefined; t.disc_total = be16(val, 4) || undefined; } break;
        case 'covr':
          t.has_art = true;
          if (want && !t.picture && val.length) { const data = val.slice(); t.picture = { mime: sniff(data, kind === 14 ? 'image/png' : 'image/jpeg'), data }; }
          break;
      }
    });
  };
  const meta = (d: Uint8Array) => {
    const off = latin1(d.subarray(4, 8)) === 'hdlr' ? 0 : 4;     // QuickTime-style meta has no version/flags
    boxes(d.subarray(off), (ty, x) => { if (ty === 'ilst') boxes(x, item); });
  };
  boxes(moov, (ty, d) => {
    if (ty === 'mvhd') {
      const v = d[0];
      const ts = v === 1 ? be32(d, 20) : be32(d, 12);
      const du = v === 1 ? be32(d, 24) * 4294967296 + be32(d, 28) : be32(d, 16);
      if (ts && du) t.duration_seconds = du / ts;
    } else if (ty === 'udta') boxes(d, (u, x) => { if (u === 'meta') meta(x); });
    else if (ty === 'meta') meta(d);
  });
}

/* ---------- WAV / AIFF / DSF ---------- */
async function riff(r: Reader, t: Tags, want: boolean) {
  let o = 12, byteRate = 0, dataSize = 0;
  for (let k = 0; k < 64 && o + 8 <= r.size; k++) {
    const h = await r.get(o, 8);
    const id = latin1(h.subarray(0, 4)), sz = le32(h, 4);
    if (id === 'fmt ') { const d = await r.get(o + 8, 16); t.channels = le16(d, 2); t.sample_rate = le32(d, 4); byteRate = le32(d, 8); t.bits = le16(d, 14); }
    else if (id === 'data') dataSize = sz;
    else if (id === 'LIST') {
      const d = await r.get(o + 8, Math.min(sz, 65536));
      if (latin1(d.subarray(0, 4)) === 'INFO') {
        let p = 4;
        while (p + 8 <= d.length) {
          const cid = latin1(d.subarray(p, p + 4)), cl = le32(d, p + 4);
          const v = [clean(utf8(d.subarray(p + 8, p + 8 + cl)))];
          if (cid === 'INAM') setText(t, 'title', v); else if (cid === 'IART') setText(t, 'artist', v);
          else if (cid === 'IPRD') setText(t, 'album', v); else if (cid === 'IGNR') setText(t, 'genre', v);
          else if (cid === 'ICRD') setYear(t, v[0]); else if ((cid === 'ITRK' || cid === 'IPRT') && !t.track_no) t.track_no = pair(v[0])[0];
          p += 8 + cl + (cl & 1);
        }
      }
    } else if (id === 'id3 ' || id === 'ID3 ') await id3v2(sub(r, o + 8, sz), t, want);
    o += 8 + sz + (sz & 1);
  }
  if (byteRate && dataSize) t.duration_seconds = dataSize / byteRate;
}
async function aiff(r: Reader, t: Tags, want: boolean) {
  let o = 12;
  for (let k = 0; k < 64 && o + 8 <= r.size; k++) {
    const h = await r.get(o, 8);
    const id = latin1(h.subarray(0, 4)), sz = be32(h, 4);
    if (id === 'COMM') {
      const d = await r.get(o + 8, 18);
      t.channels = be16(d, 0); t.bits = be16(d, 6);
      const exp = be16(d, 8) & 0x7fff, mant = be32(d, 10) * 4294967296 + be32(d, 14);
      const sr = mant * Math.pow(2, exp - 16383 - 63);
      if (sr > 0) { t.sample_rate = Math.round(sr); t.duration_seconds = be32(d, 2) / sr; }
    } else if (id === 'ID3 ' || id === 'id3 ') await id3v2(sub(r, o + 8, sz), t, want);
    o += 8 + sz + (sz & 1);
  }
}
async function dsf(r: Reader, t: Tags, want: boolean) {
  const h = await r.get(0, 80);
  const metaAt = le32(h, 20) + le32(h, 24) * 4294967296;
  if (latin1(h.subarray(28, 32)) === 'fmt ') {
    t.channels = le32(h, 52); t.sample_rate = le32(h, 56); t.bits = le32(h, 60);
    const samples = le32(h, 64) + le32(h, 68) * 4294967296;
    if (t.sample_rate) t.duration_seconds = samples / t.sample_rate;
  }
  if (metaAt > 0 && metaAt < r.size) await id3v2(r, t, want, metaAt);
}

/* ---------- APEv2 (APE, WavPack, Musepack; sometimes MP3) ---------- */
async function apeTag(r: Reader, t: Tags, want: boolean) {
  for (const end of [r.size, r.size - 128]) {
    if (end < 32) continue;
    const f = await r.get(end - 32, 32);
    if (latin1(f.subarray(0, 8)) !== 'APETAGEX') continue;
    const size = le32(f, 12), count = le32(f, 16);
    const b = await r.get(end - size, size - 32);
    let o = 0;
    for (let k = 0; k < count && o + 8 < b.length; k++) {
      const vl = le32(b, o), flags = le32(b, o + 4);
      const z = b.indexOf(0, o + 8);
      if (z < 0) break;
      const key = latin1(b.subarray(o + 8, z)).toUpperCase();
      const val = b.subarray(z + 1, z + 1 + vl);
      o = z + 1 + vl;
      if (key.startsWith('COVER ART')) {
        t.has_art = true;
        if (want && !t.picture) { const s = val.indexOf(0); const data = val.slice(s + 1); t.picture = { mime: sniff(data, 'image/jpeg'), data }; }
      } else if (((flags >> 1) & 3) === 0) applyKV(t, key, utf8(val).split('\u0000'));
    }
    return;
  }
}

/* ---------- entry point ---------- */
export async function readTags(r: Reader, ext: string, want = false): Promise<Tags> {
  const t: Tags = {};
  try {
    const head = await r.get(0, 12);
    const magic = latin1(head.subarray(0, 4));
    if (magic === 'fLaC') await flac(r, 0, t, want);
    else if (magic === 'OggS') await ogg(r, t, want);
    else if (magic === 'RIFF' && latin1(head.subarray(8, 12)) === 'WAVE') await riff(r, t, want);
    else if (magic === 'FORM') await aiff(r, t, want);
    else if (magic === 'DSD ') await dsf(r, t, want);
    else if (latin1(head.subarray(4, 8)) === 'ftyp') await mp4(r, t, want);
    else {
      const end = await id3v2(r, t, want);
      const next = latin1(await r.get(end, 4));
      if (next === 'fLaC') await flac(r, end, t, want);
      else if (['ape', 'wv', 'mpc', 'tak', 'ofr'].includes(ext)) await apeTag(r, t, want);
      else if (['mp3', 'mp2', 'mp1', 'mpga'].includes(ext) || (end > 0 && next.charCodeAt(0) === 0xff)) {
        await mpegInfo(r, end, t);
        if (!t.title) await id3v1(r, t);
        if (!t.title) await apeTag(r, t, want);
      }
    }
  } catch (e) {
    t.error = (e as Error).message || String(e);
  }
  if (!t.bitrate && t.duration_seconds && t.duration_seconds > 0) t.bitrate = Math.round((r.size * 8) / t.duration_seconds / 1000);
  return t;
}
