// Khu Tam Thái Tử — satire of an online-scam compound (the name is a real casino zone in Bavet, by the Mộc Bài border). Fiction: the "scam packages" are absurd on purpose and, unless
// turned off, the supervisor's briefings include real anti-scam reminders.
//
// Entering the live is enough to sit down at a laptop (up to 50 seats). When the room is full, whoever enters, comments or
// sends a gift takes the seat of the person who has been quiet the longest (bots and demo workers go first). Quiet for a
// few minutes → dozes off; the supervisor walks over, shouts them awake and leaves a yellow card. Gifts are scam
// "packages" (live/qua-goi.txt) that fill the room's KPI and the "Lừa được nhiều nhất" leaderboard; one cheap gift
// throws a brick or a slipper at the supervisor instead, whose health bar empties until a new supervisor takes over.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGiftMap } from '../gift-map.mjs';

export const meta = { name: 'Khu Tam Thái Tử (châm biếm)', description: 'Ổ lừa đảo giả tưởng: vào ca ngồi máy, tặng quà chốt đơn, ném gạch quản giáo.' };
const GIFT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'qua-goi.txt');
export const KINDS = {
  'nem-gach': 'Ném gạch quản giáo', 'hoang-tu': 'Hoàng tử châu Phi', 'nft-ga': 'NFT gà biết hát',
  'khoa-hoc': 'Khóa học giàu sau 1 đêm', 'meo-coin': 'Sàn MèoCoin', 'dat-mat-trang': 'Bán đất Mặt Trăng',
};
const SUPERVISORS = ['Quản giáo Hùng', 'Quản giáo Tèo', 'Quản giáo Bảy Sẹo', 'Quản giáo Lực', 'Quản giáo Tư Mập', 'Quản giáo Sáu Đen'];
const MONEY_PER_COIN = 1_000_000;                                   // 1 xu = 1 triệu "đồng lừa được" (fake money)
export const fmtMoney = n => n >= 1e9 ? `${String(+(n / 1e9).toFixed(1)).replace('.', ',')} tỷ` : `${String(+(n / 1e6).toFixed(1)).replace('.', ',')} triệu`;

export function createTheme({ settings, broadcast, say, addLog, clamp, pick, spoken, snapshot, gifts, botMaxCoins, DEMO_NAMES }){
  const people = new Map();     // seated now: id -> { id, name, avatar, look, lastAt, demo }
  const scores = new Map();     // whole session, kept after someone is kicked: id -> { name, coins, money, kos, bot }
  const isBot = id => /^(bot|demo)_/.test(String(id));
  const giftMap = createGiftMap({ file: GIFT_FILE, kinds: KINDS, gifts, addLog, broadcast,
    fallback: tier => tier >= 3 ? 'meo-coin' : tier >= 2 ? 'nft-ga' : 'hoang-tu' });
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  const cap = () => clamp(settings.maxSeats || 50, 10, 50);

  /* -------- supervisor with a health bar */
  let supIdx = 0, sup = null;
  const newSup = () => { const i = supIdx++; return { name: SUPERVISORS[i % SUPERVISORS.length], look: i % 6, hp: settings.supHp || 100, maxHp: settings.supHp || 100 }; };
  let kpi = { done: 0, target: 100_000_000, level: 1 };

  /* -------- seats */
  // "nam" / "nữ" as the whole comment changes the hairstyle
  const LOOK_WORDS = { 'nam':'nam', 'trai':'nam', 'nữ':'nu', 'nu':'nu', 'gái':'nu' };
  const lookFromText = t => { const w = String(t).toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); return Object.hasOwn(LOOK_WORDS, w) ? LOOK_WORDS[w] : null; };
  const pub = v => ({ id: v.id, name: v.name, avatar: v.avatar, look: v.look, shirt: v.shirt, demo: v.demo, money: scores.get(v.id)?.money || 0, asleep: !!v.asleep, card: v.card || null });
  // any interaction (comment, gift, like) wakes a dozing worker up and takes their yellow card away
  function active(v){ v.lastAt = Date.now(); if (v.asleep || v.card){ v.asleep = false; v.card = null; broadcast({ t:'awake', id: v.id }); } }
  // kick: when the room is full, may this newcomer take someone's seat? Real viewers push out bots/demo workers first.
  function seat(id, name, avatar, { kick = false, demo = false, look = null } = {}){
    let v = people.get(id);
    if (v){ if (name) v.name = String(name).slice(0, 18); if (avatar) v.avatar = avatar; active(v); return v; }
    if (people.size >= cap()){
      if (!kick) return null;
      const all = [...people.values()].sort((a, b) => a.lastAt - b.lastAt);
      const quiet = all.find(x => isBot(x.id)) || (isBot(id) ? null : all[0]);
      if (!quiet) return null;
      people.delete(quiet.id); broadcast({ t:'kick', id: quiet.id, name: quiet.name, by: String(name || '').slice(0, 18) });
    }
    v = { id, name: String(name || id).slice(0, 18), avatar: avatar || '', look: look || (hash(id) % 2 ? 'nu' : 'nam'), shirt: hash(id + 's') % 8, lastAt: Date.now(), demo: !!demo || isBot(id) };
    people.set(id, v); broadcast({ t:'join', v: pub(v), cap: cap() });
    return v;
  }
  function score(id, name){ let s = scores.get(id); if (!s){ s = { name, coins: 0, money: 0, kos: 0, bot: isBot(id) }; scores.set(id, s); } s.name = String(name || s.name).slice(0, 18); return s; }
  const top = () => [...scores.values()].filter(s => s.money > 0).sort((a, b) => b.money - a.money).slice(0, 5).map(s => ({ name: s.name, money: s.money }));

  // entering the live is enough to start a shift; when all laptops are taken, the quietest worker makes room
  function member(id, name, avatar){ if (settings.joinOnEnter) seat(id, name, avatar, { kick: true }); }
  function chat(id, name, text, avatar){
    text = String(text || '').slice(0, 120).trim();
    const look = lookFromText(text);
    const v = seat(id, name, avatar, { kick: true, look });
    if (!v) return;
    if (look && look !== v.look){ v.look = look; broadcast({ t:'look', id, look }); }
    if (text && !look) broadcast({ t:'chat', id, text });
  }

  function gift(id, name, giftName, count, diamonds, avatar, giftId, picture){
    giftName = String(giftName || 'quà').slice(0, 30); count = Math.max(1, Math.min(9999, +count || 1));
    const v = seat(id, name, avatar, { kick: true });            // a gift always gets you a seat
    const coins = Math.max(1, (diamonds || 1) * count), tier = coins >= 99 ? 3 : coins >= 10 ? 2 : 1;
    const kind = giftMap.kindFor(giftName, giftId, tier), kindName = KINDS[kind];
    const info = gifts.find(giftName, giftId), icon = (info && gifts.iconUrl(info.id)) || (/^https:\/\//.test(picture || '') ? picture : '');
    const s = score(id, v?.name || name);
    if (kind === 'nem-gach') return attack(id, s.name, count, icon, giftName, s);
    // bots stay on the leaderboard but never above botMaxCoins; the effects below still use the full gift
    const counted = s.bot ? Math.max(0, Math.min(botMaxCoins - s.coins, coins)) : coins;
    s.coins += counted; s.money += counted * MONEY_PER_COIN;
    kpi.done += counted * MONEY_PER_COIN;
    const amount = coins * MONEY_PER_COIN;
    broadcast({ t:'gift', id, name: s.name, giftName, icon, count, coins, tier, kind, kindName, amount, total: s.money, top: top(), kpi, v: v ? pub(v) : undefined });
    if (settings.voiceGifts) say(`Loa loa loa! ${spoken(s.name)} vừa chốt đơn ${kindName}${count > 1 ? ', ' + count + ' lần' : ''}, lừa được ${fmtMoney(amount)}!`, { tag:'gift', id });
    // a big gift can clear several shifts at once
    const from = kpi.level;
    while (kpi.done >= kpi.target){ kpi.done -= kpi.target; kpi.level++; kpi.target = Math.round(kpi.target * 1.5 / 1e6) * 1e6; }
    if (kpi.level > from){
      broadcast({ t:'kpiup', kpi, from });
      say(`Chúc mừng cả phòng đã vượt KPI${kpi.level - from > 1 ? ` ${kpi.level - from} ca liền` : ` ca ${from}`}! KPI ca mới là ${fmtMoney(kpi.target)}.`, { tag:'kpi' });
      addLog(`🎉 Vượt KPI, lên ca ${kpi.level}`);
    }
  }

  // the cheap gift: one brick or slipper per gift in the combo (max 10), 6–10 damage each
  function attack(id, name, count, icon, giftName, s){
    const n = Math.min(10, count), hits = Array.from({ length: n }, () => 6 + Math.floor(Math.random() * 5));
    const dmg = hits.reduce((a, b) => a + b, 0);
    sup.hp = Math.max(0, sup.hp - dmg);
    broadcast({ t:'hit', id, name, hits, hp: sup.hp, maxHp: sup.maxHp, icon, giftName });
    if (sup.hp > 0) return;
    const old = sup.name; s.kos++; sup = newSup();
    broadcast({ t:'ko', id, by: name, old, sup });
    addLog(`🧱 ${name} hạ gục ${old}, ${sup.name} lên thay`);
    if (settings.voiceGifts) say(`${old} đã bị ${spoken(name)} hạ gục! ${sup.name} lên thay.`, { tag:'ko' });
  }

  /* -------- periodic briefing by the supervisor, with real anti-scam reminders mixed in */
  const BRIEF = [
    () => `Họp giao ban! KPI ca ${kpi.level} còn thiếu ${fmtMoney(Math.max(0, kpi.target - kpi.done))}. Làm việc đi!`,
    () => 'Vào live là vào ca. Bình luận cho khỏi ngủ gật, tặng quà để chốt đơn. Ai im lặng lâu sẽ bị đuổi khỏi máy!',
    () => 'Ai chưa chốt đơn nào thì tối nay rửa bát cho cả phòng!',
    () => `${sup.name} còn ${sup.hp} máu. Đứa nào ném gạch thì liệu hồn!`,
  ];
  // the theme borrows the name of a real place (Bavet, by the Mộc Bài border), so the reminders say what it is in real life
  const AWARE = [
    'Nhắc nhở thật: đây là phòng live giả tưởng, châm biếm. Ngoài đời, theo báo chí, khu Tam Thái Tử là nơi nhiều người Việt bị dụ sang bằng lời hứa việc nhẹ lương cao rồi bị ép làm việc.',
    'Đừng tin lời mời việc nhẹ lương cao ở nước ngoài. Gặp dấu hiệu lừa đảo hay có người thân bị dụ đi, hãy báo ngay cho công an nơi gần nhất.',
  ];
  let briefIdx = 0, briefTimer = null;
  function giaoban(){
    const i = briefIdx++;
    const text = settings.awareness && i % 3 === 2 ? AWARE[Math.floor(i / 3) % AWARE.length] : BRIEF[i % BRIEF.length]();
    broadcast({ t:'giaoban', text, sup: sup.name });
    if (settings.voiceGiaoban) say(text, { tag:'giaoban' });
  }
  function schedule(){ clearInterval(briefTimer); briefTimer = setInterval(giaoban, Math.max(1, settings.giaobanEveryMin) * 60_000); }
  function applySettings(){
    schedule();
    if (sup){ sup.maxHp = settings.supHp; sup.hp = Math.min(sup.hp, sup.maxHp); broadcast({ t:'sup', sup }); }
    while (people.size > cap()){ const q = [...people.values()].sort((a, b) => a.lastAt - b.lastAt)[0]; people.delete(q.id); broadcast({ t:'kick', id: q.id, name: q.name, by: '' }); }
  }

  /* -------- dozing: quiet for napMin minutes → falls asleep at the desk. Every 15 s at most, the supervisor walks over
     to one sleeper (real viewers before bots and demo workers), shouts them awake and leaves a yellow card. */
  let napTimer = null, lastWake = 0;
  function napTick(){
    if (!settings.autoNap) return;
    const now = Date.now(), limit = Math.max(1, settings.napMin) * 60_000;
    for (const v of people.values()) if (!v.asleep && now - Math.max(v.lastAt, v.wokeAt || 0) > limit){ v.asleep = true; broadcast({ t:'nap', id: v.id }); }
    if (now - lastWake < 15_000) return;
    const v = [...people.values()].filter(x => x.asleep).sort((a, b) => (isBot(a.id) - isBot(b.id)) || (a.lastAt - b.lastAt))[0];
    if (!v) return;
    lastWake = now; v.asleep = false; v.card = 'yellow'; v.wokeAt = now;
    broadcast({ t:'wake', id: v.id, name: v.name });
    if (settings.voiceGiaoban && !isBot(v.id)) say(`Nhân viên ${spoken(v.name)} ngủ gật trong giờ làm!`, { tag:'nap', id: v.id });
  }
  function like(id){ const v = people.get(id); if (v) active(v); }

  let fillTimers = [];
  function fill(n){
    fillTimers.forEach(clearTimeout); fillTimers = [];
    for (let i = 0; i < n; i++){
      const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ' ' + (Math.floor(i / DEMO_NAMES.length) + 1) : '');
      fillTimers.push(setTimeout(() => seat('demo_' + i, name, '', { demo: true }), i * 120));
    }
    addLog(`Cho ${n} nhân viên mẫu vào ca`);
  }
  function clear(){
    fillTimers.forEach(clearTimeout); fillTimers = [];
    people.clear(); scores.clear(); kpi = { done: 0, target: 100_000_000, level: 1 }; sup = newSup();
    broadcast(snapshot()); addLog('Đã đuổi hết, làm lại từ đầu');
  }

  return {
    overlay: '/live/luadao.html',
    defaultChat: 'Báo cáo sếp, em chốt được 1 đơn',
    defaults: {
      title: 'Khu Tam Thái Tử', subtitle: 'Giả tưởng · Châm biếm · Tỉnh táo trước lừa đảo',
      voice: 'vi-VN-NamMinhNeural', pitch: -5, rate: 5,
      music: true,                       // office ambience: keyboards and hum
      joinOnEnter: true,                 // whoever enters the live sits down at a free laptop
      maxSeats: 50, supHp: 100,
      voiceGifts: true, voiceGiaoban: true,
      awareness: true,                   // mix real anti-scam reminders into the briefings
      giaobanEveryMin: 4,
      autoNap: true, napMin: 3,          // quiet for napMin minutes → dozes off, the supervisor comes to wake them up
    },
    rules: {
      joinOnEnter: Boolean, voiceGifts: Boolean, voiceGiaoban: Boolean, awareness: Boolean, autoNap: Boolean,
      maxSeats: v => clamp(v, 10, 50), supHp: v => clamp(v, 30, 1000), giaobanEveryMin: v => clamp(v, 1, 60), napMin: v => clamp(v, 1, 30),
    },
    botLines: ['Báo cáo sếp, em chốt được 1 đơn', 'Mạng lag quá sếp ơi', 'Cho em xin cốc cà phê', 'Hôm nay có thưởng không sếp', 'nam', 'nữ',
      'KPI cao quá trời', 'Em đang gõ phím đây', 'Sếp ơi máy em treo rồi', 'Ai ném gạch đi kìa', 'Làm thêm ca nữa hả sếp'],
    people,
    snapshot: () => ({ viewers: [...people.values()].map(pub), cap: cap(), top: top(), kpi, sup, giftMap: giftMap.rules() }),
    settingsExtra: () => ({ cap: cap() }),
    start: () => { if (!sup) sup = newSup(); giftMap.start(); schedule(); clearInterval(napTimer); napTimer = setInterval(napTick, 5000); },
    stop: () => { giftMap.stop(); clearInterval(briefTimer); clearInterval(napTimer); fillTimers.forEach(clearTimeout); },
    like,
    onSettings: applySettings,
    onCatalog: () => { giftMap.send(); giftMap.prefetch(); },
    chat, gift, member, fill, clear,
    botGift: big => { const all = giftMap.rules().flatMap(r => r.gifts).filter(g => g.price > 0 && (big ? g.price >= 99 : g.price < 99)); const g = all.length ? pick(all) : null; return g && [g.name, g.price]; },
    join: (id, name, opts) => seat(id, name, '', { demo: opts?.demo }),
    leave: id => { people.delete(id); broadcast({ t:'leave', id }); },
    commands: { giaoban, bell: () => broadcast({ t:'bell' }) },
  };
}
