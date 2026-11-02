// Chánh Điện Online — live server
// Runs on the streaming PC. Serves the overlay + control panel, listens to a TikTok LIVE room,
// makes Vietnamese voice lines with Edge TTS and pushes everything to the overlay over WebSocket.
// What happens on screen (cushions, lanterns, gift lines…) lives in a theme module in ./themes.
//
//   cd live && npm install
//   npm start          → Chánh Điện Tịnh Tâm (temple hall)
//   npm run hoadang    → Đêm Hoa Đăng (lantern river)
//   then open http://localhost:3000/live/control.html
//
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createGiftCatalog } from './gift-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');            // repo root: serves /assets, /live
const TTS_DIR = path.join(__dirname, 'tts');
fs.mkdirSync(TTS_DIR, { recursive: true });
for (const f of fs.readdirSync(TTS_DIR)) { try { fs.unlinkSync(path.join(TTS_DIR, f)); } catch {} }
const PORT = +process.env.PORT || 3000;

// Themes: every live/themes/<id>.mjs is one theme (see themes/chua.mjs for its shape); a new file is picked up by itself.
// The theme in use is remembered in chu-de.txt; `node server.mjs <id>` chooses one at start and the control panel can
// switch while running.
const THEME_FILE = path.join(__dirname, 'chu-de.txt');
const THEMES = new Map();
for (const f of fs.readdirSync(path.join(__dirname, 'themes')).filter(f => /^[a-z0-9-]+\.mjs$/.test(f)).sort()){
  const mod = await import(`./themes/${f}`), id = f.slice(0, -4);
  if (typeof mod.createTheme === 'function') THEMES.set(id, { id, name: mod.meta?.name || id, description: mod.meta?.description || '', createTheme: mod.createTheme });
}
let savedTheme = ''; try { savedTheme = fs.readFileSync(THEME_FILE, 'utf8').trim(); } catch {}
const START_THEME = String(process.argv[2] || process.env.THEME || (THEMES.has(savedTheme) ? savedTheme : 'chua')).toLowerCase();
if (!THEMES.has(START_THEME)) { console.error(`Không có chủ đề "${START_THEME}". Chọn một trong: ${[...THEMES.keys()].join(', ')}`); process.exit(1); }

/* ---------------------------------------------------------------- helpers */
let wss = null;
function broadcast(msg, only){ if (!wss) return; const s = JSON.stringify(msg); for (const c of wss.clients) if (c.readyState === 1 && (!only || c.role === only)) c.send(s); }
const log = [];
function addLog(s){ const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${s}`; log.push(line); if (log.length > 300) log.shift(); broadcast({ t:'log', line }, 'control'); console.log(line); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));
const pick = a => a[Math.floor(Math.random() * a.length)];
const spoken = s => String(s).replace(/[_@.]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim() || 'ẩn danh';

/* ------------------------------------------------------------------ state */
const CORE_DEFAULTS = {
  title: '', subtitle: '',
  voice: 'vi-VN-NamMinhNeural',      // or vi-VN-HoaiMyNeural
  pitch: -18,                        // Hz
  rate: -20,                         // %
  music: true,
  filterText: true,                  // hide links, phone numbers and words from tu-cam.txt
  gifts: { readAll: true, minDiamonds: 1 },
};
const settings = { ...CORE_DEFAULTS };   // one object for the whole run; switching theme refills it in place
const startedAt = Date.now();
let tiktok = null, tiktokState = { status: 'idle', uniqueId: '', error: '' };

/* ------------------------------------------------------------ text filter */
// Names and comments are shown big on stream, so links, phone numbers (ads) and listed words become ***.
// The list is live/tu-cam.txt, one word or phrase per line; edits are picked up without a restart.
const BLOCK_FILE = path.join(__dirname, 'tu-cam.txt');
let blockRe = null, blockStamp = -1, blockCheckedAt = 0;
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function loadBlocklist(){
  const now = Date.now(); if (now - blockCheckedAt < 5000) return; blockCheckedAt = now;
  let st; try { st = fs.statSync(BLOCK_FILE); } catch { blockRe = null; blockStamp = -1; return; }
  if (st.mtimeMs === blockStamp) return; blockStamp = st.mtimeMs;
  const words = fs.readFileSync(BLOCK_FILE, 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase().normalize('NFC')).filter(s => s && !s.startsWith('#'));
  blockRe = words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  addLog(`Lọc chữ: đã nạp ${words.length} từ cấm`);
}
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|vn|me|io|co|xyz|link|site|online|shop|top|info|biz|app|ly)\b(?:\/\S*)?/gi;
const PHONE_RE = /\+?\d(?:[\s.\-]{0,2}\d){7,}/g;
function cleanText(s){
  s = String(s ?? '').normalize('NFC');
  if (!settings.filterText) return s;
  loadBlocklist();
  s = s.replace(URL_RE, '***').replace(PHONE_RE, '***');
  return blockRe ? s.replace(blockRe, '***') : s;
}

/* ------------------------------------------------------------------ TTS */
// Edge "Read Aloud" is an unofficial endpoint that drops about half the requests, so each line gets 3 tries.
const ttsQueue = []; let ttsBusy = false, ttsSeq = 0;
function esc(s){ return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
function say(text, meta = {}){ if (ttsQueue.length >= 15) { addLog('Hàng đợi giọng đọc đầy, bỏ qua 1 câu'); return; } ttsQueue.push({ text: String(text).slice(0, 500), meta }); pumpTTS(); }
const signed = n => `${n >= 0 ? '+' : ''}${n}`;
async function synth(text){
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(esc(text), { pitch: `${signed(settings.pitch)}Hz`, rate: `${signed(settings.rate)}%` });
    const chunks = [];
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('quá 20 giây không có phản hồi')), 20_000);
      audioStream.on('data', c => chunks.push(c));
      audioStream.on('error', e => { clearTimeout(timer); rej(e); });
      audioStream.on('close', () => { clearTimeout(timer); res(); });
    });
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('không nhận được âm thanh');
    return buf;
  } finally { try { tts.close(); } catch {} }
}
async function pumpTTS(){
  if (ttsBusy || !ttsQueue.length) return; ttsBusy = true;
  const { text, meta } = ttsQueue.shift();
  let err = null;
  for (let attempt = 1; attempt <= 3; attempt++){
    try {
      const buf = await synth(text);
      const file = `tts_${Date.now()}_${++ttsSeq}.mp3`;
      fs.writeFileSync(path.join(TTS_DIR, file), buf);
      broadcast({ t:'tts', url: `/live/tts/${file}`, text, ...meta });
      const old = fs.readdirSync(TTS_DIR).sort(); while (old.length > 40) { try { fs.unlinkSync(path.join(TTS_DIR, old.shift())); } catch {} }
      err = null; break;
    } catch (e) { err = e; if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 600)); }
  }
  if (err) addLog('TTS lỗi sau 3 lần thử, bỏ qua câu: ' + (err?.message || err));
  ttsBusy = false; setTimeout(pumpTTS, 50);
}

/* ------------------------------------------------------------------ theme */
const DEMO_NAMES = ['Diệu Hạnh','Minh Tâm','Thiện Đức','Huệ An','Tịnh Nhã','Quảng Trí','Chơn Như','Pháp Hỷ','Nguyên Thanh','Tâm Đăng','Diệu Liên','Trí Hải','Phước Lộc','Hạnh Nguyện','Như Ý','Bảo Châu','Thanh Lương','Từ Tâm','An Lạc','Giác Hoa','Tuệ Minh','Liên Hương','Thu Hà','Ngọc Lan','Đức Anh','Hải Đăng','Mai Anh','Phương Thảo','Trung Kiên','Quang Huy','Bảo Ngọc','Diệu Linh'];
const gifts = createGiftCatalog({ dir: path.join(__dirname, 'gift-icons'), addLog });
const BOT_MAX_COINS = 10;              // a bot's total on the leaderboard never goes above this; its gifts still look normal
const ctx = { settings, broadcast, say, addLog, clamp, pick, spoken, snapshot, gifts, botMaxCoins: BOT_MAX_COINS, DEMO_NAMES };
let theme = null, themeId = '';
const settingsByTheme = {};            // switching back to a theme brings its settings back
function activateTheme(id){
  const t = THEMES.get(id); if (!t) return false;
  if (theme){ stopBots(); theme.stop?.(); settingsByTheme[themeId] = structuredClone(settings); }
  for (const k of Object.keys(settings)) delete settings[k];
  themeId = id; theme = t.createTheme(ctx);
  Object.assign(settings, structuredClone(CORE_DEFAULTS), theme.defaults, settingsByTheme[id] || {});
  try { fs.writeFileSync(THEME_FILE, id + '\n'); } catch {}
  return true;
}
const themeList = () => [...THEMES.values()].map(({ id, name, description }) => ({ id, name, description }));
function snapshot(){ return { t:'state', theme: themeId, themes: themeList(), overlay: theme.overlay, settings, startedAt, tiktok: tiktokState, ...theme.snapshot() }; }

/* ------------------------------------------------------------- events in */
const onChat = (id, name, text, avatar) => theme.chat(id, cleanText(name), cleanText(text), avatar);
const onGift = (id, name, giftName, count, diamonds, avatar, giftId, picture) => {
  if (giftId) gifts.ensureIcon(giftId, picture);              // keep a local copy of every gift picture we see
  theme.gift(id, cleanText(name), cleanText(giftName), count, diamonds, avatar, giftId, picture);
};

/* --------------------------------------------------------------- TikTok */
let TikTokLib = null;
// TikTok drops the room socket now and then in the middle of a stream. While the panel wants to be connected,
// reconnect by itself with a growing delay (5 s → 60 s) instead of going quiet; stop on "Ngắt" or when the live ends.
let wantRoom = '', retryTimer = null, retryN = 0;
function scheduleRetry(why){
  if (!wantRoom || retryTimer) return;
  const sec = Math.min(60, 5 * 2 ** retryN); retryN++;
  tiktokState = { status: 'reconnecting', uniqueId: wantRoom, error: '' }; broadcast({ t:'tiktok', ...tiktokState });
  addLog(`🔄 ${why}. Tự kết nối lại sau ${sec} giây (lần ${retryN})`);
  retryTimer = setTimeout(() => { retryTimer = null; if (wantRoom) connectTikTok(wantRoom, true); }, sec * 1000);
}
async function connectTikTok(uniqueId, auto = false){
  uniqueId = String(uniqueId || '').trim().replace(/^.*tiktok\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '');
  if (!uniqueId) return;
  if (!auto){ wantRoom = uniqueId; retryN = 0; clearTimeout(retryTimer); retryTimer = null; }
  await disconnectTikTok(true);
  tiktokState = { status: 'connecting', uniqueId, error: '' }; broadcast({ t:'tiktok', ...tiktokState });
  try {
    TikTokLib ||= await import('tiktok-live-connector');
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = TikTokLib;
    // enableExtendedGiftInfo fetches the room's gift list while connecting, which Euler Stream only signs on a paid plan
    // (the whole connect would fail). Gift events already carry name, price and picture, so it stays off.
    const conn = new TikTokLiveConnection(uniqueId, { enableExtendedGiftInfo: false, processInitialData: false });
    // tiktok-live-connector 2.5 decodes events with proto v3: chat text is `content`, a user is { id, displayId (@name),
    // nickname, avatarThumb.urlList }, a gift is `gift` { name, diamondCount, type, image }, a like batch is `count`.
    // Its README still shows the older names (comment, uniqueId, giftDetails, likeCount), so both are read.
    const img = m => m?.urlList?.[0] || m?.url?.[0] || m?.url_list?.[0] || '';
    const uid = u => String(u?.displayId || u?.uniqueId || u?.id || u?.userId || '') || 'an-danh';
    const nm = u => u?.nickname || u?.displayId || u?.uniqueId || 'ẩn danh';
    const av = u => img(u?.avatarThumb) || img(u?.avatarMedium) || img(u?.profilePicture) || '';
    conn.on(WebcastEvent.CHAT, d => onChat(uid(d.user), nm(d.user), d.content ?? d.comment, av(d.user)));
    conn.on(WebcastEvent.GIFT, d => {
      const g = d.gift || {}, det = d.giftDetails || {};
      const type = g.type ?? det.giftType ?? d.extendedGiftInfo?.type;
      if ((type === 1 || g.combo) && !d.repeatEnd) return;         // combo still running: wait for the last event, it has the full count
      const gname = g.name || det.giftName || d.extendedGiftInfo?.name || 'quà';
      const dia = g.diamondCount ?? det.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 1;
      const giftId = d.giftId || g.id, count = d.repeatCount || 1;
      onGift(uid(d.user), nm(d.user), gname, count, dia, av(d.user), giftId, img(g.image) || img(g.icon) || det.giftImage?.giftPictureUrl);
      addLog(`🎁 ${nm(d.user)} tặng ${gname} x${count} (mã ${giftId ?? '?'}, ${dia} xu)`);
    });
    conn.on(WebcastEvent.MEMBER, d => theme.member?.(uid(d.user), cleanText(nm(d.user)), av(d.user)));
    conn.on(WebcastEvent.LIKE, d => { const id = uid(d.user), n = d.count || d.likeCount || 1; theme.like?.(id, n, cleanText(nm(d.user)), av(d.user)); broadcast({ t:'like', id, n }); });
    conn.on(WebcastEvent.FOLLOW, d => theme.follow?.(uid(d.user), cleanText(nm(d.user)), av(d.user)));
    conn.on(ControlEvent.DISCONNECTED, info => {
      if (conn !== tiktok) return;                                  // a connection we closed on purpose
      tiktok = null; tiktokState = { ...tiktokState, status: 'disconnected' }; broadcast({ t:'tiktok', ...tiktokState });
      addLog(`TikTok: mất kết nối${info?.code ? ` (mã ${info.code}${info.reason ? ', ' + info.reason : ''})` : ''}`);
      scheduleRetry('Mất kết nối với phòng live');
    });
    conn.on(WebcastEvent.STREAM_END, () => { wantRoom = ''; clearTimeout(retryTimer); retryTimer = null; addLog('TikTok: buổi live đã kết thúc'); });
    conn.on(ControlEvent.ERROR, e => addLog('TikTok lỗi: ' + (e?.info || e?.message || e)));
    const st = await conn.connect();
    tiktok = conn; retryN = 0;
    tiktokState = { status: 'connected', uniqueId, error: '', roomId: st?.roomId || '' };
    addLog(`✅ Đã kết nối live @${uniqueId}`);
  } catch (e) {
    tiktokState = { status: 'error', uniqueId, error: String(e?.message || e) };
    addLog(`❌ Không kết nối được @${uniqueId}: ${tiktokState.error}`);
    if (auto) scheduleRetry('Chưa kết nối lại được');
  }
  broadcast({ t:'tiktok', ...tiktokState });
}
// keepWanted: closing only to reconnect, so the auto-reconnect target stays
async function disconnectTikTok(keepWanted = false){
  if (!keepWanted){ wantRoom = ''; clearTimeout(retryTimer); retryTimer = null; }
  const c = tiktok; tiktok = null;
  if (c){ try { await c.disconnect(); } catch {} }
  tiktokState = { status:'idle', uniqueId:'', error:'' }; broadcast({ t:'tiktok', ...tiktokState });
}

/* ------------------------------------------------------------- control */
function onControl(m){
  switch (m.cmd){
    case 'connect': connectTikTok(m.uniqueId); break;
    case 'disconnect': disconnectTikTok(); addLog('Đã ngắt kết nối TikTok'); break;
    case 'chat': { const n = String(m.name || 'Khách').slice(0, 18); onChat('sim_' + n, n, String(m.text || theme.defaultChat).slice(0, 120)); break; }
    case 'gift': { const n = String(m.name || 'Khách').slice(0, 18); onGift('sim_' + n, n, String(m.gift || 'Hoa hồng').slice(0, 30), clamp(m.count, 1, 99), clamp(m.diamonds, 1, 50000)); break; }
    case 'fill': theme.fill(clamp(m.n, 1, 100)); break;
    case 'clear': theme.clear(); break;
    case 'say': if (m.text) say(String(m.text).slice(0, 400), { tag:'say' }); break;
    case 'like': { const n = String(m.name || 'Khách').slice(0, 18), id = 'sim_' + n, c = clamp(m.n, 1, 50); theme.like?.(id, c, n, ''); broadcast({ t:'like', id, n: c }); break; }
    case 'settings':
      applySettings(m.settings || {});
      theme.onSettings?.(); broadcast({ t:'settings', settings, ...theme.settingsExtra?.() }); break;
    case 'bots': setBots(!!m.on, +m.n || 12, m.pace); break;
    case 'theme': {
      const id = String(m.id || '');
      if (id === themeId || !THEMES.has(id)) break;
      activateTheme(id); theme.start?.(); theme.onCatalog?.();
      broadcast(snapshot());                                       // overlays open the new theme's page by themselves
      addLog(`🎭 Đã chuyển sang chủ đề: ${THEMES.get(id).name}`); break;
    }
    default: if (theme.commands && Object.hasOwn(theme.commands, m.cmd)) theme.commands[m.cmd](m);
  }
}

// Only known keys, right types, sane ranges: the panel is local, but nothing from the socket is trusted blindly.
const CORE_RULES = {
  title: v => String(v).slice(0, 40), subtitle: v => String(v).slice(0, 60),
  voice: v => ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'].includes(v) ? v : settings.voice,
  pitch: v => clamp(v, -50, 50), rate: v => clamp(v, -50, 50),
  music: Boolean, filterText: Boolean,
};
function applySettings(o){ for (const [k, fn] of Object.entries({ ...CORE_RULES, ...theme.rules })) if (k in o) settings[k] = fn(o[k]); }

/* ----------------------------------------------------------------- bots */
let botTimer = null;
function stopBots(){ if (!botTimer) return; clearInterval(botTimer); botTimer = null; broadcast({ t:'bots', on: false }, 'control'); }
function setBots(on, n, pace){
  clearInterval(botTimer); botTimer = null;
  if (on){
    n = clamp(n, 1, 100);
    for (let i = 0; i < n; i++) theme.join('bot_' + i, DEMO_NAMES[(i + 7) % DEMO_NAMES.length], { demo: true });
    const every = { slow: 4000, mid: 1800, fast: 700 }[pace] || 1800;
    botTimer = setInterval(() => {
      const ids = [...theme.people.keys()].filter(id => String(id).startsWith('bot_')); if (!ids.length) return;
      const id = pick(ids), v = theme.people.get(id), r = Math.random();
      if (r < .62) onChat(id, v.name, pick(theme.botLines));
      else if (r < .9){ const n = 1 + Math.floor(Math.random() * 4); theme.like?.(id, n, v.name, ''); broadcast({ t:'like', id, n }); }
      else if (r < .91 && theme.follow) theme.follow(id, v.name, '');
      else if (r < .985){ const [g, d] = theme.botGift?.(false) || ['Hoa hồng', 1]; onGift(id, v.name, g, 1 + Math.floor(Math.random() * 3), d); }
      else { const [g, d] = theme.botGift?.(true) || ['Đèn hoa sen', 99]; onGift(id, v.name, g, 1, d); }
    }, every);
    addLog(`🤖 Bật ${n} bot, nhịp ${pace}`);
  } else {
    for (const id of [...theme.people.keys()]) if (String(id).startsWith('bot_')) theme.leave(id);
    addLog('🤖 Tắt bot');
  }
  broadcast({ t:'bots', on }, 'control');
}

/* -------------------------------------------------------------- server */
// Security notes (this file is meant to be shared publicly):
//  • listens on 127.0.0.1 only; nothing is reachable from the LAN or internet unless HOST is changed on purpose
//  • Host header must be localhost/127.0.0.1 (blocks DNS-rebinding pages from talking to the server)
//  • WebSocket only accepts pages served by this server (Origin check), so other sites open in the
//    same browser cannot send control commands
//  • static files: only /assets and /live, no dot-files, no node_modules, no server source, no path escapes
//  • no TikTok password, cookie or session is ever used or stored; only public room events are read
const HOST = process.env.HOST || '127.0.0.1';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const okHost = h => ALLOWED_HOSTS.has(String(h || '').toLowerCase());
const SEP = path.sep;
function resolveStatic(urlPath){
  let p = urlPath === '/' ? '/live/control.html' : urlPath;
  if (!/^\/(assets|live)\//.test(p)) return null;
  if (p.split('/').some(seg => seg.startsWith('.') || seg === 'node_modules')) return null;
  if (/\.(mjs|json|md|log|txt)$/i.test(p) && !p.startsWith('/assets/')) return null;      // never serve server code, package files or the word list
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + SEP)) return null;
  return file;
}
const server = http.createServer((req, res) => {
  if (!okHost(req.headers.host)) { res.writeHead(421).end('wrong host'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  let p, u; try { u = new URL(req.url, 'http://x'); p = decodeURIComponent(u.pathname); } catch { res.writeHead(400).end(); return; }
  // one address for OBS / LIVE Studio whatever the theme: it opens the current theme's overlay
  if (p === '/live/man-hinh' || p === '/live/man-hinh.html'){ res.writeHead(302, { Location: theme.overlay + u.search, 'Cache-Control': 'no-store' }).end(); return; }
  const file = resolveStatic(p);
  if (!file) { res.writeHead(404).end('not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': p.startsWith('/live/tts/') ? 'no-store' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});
wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024,
  verifyClient: ({ origin, req }) => {
    if (!okHost(req.headers.host)) return false;
    if (!origin) return true;                                   // OBS / non-browser clients send no Origin
    try { return okHost(new URL(origin).host); } catch { return false; }
  } });
wss.on('connection', (ws, req) => {
  ws.role = new URL(req.url, 'http://x').searchParams.get('role') === 'control' ? 'control' : 'overlay';
  ws.send(JSON.stringify(snapshot()));
  if (ws.role === 'control') ws.send(JSON.stringify({ t:'logs', lines: log }));
  ws.on('message', buf => {
    if (ws.role !== 'control') return;                          // overlays only listen
    try { const m = JSON.parse(buf); if (m && m.t === 'ctl') onControl(m); } catch (e) { addLog('Lệnh lỗi: ' + e.message); }
  });
});
activateTheme(START_THEME);
theme.start?.();
gifts.refresh().then(changed => changed && theme.onCatalog?.()).catch(e => addLog('Không tải được danh mục quà TikTok (dùng bản lưu nếu có): ' + (e?.message || e)));
server.listen(PORT, HOST, () => addLog(`Chủ đề: ${THEMES.get(themeId).name}  ·  Bảng điều khiển: http://localhost:${PORT}/live/control.html  ·  Màn hình cho OBS/LIVE Studio: http://localhost:${PORT}/live/man-hinh`));
