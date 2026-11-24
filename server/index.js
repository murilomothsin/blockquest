// Servidor do BlockQuest: API de contas (HTTP) + mundo compartilhado (WebSocket) + arquivos do jogo (dist/)
import http from 'node:http';
import { dungeonAt } from '../src/shared/worldData.js';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  HttpError, register, login, createSession, userFromToken, logout, loadCharacter, purgeExpiredSessions,
} from './auth.js';
import { createGame } from './game.js';
import { runCommand, CLOSE } from './commands.js';
import { checkChat, report } from './moderation.js';
import { q } from './db.js';
import { publicCharacter } from '../src/shared/progress.js';

const PORT = Number(process.env.PORT) || 3001;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TICK_MS = 100; // snapshots dos jogadores 10x por segundo

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

/** personagem atual: da memória se estiver online, senão do banco */
const charFor = (id) => publicCharacter(players.get(id)?.c || loadCharacter(id));

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'POST /api/register': {
      rateLimit(req);
      const { username, password } = await readJson(req);
      const user = await register(username, password);
      return sendJson(res, 201, { token: createSession(user.id), user, save: charFor(user.id) });
    }
    case 'POST /api/login': {
      rateLimit(req);
      const { username, password } = await readJson(req);
      const user = await login(username, password);
      return sendJson(res, 200, { token: createSession(user.id), user, save: charFor(user.id) });
    }
    case 'GET /api/me': {
      const user = userFromToken(bearer(req));
      if (!user) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
      if (user.ban) throw new HttpError(403, user.ban);
      const { ban, ...pub } = user;
      return sendJson(res, 200, { user: pub, save: charFor(user.id) });
    }
    case 'POST /api/logout': {
      logout(bearer(req));
      return sendJson(res, 200, { ok: true });
    }
    case 'GET /api/online': {
      return sendJson(res, 200, { count: players.size, players: [...players.values()].map((p) => ({ name: p.name, role: p.role })) });
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
/** userId → sessão { id, name, role, ws, state, c, loot, god, lastChat, ... } */
const players = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, exceptId = null) => {
  const data = JSON.stringify(msg);
  for (const p of players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
};
const game = createGame({ players, send });
const findOnline = (name) => [...players.values()].find((p) => p.name.toLowerCase() === String(name).toLowerCase());

const f = (v, lim = 1e4) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
/** só posição e animação vêm do cliente; arma/vida/nível o servidor preenche (game.handleState) */
const cleanState = (m) => ({
  x: f(m.x, 1000), y: f(m.y, 100), z: f(m.z, 1000), // mina, torre e casa ficam em x 400–690 (fora do mapa visível) r: f(m.r, 100), m: f(m.m, 1), air: !!m.air, s: Math.trunc(f(m.s, 1e9)),
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let me = null;

  ws.on('message', (raw) => {
    try { onMessage(raw); } catch (e) { console.error(`[ws] erro tratando mensagem de ${me?.name || '?'}:`, e); }
  });
  const onMessage = (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (!me) {
      if (msg.t !== 'hello') return;
      const user = userFromToken(msg.token);
      if (!user) { send(ws, { t: 'error', code: 'auth', message: 'Sessão inválida.' }); return ws.close(4003, 'auth'); }
      if (user.ban) { send(ws, { t: 'kicked', banned: true, message: user.ban }); return ws.close(CLOSE.banned, 'ban'); }
      // mesma conta entrou de novo: derruba a conexão antiga e continua o MESMO personagem
      const old = players.get(user.id);
      if (old) { send(old.ws, { t: 'kicked', message: 'Sua conta entrou em outro lugar.' }); old.ws.close(4001, 'dup'); players.delete(user.id); }
      me = {
        id: user.id, name: user.username, role: user.role, ws, state: null, lastChat: 0,
        c: old?.c || loadCharacter(user.id), loot: old?.loot, god: old?.god || false,
      };
      players.set(me.id, me);
      const loot = game.join(me);
      send(ws, {
        t: 'welcome', id: me.id, name: me.name, role: me.role,
        c: { ...publicCharacter(me.c), dead: !!me.c.dead }, loot,
        players: [...players.values()].filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name, role: p.role, ...(p.region === 'home' ? {} : p.state) })),
      });
      broadcast({ t: 'join', id: me.id, name: me.name, role: me.role }, me.id);
      console.log(`[+] ${me.name}${me.role !== 'player' ? ` (${me.role})` : ''} entrou (${players.size} online)`);
      return;
    }

    switch (msg.t) {
      case 'state': game.handleState(me, cleanState(msg)); break;
      case 'hit': game.handleHit(me, msg); break;
      case 'act': game.handleAct(me, msg); break;
      case 'skill': game.handleSkill(me, msg); break;
      case 'chat': {
        const raw = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const now = Date.now();
        if (!raw || now - me.lastChat < 500) return;
        me.lastChat = now;
        const to = typeof msg.to === 'string' && msg.to ? msg.to.slice(0, 16) : null;
        const r = checkChat(me, raw, to);
        if (r.blocked) return send(ws, { t: 'sys', text: r.blocked });
        if (r.notice) send(ws, { t: 'sys', text: r.notice });
        if (to) { // mensagem privada (sussurro)
          const target = findOnline(to);
          if (!target) return send(ws, { t: 'sys', text: `${to} não está online.` });
          if (target.id === me.id) return send(ws, { t: 'sys', text: 'Você não pode sussurrar para si mesmo.' });
          const out = { t: 'whisper', id: me.id, from: me.name, role: me.role, toId: target.id, to: target.name, text: r.text };
          send(target.ws, out);
          send(ws, out);
          return;
        }
        broadcast({ t: 'chat', id: me.id, from: me.name, role: me.role, text: r.text });
        break;
      }
      case 'cmd': { // comandos da equipe (o servidor confere o cargo)
        const cmd = String(msg.cmd ?? '').toLowerCase().slice(0, 20);
        const args = Array.isArray(msg.args) ? msg.args.slice(0, 20).map((a) => String(a).slice(0, 200)) : [];
        if (!runCommand(me, cmd, args, { players, send, broadcast, game })) send(ws, { t: 'sys', text: 'Comando desconhecido. Digite /ajuda' });
        break;
      }
      case 'report': {
        const name = String(msg.name ?? '').slice(0, 16);
        const note = String(msg.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
        const p = findOnline(name);
        const u = !p && q.userByName.get(name);
        const target = p ? { id: p.id, name: p.name } : u ? { id: u.id, name: u.username } : null;
        send(ws, { t: 'sys', text: target ? report(me, target, msg.reason, note) : `Jogador "${name}" não encontrado.` });
        break;
      }
      default: break; // 'save' do cliente não existe mais: o progresso é do servidor
    }
  };

  ws.on('close', () => {
    if (me && players.get(me.id)?.ws === ws) {
      try { game.leave(me); } catch (e) { console.error('[ws] erro ao sair:', e); }
      players.delete(me.id);
      broadcast({ t: 'leave', id: me.id, name: me.name });
      console.log(`[-] ${me.name} saiu (${players.size} online)`);
    }
  });
});

// snapshot com a posição de todo mundo. Quem está dentro de casa some para os outros (e não vê ninguém):
// a casa é um interior privado, todo mundo usa o mesmo lugar do mapa mas cada um só vê a si mesmo.
// Cada um recebe só quem está perto (até SNAP_VIEW m e na mesma dungeon/andar): antes todo mundo recebia
// todo mundo, 10x por segundo (com 100 jogadores = ~30 MB/s de saída). O cliente esconde quem parou de chegar.
const SNAP_VIEW = 120;
setInterval(() => {
  if (players.size < 2) return;
  const list = [];
  for (const p of players.values()) {
    if (!p.state || p.region === 'home') continue;
    list.push({ p, area: dungeonAt(p.state.x, p.state.z)?.id || 'world', msg: { id: p.id, ...p.state } });
  }
  for (const me of list) {
    if (me.p.ws.readyState !== 1) continue;
    const near = [];
    for (const o of list) {
      if (o === me || o.area !== me.area) continue;
      const dx = o.p.state.x - me.p.state.x, dz = o.p.state.z - me.p.state.z;
      if (dx * dx + dz * dz < SNAP_VIEW * SNAP_VIEW) near.push(o.msg);
    }
    if (!near.length && me.p.emptySnap) continue; // ninguém por perto: manda a lista vazia uma vez só
    me.p.emptySnap = !near.length;
    me.p.ws.send(JSON.stringify({ t: 'snap', players: near }));
  }
}, TICK_MS);

// derruba conexões mortas e limpa sessões vencidas
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 30_000);
setInterval(purgeExpiredSessions, 60 * 60_000);
purgeExpiredSessions();

// salva todo mundo antes de desligar (inclusive no restart do --watch)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { game.stop(); process.exit(0); });

server.listen(PORT, () => console.log(`BlockQuest server em http://localhost:${PORT} (API /api, WebSocket /ws)`));
