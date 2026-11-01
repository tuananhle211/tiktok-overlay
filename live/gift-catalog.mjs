// TikTok gift catalogue: name, price and picture of every gift, from TikTok's public webcast gift list
// (no account, no signing needed). The list is cached for 3 days in gift-icons/catalog.json and pictures are
// downloaded on demand into gift-icons/<id>.<ext>, served as /live/gift-icons/<id>.<ext>.
// gift-icons/ is not committed: the pictures are TikTok's artwork.
import fs from 'node:fs';
import path from 'node:path';

const LIST_URL = 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_language=vi-VN&app_name=tiktok_web&browser_language=vi-VN&device_platform=web_pc&region=VN&room_id=0';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PICTURE_HOST = /^https:\/\/[a-z0-9.-]+\.(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ibyteimg\.com)\//i;   // only download from TikTok's CDN
const MAX_AGE = 3 * 86400_000;
export const normGift = s => String(s || '').toLowerCase().normalize('NFC').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

export function createGiftCatalog({ dir, addLog }){
  fs.mkdirSync(dir, { recursive: true });
  const CATALOG = path.join(dir, 'catalog.json');
  let byId = new Map(), byName = new Map(), fetchedAt = 0;
  const files = new Map(), pending = new Map();
  for (const f of fs.readdirSync(dir)){ const m = f.match(/^(\d+)\.(png|webp|jpg)$/); if (m) files.set(+m[1], f); }

  function index(list){
    byId = new Map(list.map(g => [g.id, g]));
    byName = new Map(); for (const g of list){ const k = normGift(g.name); if (!byName.has(k)) byName.set(k, g.id); }   // first one wins on duplicate names
  }
  try { const c = JSON.parse(fs.readFileSync(CATALOG, 'utf8')); index(c.gifts || []); fetchedAt = +c.fetchedAt || 0; } catch {}

  async function refresh(force = false){
    if (!force && byId.size && Date.now() - fetchedAt < MAX_AGE) return false;
    const r = await fetch(LIST_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const list = (j?.data?.gifts || []).map(g => ({ id: +g.id, name: String(g.name || '').slice(0, 40), price: +g.diamond_count || 0, img: String(g.image?.url_list?.[0] || '') }))
      .filter(g => g.id && g.name);
    if (!list.length) throw new Error('TikTok trả về danh sách quà trống');
    index(list); fetchedAt = Date.now();
    fs.writeFileSync(CATALOG, JSON.stringify({ fetchedAt, gifts: list }));
    addLog(`Đã tải danh mục ${list.length} quà TikTok`);
    return true;
  }

  // download a gift picture once; returns the file name or null
  function ensureIcon(id, url){
    id = +id; if (!id) return Promise.resolve(null);
    if (files.has(id)) return Promise.resolve(files.get(id));
    if (pending.has(id)) return pending.get(id);
    url = url || byId.get(id)?.img;
    if (!url || !PICTURE_HOST.test(url)) return Promise.resolve(null);
    const p = (async () => {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
        const type = r.headers.get('content-type') || '', ext = /webp/.test(type) ? 'webp' : /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : null;
        if (!r.ok || !ext) return null;
        const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 2_000_000) return null;
        const f = `${id}.${ext}`; fs.writeFileSync(path.join(dir, f), buf); files.set(id, f); return f;
      } catch { return null; } finally { pending.delete(id); }
    })();
    pending.set(id, p); return p;
  }

  return {
    refresh, ensureIcon,
    find: (name, id) => (id && byId.get(+id)) || byId.get(byName.get(normGift(name))) || null,
    iconUrl: id => files.has(+id) ? `/live/gift-icons/${files.get(+id)}` : '',
    get size(){ return byId.size; },
  };
}
