// Servidor do BlockQuest: API de contas (HTTP) + mundo compartilhado (WebSocket) + arquivos do jogo (dist/)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  HttpError, register, login, createSession, userFromToken, logout,
  loadCharacter, saveCharacter, purgeExpiredSessions,
} from './auth.js';
import { createGame } from './game.js';
import { filterText } from './filter.js';
import { q } from './db.js';

// moderação do chat
const STRIKES_TO_MUTE = 3; // palavrões dentro da janela → silêncio
const STRIKE_WINDOW = 60e3;
const MUTE_MS = 60e3;
const HISTORY = 20; // últimas mensagens por jogador (anexadas às denúncias)
const REPORT_REASONS = ['ofensa', 'assedio', 'spam', 'trapaca', 'nome', 'outro'];
const histories = new Map(); // userId → [{at, to, text}] (fica na memória mesmo depois que o jogador sai)

const PORT = Number(process.env.PORT) || 3001;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TICK_MS = 100; // snapshots 10x por segundo

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon' };

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function readJson(req, limit = 16_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'Requisição grande demais.'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'JSON inválido.'); }
}

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

// limite simples de tentativas de login/cadastro por IP
const attempts = new Map();
function rateLimit(req, max = 20, windowMs = 10 * 60_000) {
  const ip = req.socket.remoteAddress || '?';
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) { attempts.set(ip, { n: 1, reset: now + windowMs }); return; }
  if (++a.n > max) throw new HttpError(429, 'Muitas tentativas. Espere alguns minutos.');
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'POST /api/register': {
      rateLimit(req);
      const { username, password } = await readJson(req);
      const user = await register(username, password);
      return sendJson(res, 201, { token: createSession(user.id), user, save: null });
    }
    case 'POST /api/login': {
      rateLimit(req);
      const { username, password } = await readJson(req);
      const user = await login(username, password);
      return sendJson(res, 200, { token: createSession(user.id), user, save: loadCharacter(user.id) });
    }
    case 'GET /api/me': {
      const user = userFromToken(bearer(req));
      if (!user) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
      return sendJson(res, 200, { user, save: loadCharacter(user.id) });
    }
    case 'POST /api/logout': {
      logout(bearer(req));
      return sendJson(res, 200, { ok: true });
    }
    case 'GET /api/online': {
      return sendJson(res, 200, { count: players.size, players: [...players.values()].map((p) => p.name) });
    }
    default: throw new HttpError(404, 'Rota não encontrada.');
  }
}

async function serveStatic(req, res, url) {
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch { file = join(DIST, 'index.html'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build não encontrado. Rode "npm run build" ou use "npm run dev" para desenvolvimento.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    return sendJson(res, 500, { error: 'Erro interno do servidor.' });
  }
});

// ---------- Mundo compartilhado (WebSocket) ----------
/** userId -> { id, name, ws, state, lastChat } */
const players = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, exceptId = null) => {
  const data = JSON.stringify(msg);
  for (const p of players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
};
const game = createGame({ players, send });

const f = (v, lim = 1e4) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
function cleanState(m) {
  return {
    x: f(m.x, 300), y: f(m.y, 100), z: f(m.z, 300), r: f(m.r, 100),
    m: f(m.m, 1), air: !!m.air, d: !!m.d, s: Math.trunc(f(m.s, 1e9)),
    w: typeof m.w === 'string' && /^[a-z0-9_]{1,32}$/.test(m.w) ? m.w : 'wood_sword',
    a: typeof m.a === 'string' && /^[a-z0-9_]{1,32}$/.test(m.a) ? m.a : '',
    hm: typeof m.hm === 'string' && /^[a-z0-9_]{1,32}$/.test(m.hm) ? m.hm : '',
    hp: f(m.hp, 1e6), mhp: f(m.mhp, 1e6), lv: Math.trunc(f(m.lv, 999)),
  };
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let me = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (!me) {
      if (msg.t !== 'hello') return;
      const user = userFromToken(msg.token);
      if (!user) { send(ws, { t: 'error', code: 'auth', message: 'Sessão inválida.' }); return ws.close(4003, 'auth'); }
      // mesma conta entrou de novo: derruba a conexão antiga
      const old = players.get(user.id);
      if (old) { send(old.ws, { t: 'kicked', message: 'Sua conta entrou em outro lugar.' }); old.ws.close(4001, 'dup'); players.delete(user.id); }
      if (!histories.has(user.id)) histories.set(user.id, []);
      me = { id: user.id, name: user.username, ws, state: null, lastChat: 0, history: histories.get(user.id), strikes: [], mutedUntil: old?.mutedUntil || 0 };
      players.set(me.id, me);
      send(ws, {
        t: 'welcome', id: me.id, name: me.name,
        players: [...players.values()].filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name, ...p.state })),
      });
      broadcast({ t: 'join', id: me.id, name: me.name }, me.id);
      console.log(`[+] ${me.name} entrou (${players.size} online)`);
      return;
    }

    switch (msg.t) {
      case 'state': me.state = cleanState(msg); break;
      case 'chat': {
        let text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const now = Date.now();
        if (!text || now - me.lastChat < 500) return;
        me.lastChat = now;
        if (me.mutedUntil > now) {
          send(ws, { t: 'sys', text: `🔇 Você está silenciado por linguagem ofensiva. Aguarde ${Math.ceil((me.mutedUntil - now) / 1000)} s.` });
          return;
        }
        // filtro de palavrões; quem insiste leva silêncio temporário
        const f = filterText(text);
        text = f.text;
        if (f.hits) {
          me.strikes = (me.strikes || []).filter((t) => now - t < STRIKE_WINDOW);
          for (let i = 0; i < f.hits; i++) me.strikes.push(now);
          if (me.strikes.length >= STRIKES_TO_MUTE) {
            me.mutedUntil = now + MUTE_MS;
            me.strikes = [];
            send(ws, { t: 'sys', text: `🔇 Você foi silenciado por ${MUTE_MS / 1000} s por linguagem ofensiva.` });
          }
        }
        // histórico curto (servidor) usado como prova nas denúncias
        const to = typeof msg.to === 'string' && msg.to ? msg.to.slice(0, 16) : null;
        me.history.push({ at: now, to, text: String(msg.text ?? '').slice(0, 200) });
        if (me.history.length > HISTORY) me.history.shift();
        if (to) { // mensagem privada (sussurro)
          const target = [...players.values()].find((p) => p.name.toLowerCase() === to.toLowerCase());
          if (!target) { send(ws, { t: 'sys', text: `${to} não está online.` }); return; }
          if (target.id === me.id) { send(ws, { t: 'sys', text: 'Você não pode sussurrar para si mesmo.' }); return; }
          const out = { t: 'whisper', id: me.id, from: me.name, toId: target.id, to: target.name, text };
          send(target.ws, out);
          send(ws, out);
          return;
        }
        broadcast({ t: 'chat', id: me.id, from: me.name, text });
        break;
      }
      case 'save': saveCharacter(me.id, msg.data); break;
      case 'hit': game.handleHit(me, msg); break;
      case 'report': {
        const reply = (text) => send(ws, { t: 'sys', text });
        const name = String(msg.name ?? '').slice(0, 16);
        const reason = REPORT_REASONS.includes(msg.reason) ? msg.reason : 'outro';
        const note = String(msg.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
        const target = [...players.values()].find((p) => p.name.toLowerCase() === name.toLowerCase())
          || (() => { const u = q.userByName.get(name); return u && { id: u.id, name: u.username, history: histories.get(u.id) || [] }; })();
        if (!target) return reply(`Jogador "${name}" não encontrado.`);
        if (target.id === me.id) return reply('Você não pode denunciar a si mesmo.');
        const now = Date.now();
        if (q.recentReport.get(me.id, target.id, now - 10 * 60e3).n) return reply(`Você já denunciou ${target.name} há pouco. Nossa equipe vai analisar.`);
        if (q.reportsBy.get(me.id, now - 60 * 60e3).n >= 10) return reply('Limite de denúncias por hora atingido. Tente mais tarde.');
        const evidence = JSON.stringify({ note, messages: target.history || [] });
        q.insertReport.run(me.id, target.id, reason, evidence, now);
        console.log(`[denúncia] ${me.name} → ${target.name} (${reason})`);
        reply(`✅ Denúncia de ${target.name} enviada. Obrigado! As mensagens recentes foram anexadas como prova.`);
        break;
      }
      default: break;
    }
  });

  ws.on('close', () => {
    if (me && players.get(me.id)?.ws === ws) {
      players.delete(me.id);
      broadcast({ t: 'leave', id: me.id, name: me.name });
      console.log(`[-] ${me.name} saiu (${players.size} online)`);
    }
  });
});

// snapshot com a posição de todo mundo
setInterval(() => {
  if (players.size < 2) return;
  const list = [];
  for (const p of players.values()) if (p.state) list.push({ id: p.id, ...p.state });
  broadcast({ t: 'snap', players: list });
}, TICK_MS);

// derruba conexões mortas e limpa sessões vencidas
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 30_000);
setInterval(purgeExpiredSessions, 60 * 60_000);
purgeExpiredSessions();

server.listen(PORT, () => console.log(`BlockQuest server em http://localhost:${PORT} (API /api, WebSocket /ws)`));
