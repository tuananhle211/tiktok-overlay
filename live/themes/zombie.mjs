// Vườn Chống Zombie: a lane-less defence game for TikTok LIVE. Everyone in the room is a potted plant behind the fence at
// the bottom; zombies walk slowly down from the top. Tapping the live screen (TikTok likes) fires bullets (comment 1, 2 or 3 to pick green / ice / fire),
// a follow fires a cannon ball, gifts upgrade your gun, rain bullets, call a shelling, build a machine-gun nest or drop a nuke
// (live/qua-zombie.txt). Eight kinds of zombie, and a boss at the end of every level.
// Kill every zombie of the level to move on; if the fence breaks, the game starts again from level 1. The more players, the more and
// tougher the zombies. Leaderboards for damage and kills never list bots or demo plants.
//
// The server runs the game (positions, health, damage) at 10 ticks a second and sends the overlay a compact state 5 times
// a second plus events (shots, deaths, explosions); the overlay only draws and animates.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGiftMap } from '../gift-map.mjs';

export const meta = { name: 'Vườn Chống Zombie', description: 'Game thủ thành: mỗi người là một cái cây, nhấp màn hình để bắn, follow bắn đại bác, quà gọi pháo kích, ụ súng hoặc bom hạt nhân. Cuối mỗi màn có boss.' };
const GIFT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'qua-zombie.txt');
export const KINDS = { 'nang-cap': 'Nâng cấp súng', 'mua-dan': 'Mưa đạn', 'dai-bac': 'Pháo kích ×3', 'u-sung': 'Ụ súng liên thanh', 'hat-nhan': 'Bom hạt nhân' };

// play field (same coordinates as the 1080×1920 overlay)
const SPAWN_Y = 560, FENCE_Y = 1470, X_MIN = 130, X_MAX = 950, MUZZLE_Y = 1560, BULLET_SPEED = 950;
const BULLETS = { 1: { name: 'Đạn xanh', dmg: 10 }, 2: { name: 'Đạn băng', dmg: 7, slow: 2000 }, 3: { name: 'Đạn lửa', dmg: 8, splash: 4, r: 95 } };
// hp, speed (px/s), bite = damage to the fence when it gets there, from = first level it shows up, w = how often.
// armor: damage taken while the helmet is on (above half health) · fly: weaves left and right · jump: leaps forward now and
// then · split: bursts into that many minis · heal: heals the zombies around it every 3 s (share of their max health)
const ZOMBIE = {
  walker: { hp: 60,  speed: 26, bite: 10, from: 1, w: 10 },
  runner: { hp: 35,  speed: 44, bite: 6,  from: 1, w: 4 },
  helmet: { hp: 120, speed: 24, bite: 12, from: 2, w: 4, armor: .5 },
  bat:    { hp: 28,  speed: 60, bite: 5,  from: 3, w: 3, fly: true },
  brute:  { hp: 230, speed: 17, bite: 25, from: 3, w: 2 },
  jumper: { hp: 75,  speed: 20, bite: 12, from: 4, w: 3, jump: 140 },
  fat:    { hp: 170, speed: 15, bite: 20, from: 4, w: 2, split: 3 },
  healer: { hp: 95,  speed: 18, bite: 10, from: 5, w: 2, heal: .1 },
  mini:   { hp: 18,  speed: 50, bite: 4 },                 // only from a fat zombie bursting
  boss:   { hp: 2000, speed: 11, bite: 80 },               // the last zombie of every level
};
const WEAPON = [0, 1, 1.12, 1.24, 1.36, 1.5];   // damage multiplier by gun level 1..5 (a 1-coin gift, so the gain is modest)
// the "Ụ súng" gift: a machine-gun nest on the fence that fires on its own. 25 s per gift (combo adds more), 8 shots a
// second of 20 damage plus 40% splash: about 4000 damage on one target, more than any of the cheaper gifts can do.
const TURRET = { secs: 25, rate: 8, dmg: 20, splash: .4, r: 80, speed: 1800, xs: [243, 441, 639, 837], y: FENCE_Y - 50 };

export function createTheme({ settings, broadcast, say, addLog, clamp, pick, spoken, snapshot, gifts, DEMO_NAMES }){
  const people = new Map();      // plants in the garden: id -> { id, name, avatar, type, wlv, lastAt, demo }
  const scores = new Map();      // whole session: id -> { name, dmg, kills } (real viewers only)
  const zombies = new Map();     // id -> { id, kind, x, y, hp, maxHp, speed, bite, slowUntil }
  const isBot = id => /^(bot|demo)_/.test(String(id));
  const giftMap = createGiftMap({ file: GIFT_FILE, kinds: KINDS, gifts, addLog, broadcast,
    fallback: tier => tier >= 3 ? 'hat-nhan' : tier >= 2 ? 'dai-bac' : 'nang-cap' });
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  const cap = () => clamp(settings.maxPlants || 30, 10, 30);

  /* -------- the garden: entering the live plants you; when full, the quietest plant (bots first) is pulled out */
  const pub = v => ({ id: v.id, name: v.name, avatar: v.avatar, type: v.type, wlv: v.wlv, demo: v.demo, wilted: !!v.wilted });
  // any tap, comment or gift keeps the plant fresh; a wilted plant perks up again
  function fresh(v){ v.lastAt = Date.now(); if (v.wilted){ v.wilted = false; broadcast({ t:'unwilt', id: v.id }); } }
  function plant(id, name, avatar, { kick = true, demo = false } = {}){
    let v = people.get(id);
    if (v){ if (name) v.name = String(name).slice(0, 18); if (avatar) v.avatar = avatar; fresh(v); return v; }
    if (people.size >= cap()){
      if (!kick) return null;
      const all = [...people.values()].sort((a, b) => a.lastAt - b.lastAt);
      const quiet = all.find(x => isBot(x.id)) || (isBot(id) ? null : all[0]);
      if (!quiet) return null;
      people.delete(quiet.id); broadcast({ t:'kick', id: quiet.id });
    }
    v = { id, name: String(name || id).slice(0, 18), avatar: avatar || '', type: 1 + hash(id) % 3, wlv: 1, lastAt: Date.now(), demo: !!demo || isBot(id) };
    people.set(id, v); broadcast({ t:'join', v: pub(v), cap: cap() });
    if (state.phase === 'wait'){ state.phase = 'ready'; state.breakUntil = Date.now() + 5000; sendState(); }
    return v;
  }
  function score(v){ let s = scores.get(v.id); if (!s){ s = { name: v.name, dmg: 0, kills: 0 }; scores.set(v.id, s); } s.name = v.name; return s; }
  let boardsDirty = false;
  const boards = () => {
    const list = [...scores.values()];
    return { dmg: list.filter(s => s.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, 5).map(s => ({ name: s.name, v: Math.round(s.dmg) })),
             kills: list.filter(s => s.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 5).map(s => ({ name: s.name, v: s.kills })) };
  };
  // damage and kills count for the leaderboards only when a real viewer did them
  function credit(byId, dmg, kill){ const v = people.get(byId); if (!v || isBot(byId)) return; const s = score(v); s.dmg += dmg; if (kill) s.kills++; boardsDirty = true; }

  /* -------- levels */
  const state = { level: 1, phase: 'wait', total: 0, regular: 0, regSpawned: 0, bossOut: false, spawned: 0, killed: 0, leaked: 0, fence: 100, maxFence: 100, nextSpawn: 0, breakUntil: 0 };
  let zSeq = 0;
  const players = () => Math.max(1, people.size);
  function startLevel(){
    if (!people.size){ state.phase = 'wait'; sendState(); return; }
    const L = state.level, P = players(), regular = Math.min(120, Math.round(12 + L * 4 + P * 1.2));
    zombies.clear();
    Object.assign(state, { phase: 'play', regular, regSpawned: 0, bossOut: false, horde: false, total: regular + 1, spawned: 0, killed: 0, leaked: 0,
      maxFence: 100, fence: 100, nextSpawn: Date.now() + 2500 });
    broadcast({ t:'level', level: L, total: state.total });
    addLog(`🧟 Màn ${L}: ${regular} zombie + 1 boss, ${P} người chơi`);
    sendState();
  }
  // zombies get tougher with the level and the number of players; the boss gets an extra push every level and a big one every 5th
  function makeZombie(kind, x, y){
    const L = state.level, P = players(), base = ZOMBIE[kind], now = Date.now();
    const hp = Math.round(base.hp * (1 + (L - 1) * .25) * (1 + P * .08) * (kind === 'boss' ? (1 + (L - 1) * .15) * (L % 5 === 0 ? 1.5 : 1) : 1));
    x = Math.round(clamp(x, X_MIN, X_MAX));
    const z = { id: ++zSeq, kind, x, x0: x, y, hp, maxHp: hp, speed: base.speed * (.9 + Math.random() * .2), bite: base.bite, slowUntil: 0,
      born: now, next: now + (kind === 'boss' ? 6000 : 2500 + Math.random() * 1500) };
    zombies.set(z.id, z); state.spawned++;
    broadcast({ t:'zspawn', z: { id: z.id, kind, x, y: Math.round(y), hp, maxHp: hp } });
    return z;
  }
  // extra zombies in the middle of a level (minis from a fat one, the boss's helpers) are added to the level's total
  function extra(kind, x, y){ state.total++; return makeZombie(kind, x, y); }
  function pickKind(L){
    const pool = Object.entries(ZOMBIE).filter(([, b]) => b.w && L >= b.from);
    let r = Math.random() * pool.reduce((s, [, b]) => s + b.w, 0);
    for (const [k, b] of pool){ r -= b.w; if (r < 0) return k; }
    return 'walker';
  }
  function spawnOne(){
    const x = X_MIN + Math.random() * (X_MAX - X_MIN);
    if (state.regSpawned < state.regular){
      // halfway through the level a horde rushes in all at once; otherwise zombies come one to three at a time
      const left = state.regular - state.regSpawned, L = state.level;
      let n = 1 + (Math.random() < Math.min(.6, L * .1) ? 1 : 0) + (Math.random() < Math.min(.35, L * .05) ? 1 : 0);
      if (!state.horde && state.regSpawned >= state.regular / 2){ state.horde = true; n = 6 + Math.min(6, L); broadcast({ t:'horde', n: Math.min(n, left) }); }
      n = Math.min(n, left);
      for (let i = 0; i < n; i++){ state.regSpawned++; makeZombie(pickKind(L), n > 1 ? X_MIN + (i + Math.random() * .8) * (X_MAX - X_MIN) / n : x, SPAWN_Y - Math.random() * 30); }
      return;
    }
    state.bossOut = true;
    const z = makeZombie('boss', 340 + Math.random() * 400, SPAWN_Y + 260);   // rises a bit lower so its head clears the HUD
    broadcast({ t:'boss', id: z.id, level: state.level, hp: z.maxHp });
    addLog(`👹 Boss màn ${state.level} xuất hiện (${z.maxHp} máu)`);
    if (settings.voiceGifts) say(`Cảnh báo! Boss màn ${state.level} đã xuất hiện! Cả vườn tập trung hỏa lực!`, { tag:'level' });
  }
  function kill(z, byId, how){
    if (!zombies.has(z.id)) return;
    zombies.delete(z.id); state.killed++; credit(byId, 0, true);
    broadcast({ t:'zdie', id: z.id, by: byId, how, kind: z.kind });
    const B = ZOMBIE[z.kind];
    if (B.split && how !== 'nuke' && state.phase === 'play') for (let i = 0; i < B.split; i++) extra('mini', z.x + (i - 1) * 55, Math.min(FENCE_Y - 60, z.y + 10));
    if (z.kind === 'boss'){
      const v = people.get(byId), who = v && !isBot(byId) ? v.name : '';
      addLog(`🏅 Boss màn ${state.level} bị hạ${who ? ' bởi ' + who : ''}`);
      if (settings.voiceGifts) say(who ? `${spoken(who)} đã hạ gục boss!` : 'Boss đã bị hạ gục!', { tag:'level' });
    }
  }
  // deal damage to one zombie; returns true when it dies. A helmet halves damage until it breaks at half health
  // (pierce skips that, for the nuke).
  function hurt(z, dmg, byId, how, pierce = false){
    if (!zombies.has(z.id) || dmg <= 0) return false;
    const armor = ZOMBIE[z.kind].armor;
    if (armor && !pierce && z.hp > z.maxHp / 2) dmg *= armor;
    const real = Math.min(z.hp, dmg); z.hp -= real; credit(byId, real, false);
    if (z.hp <= 0){ kill(z, byId, how); return true; }
    return false;
  }
  function endLevel(won){
    state.phase = won ? 'win' : 'lose'; state.breakUntil = Date.now() + 6000; zombies.clear();
    broadcast({ t: won ? 'win' : 'lose', level: state.level });
    if (won){ addLog(`🏆 Qua màn ${state.level}`); if (settings.voiceGifts) say(`Chúc mừng! Cả vườn đã qua màn ${state.level}!`, { tag:'level' }); state.level++; }
    else {                              // the fence broke: everyone starts again from level 1
      addLog(`💀 Thua ở màn ${state.level}, chơi lại từ màn 1`);
      if (settings.voiceGifts) say(`Hàng rào đã vỡ ở màn ${state.level}! Cả vườn chơi lại từ màn 1.`, { tag:'level' });
      state.level = 1;
    }
    sendState();
  }

  /* -------- the game loop: 10 ticks a second, state to the overlay 5 times a second */
  let loop = null, tickN = 0, last = Date.now();
  function tick(){
    const now = Date.now(), dt = Math.min(.25, (now - last) / 1000); last = now; tickN++;
    if (state.phase === 'play'){
      if (!state.bossOut && now >= state.nextSpawn && (zombies.size < 50 || state.regSpawned >= state.regular)){
        spawnOne(); state.nextSpawn = now + Math.max(700, 2200 - state.level * 120) * (.7 + Math.random() * .6) + (state.regSpawned >= state.regular && !state.bossOut ? 2500 : 0);
      }
      for (const z of [...zombies.values()]){
        if (!zombies.has(z.id)) continue;
        const B = ZOMBIE[z.kind];
        z.y += z.speed * (now < z.slowUntil ? (z.kind === 'boss' ? .7 : .5) : 1) * dt;
        if (B.fly) z.x = clamp(z.x0 + Math.sin((now - z.born) / 650 + z.id) * 80, X_MIN - 40, X_MAX + 40);
        if (B.jump && now >= z.next){
          z.next = now + 2800 + Math.random() * 1800;
          if (z.y < FENCE_Y - 260){ const from = z.y; z.y += B.jump; broadcast({ t:'zjump', id: z.id, from: Math.round(from), to: Math.round(z.y) }); }
        }
        if (B.heal && now >= z.next){
          z.next = now + 3000; const list = [];
          for (const o of zombies.values()) if (o.hp < o.maxHp && Math.hypot(o.x - z.x, o.y - z.y) < 230){ o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.kind === 'boss' ? .03 : B.heal)); list.push(o.id); }
          if (list.length) broadcast({ t:'zheal', id: z.id, list });
        }
        if (z.kind === 'boss' && now >= z.next){              // the boss roars and calls two helpers
          z.next = now + 7000;
          if (zombies.size < 55 && z.y < FENCE_Y - 200){
            broadcast({ t:'zroar', id: z.id });
            for (const k of [-1, 1]) extra(state.level >= 3 && Math.random() < .5 ? 'runner' : 'walker', z.x + k * 90, z.y + 30);
          }
        }
        if (z.y >= FENCE_Y){
          zombies.delete(z.id); state.leaked++; state.fence = Math.max(0, state.fence - z.bite);
          broadcast({ t:'zleak', id: z.id, fence: state.fence, kind: z.kind });
          if (state.fence <= 0){ endLevel(false); return; }
        }
      }
      turretTick(now, dt);
      if (state.bossOut && state.spawned >= state.total && !zombies.size){ endLevel(true); return; }
    } else if ((state.phase === 'win' || state.phase === 'lose' || state.phase === 'ready') && now >= state.breakUntil) startLevel();
    if (tickN % 2 === 0 && zombies.size) broadcast({ t:'zs', z: [...zombies.values()].map(z => [z.id, Math.round(z.x), Math.round(z.y), Math.round(z.hp), now < z.slowUntil ? 1 : 0]) });
    if (tickN % 5 === 0 && (turrets.size || turretsShown)){ turretsShown = turrets.size > 0; broadcast({ t:'turrets', list: turretList() }); }
    if (tickN % 10 === 0) wiltCheck(now);
    if (tickN % 5 === 0) sendState();
    if (boardsDirty && tickN % 10 === 0){ boardsDirty = false; broadcast({ t:'boards', ...boards() }); }
  }
  const pub2 = () => ({ level: state.level, phase: state.phase, total: state.total, done: state.killed + state.leaked, killed: state.killed, fence: state.fence, maxFence: state.maxFence, players: people.size });
  // TikTok never says when someone leaves, so a plant nobody has touched for wiltMin minutes wilts, and after uprootMin more
  // minutes it is pulled out of the garden (treated as gone). Demo plants are left alone so the layout can be previewed.
  function wiltCheck(now){
    if (!settings.autoWilt) return;
    const wilt = Math.max(1, settings.wiltMin) * 60_000, gone = wilt + Math.max(1, settings.uprootMin) * 60_000;
    for (const v of [...people.values()]){
      if (String(v.id).startsWith('demo_')) continue;
      const idle = now - v.lastAt;
      if (idle > gone){ people.delete(v.id); broadcast({ t:'uproot', id: v.id, name: v.name }); addLog(`🥀 ${v.name} im lặng lâu, cây bị nhổ khỏi vườn`); }
      else if (idle > wilt && !v.wilted){ v.wilted = true; broadcast({ t:'wilt', id: v.id }); }
    }
    if (!people.size && state.phase === 'play'){ zombies.clear(); state.phase = 'wait'; sendState(); }
  }
  let lastStateJson = '';
  function sendState(){ const s = pub2(), j = JSON.stringify(s); if (j !== lastStateJson){ lastStateJson = j; broadcast({ t:'game', ...s }); } }

  /* -------- shooting. Each shot picks a zombie (the closest to the fence, with a little randomness so fire spreads),
     aims where it will be, and hits after the bullet's flight time. */
  function target(){
    const list = [...zombies.values()].sort((a, b) => b.y - a.y).slice(0, 4);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
  const flight = (fromX, z) => Math.hypot(z.x - fromX, MUZZLE_Y - z.y) / BULLET_SPEED * 1000;
  let shotsThisSecond = 0, shotSecond = 0;
  function shoot(v, n, extra = 1){
    if (state.phase !== 'play' || !zombies.size) return;
    const now = Date.now(); if (Math.floor(now / 1000) !== shotSecond){ shotSecond = Math.floor(now / 1000); shotsThisSecond = 0; }
    // a burst of hundreds of likes becomes a few bullets that hit harder, so the screen stays readable
    const room = Math.max(1, 70 - shotsThisSecond), real = Math.max(1, Math.min(n, 6, room)); shotsThisSecond += real;
    const mult = (n / real) * extra * WEAPON[v.wlv], B = BULLETS[v.type], list = [];
    const slot = [...people.keys()].indexOf(v.id), fromX = slotX(slot);
    for (let i = 0; i < real; i++){
      const z = target(); if (!z) break;
      const delay = i * 90, eta = flight(fromX, z);
      list.push([z.id, delay, Math.round(eta)]);
      setTimeout(() => {
        if (!zombies.has(z.id)) return;
        const dmg = B.dmg * mult;
        if (B.slow) z.slowUntil = Date.now() + B.slow;
        if (B.splash) for (const o of [...zombies.values()]) if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < B.r) hurt(o, B.splash * mult, v.id, 'fire');
        hurt(z, dmg, v.id, v.type === 3 ? 'fire' : v.type === 2 ? 'ice' : 'shot');
      }, delay + eta);
    }
    if (list.length) broadcast({ t:'shots', id: v.id, type: v.type, wlv: v.wlv, list });
  }
  // the overlay lays plants out in this order; the server only needs a rough muzzle x for flight times
  function slotX(i){ const col = Math.max(0, i) % 10; return 95 + col * 99; }
  // gift damage grows exactly like zombie health (level and number of players), so a gift is worth the same in a busy room
  const giftScale = () => (1 + (state.level - 1) * .25) * (1 + players() * .08);
  // aim at the busiest spot (the zombie with the most neighbours), away from spots already targeted
  function busiest(avoid = []){
    let best = null, bestN = -1;
    for (const z of zombies.values()){
      if (avoid.some(p => Math.hypot(p.x - z.x, p.y - z.y) < 200)) continue;
      let c = 0; for (const o of zombies.values()) if (Math.hypot(o.x - z.x, o.y - z.y) < 170) c++;
      if (c > bestN || (c === bestN && z.y > best.y)){ bestN = c; best = z; }
    }
    return best;
  }
  // one shell: dmg in radius r, zombies near the centre are thrown back up to kb pixels
  function shell(v, target, { dmg, r, kb = 0, delay = 0, big = false }){
    const x = target.x, y = Math.min(FENCE_Y - 40, target.y + target.speed * 1.2), eta = 1200;
    setTimeout(() => {
      broadcast({ t:'cannon', id: v.id, x, y, eta, r, big });
      setTimeout(() => { for (const z of [...zombies.values()]){ const d = Math.hypot(z.x - x, z.y - y); if (d >= r) continue;
        if (!hurt(z, dmg, v.id, 'boom') && kb) z.y = Math.max(SPAWN_Y, z.y - kb * (z.kind === 'boss' ? .25 : 1) * (1 - d / r)); } }, eta);
    }, delay);
  }
  // follow (free): one small shell
  function cannon(v){ if (state.phase !== 'play' || !zombies.size) return; shell(v, busiest(), { dmg: 150 * (1 + (v.wlv - 1) * .1) * giftScale(), r: 170 }); }
  // the "Pháo kích" gift: three big shells on the three busiest spots, each throwing zombies back
  function barrage(v, delay = 0){
    setTimeout(() => {
      if (state.phase !== 'play' || !zombies.size) return;
      const picked = []; for (let i = 0; i < 3; i++){ const z = busiest(picked) || busiest(); if (!z) break; picked.push({ x: z.x, y: z.y }); shell(v, z, { dmg: 300 * (1 + (v.wlv - 1) * .1) * giftScale(), r: 210, kb: 160, delay: i * 280, big: true }); }
    }, delay);
  }
  // the "Mưa đạn" gift: 12 waves over 3 s, a bullet from the sky on every zombie on screen (up to 20) each wave
  function rainFire(v, delay = 0){
    setTimeout(() => {
      broadcast({ t:'rain', id: v.id });
      for (let w = 0; w < 12; w++) setTimeout(() => {
        if (state.phase !== 'play') return;
        const drops = [];
        for (const z of [...zombies.values()].sort((a, b) => b.y - a.y).slice(0, 20)){
          const d = Math.round(Math.random() * 200); drops.push([z.id, d]);
          const dmg = 12 * WEAPON[v.wlv] * giftScale(); setTimeout(() => hurt(z, dmg, v.id, 'rain'), d + 450);
        }
        if (drops.length) broadcast({ t:'drops', type: v.type, list: drops });
      }, w * 250);
    }, delay);
  }
  // the nuke wipes the field; the boss is too big for that and loses half its maximum health instead
  function nuke(v){
    broadcast({ t:'nuke', id: v.id, name: v.name });
    setTimeout(() => { for (const z of [...zombies.values()]) hurt(z, z.kind === 'boss' ? z.maxHp / 2 : z.hp, v.id, 'nuke', true); }, 1400);
  }

  /* -------- turrets ("Ụ súng"): up to 4 nests on the fence. Their clock only runs while there are zombies to shoot,
     so a turret bought near the end of a level carries over to the next. */
  const turrets = new Map();       // slot -> { slot, owner, name, left, max, acc }
  let turretsShown = false;
  const turretList = () => [...turrets.values()].map(T => [T.slot, T.name, Math.round(T.left), Math.round(T.max), state.phase === 'play' && zombies.size ? 1 : 0]);
  function addTurret(v, count){
    const add = TURRET.secs * 1000 * Math.min(5, count);
    let T = [...turrets.values()].find(t => t.owner === v.id);
    if (!T){
      const slot = TURRET.xs.findIndex((_, i) => !turrets.has(i));
      if (slot >= 0){ T = { slot, owner: v.id, name: v.name, left: 0, max: 0, acc: 0 }; turrets.set(slot, T); }
      else { T = [...turrets.values()].sort((a, b) => a.left - b.left)[0]; T.owner = v.id; T.name = v.name; }   // all 4 taken: the one with the least time left changes hands
    }
    T.left += add; T.max = T.left;
    turretsShown = true; broadcast({ t:'turrets', list: turretList(), built: T.slot });
  }
  function turretTick(now, dt){
    if (!turrets.size || !zombies.size) return;
    const fired = [];
    for (const T of [...turrets.values()]){
      T.left -= dt * 1000; T.acc += TURRET.rate * dt;
      const owner = people.get(T.owner), mult = (1 + ((owner?.wlv || 1) - 1) * .1) * giftScale(), x = TURRET.xs[T.slot];
      while (T.acc >= 1){
        T.acc--;
        // the zombie closest to the fence, the boss first once it is within reach
        const list = [...zombies.values()].sort((a, b) => b.y - a.y), boss = list.find(z => z.kind === 'boss' && z.y > FENCE_Y - 600);
        const z = boss || list[Math.floor(Math.random() * Math.min(3, list.length))]; if (!z) break;
        const eta = Math.round(Math.hypot(z.x - x, z.y - TURRET.y) / TURRET.speed * 1000);
        fired.push([T.slot, z.id, eta]);
        setTimeout(() => {
          if (!zombies.has(z.id)) return;
          const dmg = TURRET.dmg * mult;
          for (const o of [...zombies.values()]) if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < TURRET.r) hurt(o, dmg * TURRET.splash, T.owner, 'turret');
          hurt(z, dmg, T.owner, 'turret');
        }, eta);
      }
      if (T.left <= 0){ turrets.delete(T.slot); broadcast({ t:'turrets', list: turretList(), gone: T.slot }); }
    }
    if (fired.length) broadcast({ t:'tfire', list: fired });
  }

  /* -------- viewer actions */
  const TYPE_WORDS = { '1': 1, '2': 2, '3': 3, 'một': 1, 'hai': 2, 'ba': 3 };
  function chat(id, name, text, avatar){
    const v = plant(id, name, avatar); if (!v) return;
    const w = String(text || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    if (Object.hasOwn(TYPE_WORDS, w)){ v.type = TYPE_WORDS[w]; broadcast({ t:'ptype', id, type: v.type }); return; }
    if (text) broadcast({ t:'chat', id, text: String(text).slice(0, 80) });
  }
  // a like from someone without a plant yet (they came in before the server connected) plants them first
  function like(id, n = 1, name, avatar){ const v = people.get(id) || (name ? plant(id, name, avatar) : null); if (!v) return; fresh(v); shoot(v, Math.max(1, n)); }
  function member(id, name, avatar){ if (settings.joinOnEnter) plant(id, name, avatar); }
  function follow(id, name, avatar){
    const v = plant(id, name, avatar); if (!v) return;
    broadcast({ t:'follow', id, name: v.name });
    cannon(v, 1);
  }
  function gift(id, name, giftName, count, diamonds, avatar, giftId, picture){
    giftName = String(giftName || 'quà').slice(0, 30); count = Math.max(1, Math.min(9999, +count || 1));
    const v = plant(id, name, avatar); if (!v) return;
    const coins = Math.max(1, (diamonds || 1) * count), tier = coins >= 99 ? 3 : coins >= 10 ? 2 : 1;
    const kind = giftMap.kindFor(giftName, giftId, tier), kindName = KINDS[kind];
    const info = gifts.find(giftName, giftId), icon = (info && gifts.iconUrl(info.id)) || (/^https:\/\//.test(picture || '') ? picture : '');
    if (kind === 'nang-cap'){ v.wlv = Math.min(5, v.wlv + count); broadcast({ t:'pup', id, wlv: v.wlv }); }
    broadcast({ t:'gift', id, name: v.name, giftName, icon, count, coins, tier, kind, kindName, wlv: v.wlv });
    if (kind === 'mua-dan') for (let i = 0; i < Math.min(5, count); i++) rainFire(v, i * 3200);
    else if (kind === 'dai-bac') for (let i = 0; i < Math.min(5, count); i++) barrage(v, i * 1500);
    else if (kind === 'u-sung') addTurret(v, count);
    else if (kind === 'hat-nhan') nuke(v);
    if (settings.voiceGifts){
      const what = kind === 'nang-cap' ? `nâng súng lên cấp ${v.wlv}` : kind === 'hat-nhan' ? 'thả bom hạt nhân, quét sạch zombie' : kind === 'u-sung' ? 'gọi ụ súng liên thanh tự động bắn zombie' : kind === 'dai-bac' ? 'gọi pháo kích ba quả' : 'gọi mưa đạn khắp chiến trường';
      say(`Cảm ơn ${spoken(v.name)} đã tặng ${giftName}, ${what}!`, { tag:'gift', id });
    }
  }

  let fillTimers = [];
  function fill(n){
    fillTimers.forEach(clearTimeout); fillTimers = [];
    for (let i = 0; i < n; i++){
      const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ' ' + (Math.floor(i / DEMO_NAMES.length) + 1) : '');
      fillTimers.push(setTimeout(() => plant('demo_' + i, name, '', { kick: false, demo: true }), i * 120));
    }
    addLog(`Trồng ${n} cây mẫu`);
  }
  function clear(){
    fillTimers.forEach(clearTimeout); fillTimers = [];
    people.clear(); scores.clear(); zombies.clear(); turrets.clear(); state.level = 1; state.phase = 'wait';
    broadcast(snapshot()); addLog('Đã dọn sạch vườn, về màn 1');
  }

  return {
    overlay: '/live/zombie.html',
    defaultChat: '2',
    defaults: {
      title: 'Vườn Chống Zombie', subtitle: 'Nhấp liên tục vào màn hình để bắn zombie',
      voice: 'vi-VN-NamMinhNeural', pitch: 0, rate: 5,
      music: true, joinOnEnter: true, voiceGifts: true, maxPlants: 30,
      autoWilt: true, wiltMin: 3, uprootMin: 2,   // quiet → wilts → pulled out (TikTok has no 'left the live' event)
    },
    rules: { joinOnEnter: Boolean, voiceGifts: Boolean, autoWilt: Boolean, maxPlants: v => clamp(v, 10, 30), wiltMin: v => clamp(v, 1, 30), uprootMin: v => clamp(v, 1, 30) },
    botLines: ['1', '2', '3', 'Bắn đi anh em', 'Zombie tới kìa', 'Giữ hàng rào!', 'Thả tim nhiều vào'],
    people,
    snapshot: () => ({ viewers: [...people.values()].map(pub), cap: cap(), game: pub2(), ...boards(), giftMap: giftMap.rules(),
      zombies: [...zombies.values()].map(z => ({ id: z.id, kind: z.kind, x: Math.round(z.x), y: Math.round(z.y), hp: Math.round(z.hp), maxHp: z.maxHp })), turrets: turretList() }),
    settingsExtra: () => ({ cap: cap() }),
    start: () => { giftMap.start(); last = Date.now(); clearInterval(loop); loop = setInterval(tick, 100); },
    stop: () => { giftMap.stop(); clearInterval(loop); fillTimers.forEach(clearTimeout); },
    onSettings: () => { while (people.size > cap()){ const q = [...people.values()].sort((a, b) => a.lastAt - b.lastAt)[0]; people.delete(q.id); broadcast({ t:'kick', id: q.id }); } },
    onCatalog: () => { giftMap.send(); giftMap.prefetch(); },
    chat, gift, like, member, follow, fill, clear,
    botGift: big => { const all = giftMap.rules().flatMap(r => r.gifts).filter(g => g.price > 0 && (big ? g.price >= 99 : g.price < 99)); const g = all.length ? pick(all) : null; return g && [g.name, g.price]; },
    join: (id, name, opts) => plant(id, name, '', { kick: false, demo: opts?.demo }),
    leave: id => { people.delete(id); broadcast({ t:'leave', id }); if (!people.size && state.phase === 'play'){ zombies.clear(); state.phase = 'wait'; sendState(); } },
    commands: { follow: m => follow('sim_' + String(m.name || 'Khách').slice(0, 18), String(m.name || 'Khách').slice(0, 18), ''), nuke: () => { const v = [...people.values()][0]; if (v) nuke(v); },
      level: m => { state.level = clamp(m.n, 1, 99); zombies.clear(); startLevel(); broadcast(snapshot()); },   // testing: jump to a level
      turret: () => { const v = [...people.values()].find(p => !turrets.size || ![...turrets.values()].some(t => t.owner === p.id)) || [...people.values()][0]; if (v) addTurret(v, 1); } },
  };
}
