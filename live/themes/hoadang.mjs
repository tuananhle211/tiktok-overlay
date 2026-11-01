// Đêm Hoa Đăng: every comment sets a paper lantern on a night river; each gift sends its own kind of lantern
// (rose, heart, star, sky lantern…, mapped in live/qua-den.txt) and is thanked by name. The lanterns themselves live
// in the overlay; the server only remembers people (colour, last wish, gift total) and decides which lantern a gift makes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGiftMap } from '../gift-map.mjs';

export const meta = { name: 'Đêm Hoa Đăng', description: 'Thả đèn trên sông đêm: bình luận thả đèn, mỗi món quà một kiểu đèn.' };
const GIFT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'qua-den.txt');
export const KINDS = {
  'den-giay': 'Đèn giấy', 'hoa-sen': 'Đèn hoa sen', 'den-troi': 'Đèn trời', 'hoa-hong': 'Đèn hoa hồng', 'trai-tim': 'Đèn trái tim',
  'ong-sao': 'Đèn ông sao', 'long-tron': 'Đèn lồng Hội An', 'con-heo': 'Đèn heo may mắn', 'den-doi': 'Đèn đôi', 'phao-hoa': 'Pháo hoa', 'mua-den': 'Mưa đèn',
};

export function createTheme({ settings, broadcast, say, addLog, clamp, pick, spoken, snapshot, gifts, botMaxCoins, DEMO_NAMES }){
  const people = new Map();            // id -> { id, name, avatar, color, chosen, coins, lastText, lastTextAt, lastAt, demo }
  const giftMap = createGiftMap({ file: GIFT_FILE, kinds: KINDS, gifts, addLog, broadcast,
    fallback: tier => tier >= 3 ? 'den-troi' : tier >= 2 ? 'hoa-sen' : 'den-giay' });

  const COLORS = ['do', 'vang', 'hong', 'xanh', 'tim', 'cam'];
  const COLOR_WORDS = { 'đỏ':'do', 'vàng':'vang', 'hồng':'hong', 'xanh':'xanh', 'xanh lá':'xanh', 'xanh dương':'xanh', 'xanh biển':'xanh', 'tím':'tim', 'cam':'cam' };
  // A comment picks a colour only when it IS the colour ("đỏ", "màu đỏ", "đèn đỏ"). Accents are required,
  // so "tim" (thả tim) or "hong" (không) never count.
  function colorFromText(t){
    const w = String(t).toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(đèn )?(màu )?/, '');
    return Object.hasOwn(COLOR_WORDS, w) ? COLOR_WORDS[w] : null;
  }
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };

  function touch(id, name, avatar, demo){
    let v = people.get(id);
    if (!v){
      v = { id, name: String(name || id).slice(0, 18), avatar: avatar || '', color: COLORS[hash(id) % COLORS.length], chosen: false,
            coins: 0, lastText: '', lastTextAt: 0, lastAt: Date.now(), demo: !!demo };
      people.set(id, v);
      if (people.size > 600){                    // forget the quietest non-donor
        const old = [...people.values()].filter(x => !x.coins && !String(x.id).startsWith('bot_')).sort((a, b) => a.lastAt - b.lastAt)[0];
        if (old) people.delete(old.id);
      }
    } else {
      if (name) v.name = String(name).slice(0, 18);
      if (avatar) v.avatar = avatar;
    }
    v.lastAt = Date.now();
    return v;
  }
  const pub = v => ({ id: v.id, name: v.name, avatar: v.avatar, color: v.color, chosen: v.chosen, coins: v.coins, demo: v.demo });
  // bots stay on the leaderboard, but their total never goes above botMaxCoins (real viewers who give more always rank higher)
  const isBot = v => v.demo || String(v.id).startsWith('bot_');
  const top = () => [...people.values()].filter(v => v.coins > 0).sort((a, b) => b.coins - a.coins).slice(0, 5).map(v => ({ name: v.name, coins: v.coins }));

  function chat(id, name, text, avatar, demo){
    text = String(text || '').slice(0, 120).trim();
    const v = touch(id, name, avatar, demo);
    const want = colorFromText(text);
    if (want){ v.color = want; v.chosen = true; }
    else if (text){ v.lastText = text; v.lastTextAt = Date.now(); }
    broadcast({ t:'lantern', v: pub(v), text: want ? '' : text });
  }

  const WISHES = ['Mong gia đình luôn bình an, hạnh phúc', 'Mong cha mẹ mạnh khỏe, sống lâu', 'Mong mọi điều tốt đẹp sẽ đến',
                  'Mong công việc thuận lợi, hanh thông', 'Mong người thương luôn bình yên'];
  function gift(id, name, giftName, count, diamonds, avatar, giftId, picture){
    giftName = String(giftName || 'quà').slice(0, 30); count = Math.max(1, Math.min(9999, +count || 1));
    const v = touch(id, name, avatar);
    const coins = Math.max(1, (diamonds || 1) * count);
    v.coins = isBot(v) ? Math.min(botMaxCoins, v.coins + coins) : v.coins + coins;   // the lantern below still uses the full gift
    const wish = (v.lastText && Date.now() - v.lastTextAt < 90_000 && v.lastText.length > 6) ? v.lastText : pick(WISHES);
    const tier = coins >= 99 ? 3 : coins >= 10 ? 2 : 1;
    const kind = giftMap.kindFor(giftName, giftId, tier), kindName = KINDS[kind];
    const info = gifts.find(giftName, giftId), icon = (info && gifts.iconUrl(info.id)) || (/^https:\/\//.test(picture || '') ? picture : '');
    broadcast({ t:'gift', id, name: v.name, giftName, icon, count, coins, total: v.coins, tier, kind, kindName, prayer: wish, v: pub(v), top: top() });
    if (settings.voiceGifts){
      const what = kind === 'phao-hoa' ? 'Pháo hoa đã được bắn mừng điều ước' : kind === 'mua-den' ? 'Một cơn mưa đèn đã được thả cho điều ước' : `Một chiếc ${kindName.toLowerCase()} đã được thả cho điều ước`;
      say(`Cảm ơn ${spoken(v.name)} đã tặng ${giftName}${count > 1 ? ', ' + count + ' lần' : ''}. ${what}: ${wish}.`, { tag:'gift', id });
    }
  }

  // every few minutes the whole river lights up, with a line that also tells newcomers what to do
  const GLOW_LINES = [
    'Bình luận để thả một chiếc đèn, gửi một điều ước cho người thương.',
    'Gõ tên một màu như đỏ, vàng, hồng, xanh để đổi màu chiếc đèn của bạn.',
    'Chúc mọi người một đêm bình yên, mọi điều ước đều thành.',
    'Mỗi món quà sẽ thả một kiểu đèn riêng: hoa hồng, trái tim, ông sao, đèn trời.',
    'Mỗi chiếc đèn là một lời chúc. Cảm ơn bạn đã ở đây đêm nay.',
  ];
  let glowIdx = 0, glowTimer = null;
  function glow(){ const text = GLOW_LINES[glowIdx++ % GLOW_LINES.length]; broadcast({ t:'glow', text }); if (settings.voiceGlow) say(text, { tag:'glow' }); }
  function schedule(){ clearInterval(glowTimer); if (settings.autoGlow) glowTimer = setInterval(glow, Math.max(1, settings.glowEveryMin) * 60_000); }

  const DEMO_WISHES = ['Mong gia đình luôn bình an', 'Mong mẹ mau khỏe', 'Chúc mọi người ngủ ngon', 'Mong thi đậu đại học', 'Ước được đi Đà Lạt cùng người thương',
    'Năm nay sẽ tốt hơn', 'Mong công việc thuận lợi', 'Cảm ơn vì tất cả', 'Mong ba mẹ sống lâu', 'Bình an nhé', 'Mong em bé khỏe mạnh', 'Mong sớm có nhà riêng'];
  let fillTimers = [];
  function fill(n){
    fillTimers.forEach(clearTimeout); fillTimers = [];
    for (let i = 0; i < n; i++){
      const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ' ' + (Math.floor(i / DEMO_NAMES.length) + 1) : '');
      fillTimers.push(setTimeout(() => chat('demo_' + i, name, pick(DEMO_WISHES), '', true), i * 160));
    }
    addLog(`Thả ${n} đèn mẫu`);
  }
  function clear(){ fillTimers.forEach(clearTimeout); fillTimers = []; people.clear(); broadcast({ t:'clear' }); broadcast(snapshot()); addLog('Đã xóa toàn bộ đèn'); }

  return {
    overlay: '/live/hoadang.html',
    defaultChat: 'Mong gia đình luôn bình an',
    defaults: {
      title: 'Đêm Hoa Đăng', subtitle: 'Thả đèn · Gửi ước nguyện',
      voice: 'vi-VN-HoaiMyNeural', pitch: 0, rate: -10,
      water: true,                       // river ambience
      voiceGifts: true,                  // read the thank-you line when someone sends a gift
      voiceGlow: false,                  // also read the line when the river lights up
      autoGlow: true, glowEveryMin: 5,
      maxLanterns: 40, driftSec: 90,
    },
    rules: {
      water: Boolean, voiceGifts: Boolean, voiceGlow: Boolean, autoGlow: Boolean,
      glowEveryMin: v => clamp(v, 1, 60), maxLanterns: v => clamp(v, 10, 80), driftSec: v => clamp(v, 30, 240),
    },
    botLines: [...DEMO_WISHES, 'đỏ', 'vàng', 'hồng', 'xanh', 'tím'],
    people,
    snapshot: () => ({ viewers: [...people.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 200).map(pub), top: top(), giftMap: giftMap.rules() }),
    start: () => { giftMap.start(); schedule(); },
    stop: () => { giftMap.stop(); clearInterval(glowTimer); fillTimers.forEach(clearTimeout); },
    onSettings: schedule,
    onCatalog: () => { giftMap.send(); giftMap.prefetch(); },
    chat, gift, fill, clear,
    // bots send real gifts from qua-den.txt so every lantern kind shows up while testing
    botGift: big => { const all = giftMap.rules().flatMap(r => r.gifts).filter(g => g.price > 0 && (big ? g.price >= 99 : g.price < 99)); const g = all.length ? pick(all) : null; return g && [g.name, g.price]; },
    join: (id, name, opts) => touch(id, name, '', opts?.demo),
    leave: id => { people.delete(id); broadcast({ t:'leave', id }); },
    commands: { glow, bell: () => broadcast({ t:'bell' }) },
  };
}
