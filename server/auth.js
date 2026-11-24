// Contas, sessões, suspensões e saves
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { q } from './db.js';
import { badName } from './filter.js';
import { ROLES } from '../src/shared/roles.js';
import { normalizeCharacter, publicCharacter } from '../src/shared/progress.js';

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

const roleOk = (r) => (ROLES[r] ? r : 'player');
const toUser = (row) => ({ id: row.id, username: row.username, role: roleOk(row.role) });

/** Mensagem de suspensão, ou null se a conta está liberada */
export function banMessage(row, now = Date.now()) {
  if (!row?.banned_until || row.banned_until <= now) return null;
  const perm = row.banned_until >= 8e15;
  const until = perm ? 'permanentemente' : `até ${new Date(row.banned_until).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  return `Conta suspensa ${until}.${row.ban_reason ? ` Motivo: ${row.ban_reason}` : ''}`;
}

export async function register(username, password) {
  validate(username, password);
  if (badName(username)) throw new HttpError(400, 'Esse nome não é permitido. Escolha outro.');
  if (q.userByName.get(username)) throw new HttpError(409, 'Esse nome de usuário já existe.');
  const { hash, salt } = await hashPassword(password);
  const { lastInsertRowid } = q.insertUser.run(username, hash, salt, Date.now());
  return { id: Number(lastInsertRowid), username, role: 'player' };
}

export async function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Preencha usuário e senha.');
  const u = q.userByName.get(username);
  // compara mesmo quando o usuário não existe, pra não vazar quais nomes existem pelo tempo de resposta
  const { hash } = await hashPassword(password, u?.salt ?? 'x'.repeat(32));
  const ok = u && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.pass_hash, 'hex'));
  if (!ok) throw new HttpError(401, 'Usuário ou senha incorretos.');
  const ban = banMessage(u);
  if (ban) throw new HttpError(403, ban);
  q.touchLogin.run(Date.now(), u.id);
  return toUser(u);
}

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  q.insertSession.run(token, userId, Date.now() + SESSION_DAYS * 86400_000);
  return token;
}

/** Usuário da sessão ({id, username, role, ban}) ou null. `ban` = mensagem se suspenso. */
export function userFromToken(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const row = q.sessionUser.get(token, Date.now());
  return row ? { ...toUser(row), ban: banMessage(row) } : null;
}

export function logout(token) { if (typeof token === 'string') q.deleteSession.run(token); }
export function purgeExpiredSessions() { q.purgeSessions.run(Date.now()); }

// ---------- Saves (o servidor é a fonte da verdade; o cliente nunca manda o progresso) ----------
export function loadCharacter(userId) {
  const row = q.getCharacter.get(userId);
  let data = null;
  if (row) { try { data = JSON.parse(row.data); } catch { /* corrompido: personagem novo */ } }
  return normalizeCharacter(data);
}

export function saveCharacter(userId, c) {
  q.upsertCharacter.run(userId, JSON.stringify(publicCharacter(c)), Date.now());
}
