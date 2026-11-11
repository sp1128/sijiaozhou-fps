'use strict';
/*
 * 四角洲 多人对战房间服务器
 *   - 同一个端口：HTTP 提供游戏页面（public/index.html），WebSocket（/ws）负责房间与对战中继。
 *   - 服务器只管房间、计分、对局计时和消息转发；位置、命中由客户端计算（适合朋友之间开黑，不防作弊）。
 *
 *   启动：  npm install && node server.js
 *   环境变量： PORT（默认 8080） HOST（默认 0.0.0.0） GAME_FILE（游戏 html 路径，默认 public/index.html）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const arg = name => { const a = process.argv.find(x => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : undefined; };
const PORT = +(arg('port') || process.env.PORT) || 8080;   // 也可以用命令行参数：node server.js --port=9000
const HOST = arg('host') || process.env.HOST || '0.0.0.0';
const GAME_FILE = process.env.GAME_FILE ||
  [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, '..', 'game_v2.html')].find(f => fs.existsSync(f)) ||
  path.join(__dirname, 'public', 'index.html');

const MAX_ROOMS = 200;
const MAX_PLAYERS = 10;
const END_SCREEN_MS = 12000;
const MODES = ['ffa', 'tdm'];

/* ------------------------------------------------------------------ static page */
let page = { mtime: 0, raw: null, gz: null };
function loadPage() {
  try {
    const st = fs.statSync(GAME_FILE);
    if (st.mtimeMs !== page.mtime) {
      const raw = fs.readFileSync(GAME_FILE);
      page = { mtime: st.mtimeMs, raw, gz: zlib.gzipSync(raw, { level: 6 }) };
      console.log(`[http] 已加载游戏页面 ${GAME_FILE} (${(raw.length / 1e6).toFixed(2)} MB, gzip ${(page.gz.length / 1e6).toFixed(2)} MB)`);
    }
  } catch (e) {
    if (page.raw) return;
    page = { mtime: 0, raw: null, gz: null };
  }
}
loadPage();

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    loadPage();
    if (!page.raw) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('找不到游戏页面：请把构建好的 html 放到 server/public/index.html');
      return;
    }
    const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...(gz ? { 'Content-Encoding': 'gzip' } : {}),
    });
    res.end(gz ? page.gz : page.raw);
    return;
  }
  if (url === '/health') {
    let players = 0;
    for (const r of rooms.values()) players += r.players.size;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players, online: conns.size, uptime: Math.round(process.uptime()) }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

/* ------------------------------------------------------------------ state */
const rooms = new Map(); // code -> room
const conns = new Set();
let nextId = 1;

const int = (v, lo, hi, def) => { v = Math.round(+v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
const cleanText = (s, max, def) => {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = Array.from(s).slice(0, max).join('');
  return s || def;
};
const vec3 = a => Array.isArray(a) && a.length === 3 && a.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e4);

function send(c, obj) {
  if (c.ws.readyState === 1) c.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}
function broadcast(room, obj, except) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
/** high-rate relays are dropped for a client whose socket is backed up instead of queueing without bound */
function relay(room, s, except) {
  for (const p of room.players.values()) {
    if (p !== except && p.ws.readyState === 1 && p.ws.bufferedAmount < 262144) p.ws.send(s);
  }
}

function normOpts(o, prev) {
  o = o && typeof o === 'object' ? o : {};
  const p = prev || { mode: 'ffa', goal: 20, mins: 8, max: 8 };
  return {
    mode: MODES.includes(o.mode) ? o.mode : p.mode,
    goal: int(o.goal, 5, 100, p.goal),
    mins: int(o.mins, 2, 30, p.mins),
    max: int(o.max, 2, MAX_PLAYERS, p.max),
  };
}

function snapshot(room) {
  return {
    code: room.code,
    title: room.title,
    host: room.host,
    state: room.state,
    opts: room.opts,
    seed: room.seed,
    left: room.state === 'playing' ? Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000)) : 0,
    ts: room.ts,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, k: p.k, d: p.d })),
  };
}
const pushRoom = room => broadcast(room, { t: 'room', room: snapshot(room) });

function newCode() {
  for (let i = 0; i < 2000; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return null;
}

function smallerTeam(room) {
  let a = 0, b = 0;
  for (const p of room.players.values()) p.team === 1 ? b++ : a++;
  return b < a ? 1 : 0;
}
function rebalance(room) {
  let i = 0;
  for (const p of room.players.values()) p.team = room.opts.mode === 'tdm' ? i++ % 2 : 0;
}

function joinRoom(c, room) {
  c.room = room;
  c.k = 0; c.d = 0; c.lastDeath = 0;
  c.team = room.opts.mode === 'tdm' ? smallerTeam(room) : 0;
  room.players.set(c.id, c);
  pushRoom(room);
  console.log(`[room ${room.code}] + ${c.name} (${room.players.size}/${room.opts.max})`);
}

function leaveRoom(c) {
  const room = c.room;
  if (!room) return;
  c.room = null;
  room.players.delete(c.id);
  console.log(`[room ${room.code}] - ${c.name} (${room.players.size}/${room.opts.max})`);
  if (!room.players.size) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    console.log(`[room ${room.code}] 已关闭`);
    return;
  }
  if (room.host === c.id) room.host = room.players.keys().next().value;
  pushRoom(room);
}

function startMatch(room) {
  clearTimeout(room.timer);
  room.state = 'playing';
  room.seed = Math.floor(Math.random() * 1e6);
  room.ts = [0, 0];
  room.endsAt = Date.now() + room.opts.mins * 60000;
  if (room.opts.mode !== 'tdm') for (const p of room.players.values()) p.team = 0;
  for (const p of room.players.values()) { p.k = 0; p.d = 0; p.lastDeath = 0; }
  room.timer = setTimeout(() => endMatch(room, 'time'), room.opts.mins * 60000);
  broadcast(room, { t: 'start', room: snapshot(room) });
  console.log(`[room ${room.code}] 开始对局 ${room.opts.mode} 目标 ${room.opts.goal} 时长 ${room.opts.mins} 分钟`);
}

function endMatch(room, reason) {
  if (room.state !== 'playing') return;
  clearTimeout(room.timer);
  room.state = 'ended';
  let win = -1;
  if (room.opts.mode === 'tdm') {
    win = room.ts[0] === room.ts[1] ? -1 : room.ts[0] > room.ts[1] ? 0 : 1;
  } else {
    const top = [...room.players.values()].sort((a, b) => b.k - a.k || a.d - b.d);
    win = top.length && top[0].k > 0 && !(top[1] && top[1].k === top[0].k && top[1].d === top[0].d) ? top[0].id : -1;
  }
  broadcast(room, { t: 'end', room: snapshot(room), win, reason });
  console.log(`[room ${room.code}] 对局结束 (${reason})`);
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.state = 'lobby';
    pushRoom(room);
  }, END_SCREEN_MS);
}

/* ------------------------------------------------------------------ messages */
function onMessage(c, m) {
  const room = c.room;
  switch (m.t) {
    /* ---- high rate, in-match ---- */
    case 's': {
      if (!room || room.state !== 'playing') return;
      const d = m.d;
      if (!Array.isArray(d) || d.length < 6 || d.length > 8 || !d.every(n => typeof n === 'number' && Number.isFinite(n))) return;
      relay(room, '{"t":"s","i":' + c.id + ',"d":' + JSON.stringify(d) + '}', c);
      return;
    }
    case 'f': {
      if (!room || room.state !== 'playing' || !vec3(m.o) || !vec3(m.e)) return;
      relay(room, JSON.stringify({ t: 'f', i: c.id, o: m.o, e: m.e }), c);
      return;
    }
    case 'n': {
      if (!room || room.state !== 'playing' || !vec3(m.p) || !vec3(m.v)) return;
      relay(room, JSON.stringify({ t: 'n', i: c.id, p: m.p, v: m.v }), c);
      return;
    }
    case 'h': { // "I hit player `to`" — the victim's client applies it and reports its own death
      if (!room || room.state !== 'playing') return;
      const to = room.players.get(m.to);
      if (!to || to === c) return;
      if (room.opts.mode === 'tdm' && to.team === c.team) return;
      const dmg = +m.dmg;
      if (!(dmg > 0) || dmg > 400) return;
      send(to, { t: 'h', by: c.id, dmg: Math.round(dmg), k: int(m.k, 0, 3, 0), p: vec3(m.p) ? m.p : null });
      return;
    }
    case 'd': { // "I died"
      if (!room || room.state !== 'playing') return;
      const now = Date.now();
      if (now - c.lastDeath < 1500) return;
      c.lastDeath = now;
      c.d++;
      let by = room.players.get(m.by);
      if (!by || by === c || (room.opts.mode === 'tdm' && by.team === c.team)) by = null;
      if (by) {
        by.k++;
        if (room.opts.mode === 'tdm') room.ts[by.team]++;
      }
      broadcast(room, {
        t: 'k', by: by ? by.id : c.id, to: c.id, k: int(m.k, 0, 4, 0),
        sc: [...room.players.values()].map(p => [p.id, p.k, p.d]), ts: room.ts,
      });
      if (by && (room.opts.mode === 'tdm' ? room.ts[by.team] : by.k) >= room.opts.goal) endMatch(room, 'goal');
      return;
    }
    case 'ping':
      send(c, { t: 'pong', c: +m.c || 0 });
      return;

    /* ---- lobby ---- */
    case 'hello':
      c.name = cleanText(m.name, 12, '队员' + c.id);
      send(c, { t: 'welcome', id: c.id, name: c.name });
      if (room) pushRoom(room);
      return;
    case 'list': {
      const list = [];
      for (const r of rooms.values()) {
        list.push({ code: r.code, title: r.title, mode: r.opts.mode, n: r.players.size, max: r.opts.max, state: r.state });
        if (list.length >= 60) break;
      }
      send(c, { t: 'rooms', list });
      return;
    }
    case 'create': {
      if (room) leaveRoom(c);
      if (rooms.size >= MAX_ROOMS) return send(c, { t: 'err', msg: '服务器房间已满，请稍后再试' });
      const code = newCode();
      if (!code) return send(c, { t: 'err', msg: '无法创建房间，请重试' });
      const r = {
        code, title: cleanText(m.title, 16, c.name + ' 的房间'), host: c.id, state: 'lobby',
        opts: normOpts(m.opts), players: new Map(), ts: [0, 0], endsAt: 0, seed: 0, timer: null,
      };
      rooms.set(code, r);
      console.log(`[room ${code}] 由 ${c.name} 创建`);
      joinRoom(c, r);
      return;
    }
    case 'join': {
      const r = rooms.get(String(m.code || '').trim());
      if (!r) return send(c, { t: 'err', msg: '房间不存在，请检查房间号' });
      if (r === room) return send(c, { t: 'room', room: snapshot(r) });
      if (r.players.size >= r.opts.max) return send(c, { t: 'err', msg: '房间已满' });
      if (room) leaveRoom(c);
      joinRoom(c, r);
      return;
    }
    case 'leave':
      leaveRoom(c);
      send(c, { t: 'left' });
      return;
    case 'opts': {
      if (!room || room.host !== c.id || room.state !== 'lobby') return;
      const mode = room.opts.mode;
      room.opts = normOpts(m.opts, room.opts);
      room.opts.max = Math.max(room.opts.max, room.players.size);
      if (room.opts.mode !== mode) rebalance(room);
      pushRoom(room);
      return;
    }
    case 'team': {
      if (!room || room.state !== 'lobby' || room.opts.mode !== 'tdm') return;
      c.team = m.team === 1 ? 1 : 0;
      pushRoom(room);
      return;
    }
    case 'start':
      if (!room || room.host !== c.id || room.state !== 'lobby') return;
      startMatch(room);
      return;
    case 'stop':
      if (!room || room.host !== c.id) return;
      endMatch(room, 'host');
      return;
  }
}

/* ------------------------------------------------------------------ sockets */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });

wss.on('connection', (ws, req) => {
  const c = {
    id: nextId++, ws, name: '', room: null, team: 0, k: 0, d: 0, lastDeath: 0,
    alive: true, win: 0, count: 0,
  };
  c.name = '队员' + c.id;
  conns.add(c);
  try { ws._socket && ws._socket.setNoDelay(true); } catch (e) { /* ignore */ }

  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    // crude flood guard: at most 150 messages per second per connection
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== c.win) { c.win = sec; c.count = 0; }
    if (++c.count > 150) return;
    let m;
    try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    try { onMessage(c, m); } catch (e) { console.error('[ws] handler error', e); }
  });
  ws.on('close', () => { conns.delete(c); leaveRoom(c); });
  ws.on('error', () => { /* close follows */ });
});

setInterval(() => {
  for (const c of conns) {
    if (!c.alive) { try { c.ws.terminate(); } catch (e) { /* ignore */ } continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) { /* ignore */ }
  }
}, 20000).unref();

server.listen(PORT, HOST, () => {
  console.log(`四角洲服务器已启动： http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/   (WebSocket: /ws)`);
  if (!page.raw) console.log('[http] 警告：未找到游戏页面 ' + GAME_FILE);
});
