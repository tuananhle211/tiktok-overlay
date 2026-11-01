// Chánh Điện Tịnh Tâm: a viewer who comments walks into the temple hall and sits on a cushion (up to 100),
// a keyword changes their outfit, gifts are announced with a dedication, and a chant plays every few minutes.
//
// A theme is one file in live/themes/: it exports `meta` { name, description } and createTheme(ctx), which returns
// { overlay, defaults, rules, people, snapshot, chat, gift, fill, clear, join, leave, start, stop, … }. The server finds
// every file here by itself and the control panel can switch between them while running.
export const meta = { name: 'Chánh Điện Tịnh Tâm', description: 'Chánh điện 2.5D: bình luận vào ngồi bồ đoàn tụng kinh, tặng quà được xướng tên hồi hướng.' };
export function createTheme({ settings, broadcast, say, addLog, clamp, pick, spoken, snapshot, botMaxCoins, DEMO_NAMES }){
  const viewers = new Map();           // id -> { id, name, skin, avatar, coins, joinedAt, lastAt, lastText, lastTextAt, demo }

  const CAPS = [24, 36, 64, 100];
  function capacity(){ if (settings.seatMode !== 'auto') return +settings.seatMode; const n = viewers.size; return CAPS.find(c => n <= c) || 100; }

  /* skins: sprites that exist in /assets. Walking strips exist for man / woman / granny. */
  // A comment changes the outfit only when it IS the keyword (≤ 3 words), so "Nam mô A Di Đà Phật" never reads as "nam".
  const SKIN_WORDS = [
    ['master', ['cao tăng','cao tang']], ['monk', ['sư','su','sư thầy','su thay','thầy','thay']], ['nun', ['ni','ni cô','ni co','sư cô','su co']],
    ['child', ['tiểu','tieu','chú tiểu','chu tieu','bé','be']], ['granny', ['bà','ba','áo nâu','ao nau','cụ','cu']],
    ['woman', ['nữ','nu','chị','chi','gái','gai']], ['man', ['nam','anh','trai']],
  ];
  function skinFromText(t){
    const w = String(t).toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!w || w.split(' ').length > 3) return null;
    for (const [skin, words] of SKIN_WORDS) if (words.some(k => w === k || w.startsWith(k + ' '))) return skin;
    return null;
  }
  const DEFAULT_SKINS = ['man', 'woman', 'woman', 'man', 'granny'];

  function pub(v){ return { id:v.id, name:v.name, skin:v.skin, avatar:v.avatar||'', coins:v.coins, demo:!!v.demo }; }

  function seat(id, name, opts = {}){
    let v = viewers.get(id);
    if (v){ v.lastAt = Date.now(); if (opts.avatar) v.avatar = opts.avatar; return { v, isNew:false }; }
    if (viewers.size >= 100){                     // full: the longest-quiet non-donor stands up
      const quiet = [...viewers.values()].filter(x => x.coins === 0).sort((a,b) => a.lastAt - b.lastAt)[0];
      if (!quiet) return { v:null, isNew:false };
      viewers.delete(quiet.id); broadcast({ t:'leave', id: quiet.id });
    }
    v = { id, name: (name||id).slice(0, 18), skin: opts.skin || DEFAULT_SKINS[viewers.size % DEFAULT_SKINS.length],
          avatar: opts.avatar || '', coins: 0, joinedAt: Date.now(), lastAt: Date.now(), demo: !!opts.demo };
    viewers.set(id, v);
    broadcast({ t:'join', v: pub(v), cap: capacity() });
    return { v, isNew:true };
  }

  function chat(id, name, text, avatar){
    text = String(text || '').slice(0, 120);
    const want = skinFromText(text);
    const { v, isNew } = seat(id, name, { avatar, skin: want || undefined });
    if (!v) return;
    if (!isNew && want && want !== v.skin){ v.skin = want; broadcast({ t:'skin', id, skin: want }); }
    v.lastText = text; v.lastTextAt = Date.now();
    broadcast({ t:'chat', id, name: v.name, text });
  }

  const PRAYERS = ['Nguyện cầu gia đạo bình an, vạn sự cát tường', 'Nguyện cầu cha mẹ mạnh khỏe, sống lâu', 'Nguyện hồi hướng công đức cho khắp pháp giới chúng sinh',
                   'Nguyện cầu thân tâm an lạc, phiền não tiêu trừ', 'Nguyện cầu công việc hanh thông, gia đình hạnh phúc'];
  function gift(id, name, giftName, count, diamonds, avatar){
    giftName = String(giftName || 'quà').slice(0, 30); count = Math.max(1, Math.min(9999, +count || 1));
    const { v } = seat(id, name, { avatar });
    if (!v) return;
    const coins = Math.max(1, (diamonds || 1) * (count || 1));
    // bots stay on the Công Đức board but never above botMaxCoins; the gift effects below still use the full gift
    v.coins = (v.demo || String(v.id).startsWith('bot_')) ? Math.min(botMaxCoins, v.coins + coins) : v.coins + coins;
    const prayer = (v.lastText && Date.now() - v.lastTextAt < 90_000 && v.lastText.length > 6) ? v.lastText : pick(PRAYERS);
    const tier = coins >= 99 ? 3 : coins >= 10 ? 2 : 1;
    const line = `Nam mô A Di Đà Phật. Phật tử ${spoken(v.name)} thành tâm dâng ${giftName}${count > 1 ? ', ' + count + ' lần' : ''}. ${prayer}.`;
    broadcast({ t:'gift', id, name: v.name, giftName, count, coins, total: v.coins, tier, prayer });
    if (settings.gifts.readAll || coins >= settings.gifts.minDiamonds) say(line, { tag:'gift', id });
  }

  const CHANTS = [
    'Nam mô Bổn Sư Thích Ca Mâu Ni Phật. Nguyện đem công đức này, hướng về khắp tất cả, đệ tử và chúng sinh, đều trọn thành Phật đạo.',
    'Nam mô A Di Đà Phật. Nguyện sanh Tây Phương Tịnh Độ trung, cửu phẩm liên hoa vi phụ mẫu.',
    'Nam mô Đại Bi Quán Thế Âm Bồ Tát. Nguyện cho tất cả chúng sinh thân tâm an lạc, tai qua nạn khỏi.',
    'Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời, chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách.',
  ];
  let chantIdx = 0, chantTimer = null;
  function chant(){ const text = CHANTS[chantIdx++ % CHANTS.length]; broadcast({ t:'chant', text }); say(text, { tag:'chant' }); }
  function scheduleChant(){ clearInterval(chantTimer); if (settings.autoChant) chantTimer = setInterval(chant, Math.max(1, settings.chantEveryMin) * 60_000); }

  function fill(n){
    const have = [...viewers.values()].filter(v => v.demo).length;
    for (let i = have; i < n && viewers.size < 100; i++){
      const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ' ' + (Math.floor(i / DEMO_NAMES.length) + 1) : '');
      seat('demo_' + i, name, { demo: true, skin: ['man','woman','woman','man','granny','monk','nun','child'][i % 8] });
    }
    addLog(`Đổ người mẫu: ${viewers.size} người`);
  }
  function clear(){ viewers.clear(); broadcast(snapshot()); addLog('Đã làm trống bồ đoàn'); }

  return {
    overlay: '/live/overlay.html',
    defaultChat: 'Nam mô A Di Đà Phật',
    defaults: {
      title: 'Chánh Điện Tịnh Tâm', subtitle: 'Nam Mô A Di Đà Phật',
      voice: 'vi-VN-NamMinhNeural', pitch: -18, rate: -20,
      mo: true, moBpm: 52, autoChant: true, chantEveryMin: 3,
      seatMode: 'auto',                  // auto | 24 | 36 | 64 | 100
      joinOnEnter: false,                // also seat viewers who only enter the room
    },
    rules: {
      moBpm: v => clamp(v, 20, 120), chantEveryMin: v => clamp(v, 1, 60),
      mo: Boolean, autoChant: Boolean, joinOnEnter: Boolean,
      seatMode: v => ['auto', '24', '36', '64', '100'].includes(String(v)) ? String(v) : 'auto',
    },
    botLines: ['Nam mô A Di Đà Phật', 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật', 'Cầu cho gia đình bình an', 'Con xin thành tâm sám hối', 'nữ', 'nam', 'bà',
      'Nguyện cầu cha mẹ mạnh khỏe', 'Mô Phật, an lạc quá', 'Chúc mọi người một ngày bình an', 'sư', 'Cầu công việc hanh thông'],
    people: viewers,
    snapshot: () => ({ viewers: [...viewers.values()].map(pub), cap: capacity() }),
    settingsExtra: () => ({ cap: capacity() }),
    start: scheduleChant, onSettings: scheduleChant, stop: () => clearInterval(chantTimer),
    chat, gift, fill, clear,
    join: (id, name, opts) => seat(id, name, opts),
    leave: id => { viewers.delete(id); broadcast({ t:'leave', id }); },
    member: (id, name, avatar) => { if (settings.joinOnEnter) seat(id, name, { avatar }); },
    commands: { bell: () => broadcast({ t:'bell' }), mo: () => broadcast({ t:'mo1' }), chant },
  };
}
