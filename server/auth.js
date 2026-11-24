// Contas, sessões e saves
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { q } from './db.js';

const scrypt = promisify(scryptCb);
const SESSION_DAYS = 30;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const buf = await scrypt(password, salt, 64);
  return { hash: buf.toString('hex'), salt };
}

function validate(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Nome de usuário deve ter 3 a 16 caracteres (letras, números ou _).');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new HttpError(400, 'A senha deve ter pelo menos 6 caracteres.');
  }
}

export async function register(username, password) {
  validate(username, password);
  if (q.userByName.get(username)) throw new HttpError(409, 'Esse nome de usuário já existe.');
  const { hash, salt } = await hashPassword(password);
  const { lastInsertRowid } = q.insertUser.run(username, hash, salt, Date.now());
  return { id: Number(lastInsertRowid), username };
}

export async function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Preencha usuário e senha.');
  const u = q.userByName.get(username);
  // compara mesmo quando o usuário não existe, pra não vazar quais nomes existem pelo tempo de resposta
  const { hash } = await hashPassword(password, u?.salt ?? 'x'.repeat(32));
  const ok = u && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.pass_hash, 'hex'));
  if (!ok) throw new HttpError(401, 'Usuário ou senha incorretos.');
  q.touchLogin.run(Date.now(), u.id);
  return { id: u.id, username: u.username };
}

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  q.insertSession.run(token, userId, Date.now() + SESSION_DAYS * 86400_000);
  return token;
}

export function userFromToken(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const row = q.sessionUser.get(token, Date.now());
  return row ? { id: row.id, username: row.username } : null;
}

export function logout(token) { if (typeof token === 'string') q.deleteSession.run(token); }
export function purgeExpiredSessions() { q.purgeSessions.run(Date.now()); }

// ---------- Saves ----------
const int = (v, min, max, def) => (Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def);
const num = (v, min, max, def) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def);
const ID_RE = /^[a-z0-9_]{1,32}$/;

/** Aceita só os campos conhecidos, com tipos e limites. (Não é anti-cheat: o cliente ainda manda o progresso.) */
export function sanitizeSave(d) {
  if (!d || typeof d !== 'object') return null;
  const inv = {};
  if (d.inv && typeof d.inv === 'object') {
    for (const [k, v] of Object.entries(d.inv).slice(0, 60)) if (ID_RE.test(k)) { const n = int(v, 0, 9999, 0); if (n > 0) inv[k] = n; }
  }
  const quest = d.quest && typeof d.quest === 'object' ? {
    idx: int(d.quest.idx, 0, 100, 0),
    status: ['available', 'active', 'complete', 'done'].includes(d.quest.status) ? d.quest.status : 'available',
    progress: int(d.quest.progress, 0, 1000, 0),
  } : undefined;
  const maxHp = int(d.maxHp, 1, 100000, 100);
  return {
    level: int(d.level, 1, 999, 1),
    xp: int(d.xp, 0, 1e9, 0),
    gold: int(d.gold, 0, 1e9, 0),
    maxHp,
    hp: int(d.hp, 0, maxHp, maxHp),
    kills: int(d.kills, 0, 1e9, 0),
    inv,
    equipped: typeof d.equipped === 'string' && ID_RE.test(d.equipped) ? d.equipped : 'wood_sword',
    armor: typeof d.armor === 'string' && ID_RE.test(d.armor) && inv[d.armor] ? d.armor : null,
    helmet: typeof d.helmet === 'string' && ID_RE.test(d.helmet) && inv[d.helmet] ? d.helmet : null,
    quest,
    pos: Array.isArray(d.pos) ? [num(d.pos[0], -200, 200, 0), 0, num(d.pos[2], -200, 200, 8)] : [0, 0, 8],
  };
}

export function loadCharacter(userId) {
  const row = q.getCharacter.get(userId);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

export function saveCharacter(userId, data) {
  const clean = sanitizeSave(data);
  if (!clean) return false;
  q.upsertCharacter.run(userId, JSON.stringify(clean), Date.now());
  return true;
}
