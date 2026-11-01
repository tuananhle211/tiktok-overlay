// Gift → effect map for the themes that let the streamer choose what each TikTok gift does (live/qua-*.txt).
// One rule per line:  "Rose (1), Rosa, #5655 = kind"  (price in brackets and #gift-id are optional).
// The file is re-read when it changes; gift names, prices and pictures come from the TikTok gift catalogue.
import fs from 'node:fs';
import path from 'node:path';
import { normGift } from './gift-catalog.mjs';

export function parseGiftMap(text, KINDS){
  const rules = [], byName = new Map(), byId = new Map(), errors = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim(); if (!s || /^#(?!\d)/.test(s)) return;            // "# note" is a comment, "#5655 = …" is a gift id
    const eq = s.lastIndexOf('=');
    if (eq < 0){ errors.push(`dòng ${i + 1}: thiếu dấu =`); return; }
    const kind = s.slice(eq + 1).trim().toLowerCase();
    if (!Object.hasOwn(KINDS, kind)){ errors.push(`dòng ${i + 1}: không có kiểu "${kind}"`); return; }
    const gifts = [];
    for (const part of s.slice(0, eq).split(',').map(p => p.trim()).filter(Boolean)){
      const id = part.match(/^#(\d+)$/); if (id){ byId.set(+id[1], kind); gifts.push({ name: '', id: +id[1], price: 0 }); continue; }
      const m = part.match(/^(.*?)\s*\((\d+)\)$/), name = (m ? m[1] : part).trim();
      if (!name) continue;
      byName.set(normGift(name), kind); gifts.push({ name: name.slice(0, 30), price: m ? +m[2] : 0 });
    }
    rules.push({ kind, kindName: KINDS[kind], gifts });
  });
  return { rules, byName, byId, errors };
}

// file: the qua-*.txt path · kinds: { kind: display name } · fallback(tier) → kind for gifts not in the file
export function createGiftMap({ file, kinds, fallback, gifts, addLog, broadcast }){
  const label = path.basename(file);
  let map = parseGiftMap('', kinds), stamp = -1, timer = null;
  // what the overlay and the panel get: each gift with its real name, price and TikTok picture
  const rules = () => map.rules.map(r => ({ kind: r.kind, kindName: r.kindName, gifts: r.gifts.map(g => {
    const info = gifts.find(g.name, g.id);
    return { name: info?.name || g.name || '#' + g.id, price: g.price || info?.price || 0, icon: info ? gifts.iconUrl(info.id) : '' };
  }) }));
  const send = () => broadcast({ t:'giftmap', giftMap: rules() });
  async function prefetch(){
    const ids = map.rules.flatMap(r => r.gifts).map(g => gifts.find(g.name, g.id)?.id).filter(Boolean);
    const before = ids.filter(id => gifts.iconUrl(id)).length;
    await Promise.all(ids.map(id => gifts.ensureIcon(id)));
    const after = ids.filter(id => gifts.iconUrl(id)).length;
    if (after > before) send();
    if (after < ids.length) addLog(`Icon quà: có ${after}/${ids.length}, thiếu icon sẽ hiện tên quà`);
  }
  function load(){
    let st; try { st = fs.statSync(file); } catch { if (stamp !== -2){ stamp = -2; map = parseGiftMap('', kinds); addLog(`Không thấy file ${label}: quà sẽ chạy theo giá`); send(); } return; }
    if (st.mtimeMs === stamp) return; stamp = st.mtimeMs;
    map = parseGiftMap(fs.readFileSync(file, 'utf8'), kinds);
    addLog(`Quà: đã nạp ${map.rules.length} dòng từ ${label}`);
    for (const e of map.errors) addLog(`⚠️ ${label} ${e}`);
    send(); prefetch();
  }
  // match by id, then by name; a localized name still matches through the catalogue (id ↔ English name)
  function kindFor(giftName, giftId, tier){
    const info = gifts.find(giftName, giftId);
    return map.byId.get(+giftId) || map.byName.get(normGift(giftName))
      || (info && (map.byId.get(info.id) || map.byName.get(normGift(info.name))))
      || fallback(tier);
  }
  return {
    rules, send, prefetch, kindFor, load,
    start(){ load(); clearInterval(timer); timer = setInterval(load, 3000); },
    stop(){ clearInterval(timer); timer = null; },
  };
}
