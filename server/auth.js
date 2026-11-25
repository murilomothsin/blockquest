// Contas, sessões, suspensões e saves
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { q } from './db.js';
import { badName } from './filter.js';
import { ROLES } from '../src/shared/roles.js';
import { normalizeCharacter, publicCharacter } from '../src/shared/progress.js';
import { MIN_AGE, RETENTION_DAYS } from '../src/shared/legal.js';

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

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new HttpError(400, 'A senha deve ter pelo menos 6 caracteres.');
  }
}
function validate(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Nome de usuário deve ter 3 a 16 caracteres (letras, números ou _).');
  }
  validatePassword(password);
}

const roleOk = (r) => (ROLES[r] ? r : 'player');
const toUser = (row) => ({ id: row.id, username: row.username, role: roleOk(row.role), mustChange: !!row.pass_temp });

/** Mensagem de suspensão, ou null se a conta está liberada */
export function banMessage(row, now = Date.now()) {
  if (!row?.banned_until || row.banned_until <= now) return null;
  const perm = row.banned_until >= 8e15;
  const until = perm ? 'permanentemente' : `até ${new Date(row.banned_until).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  return `Conta suspensa ${until}.${row.ban_reason ? ` Motivo: ${row.ban_reason}` : ''}`;
}

export async function register(username, password, ageOk) {
  validate(username, password);
  if (ageOk !== true) throw new HttpError(400, `Para criar a conta, confirme que você tem ${MIN_AGE} anos ou mais.`);
  if (badName(username)) throw new HttpError(400, 'Esse nome não é permitido. Escolha outro.');
  if (q.userByName.get(username)) throw new HttpError(409, 'Esse nome de usuário já existe.');
  const { hash, salt } = await hashPassword(password);
  const now = Date.now();
  const { lastInsertRowid } = q.insertUser.run(username, hash, salt, now, now);
  return { id: Number(lastInsertRowid), username, role: 'player', mustChange: false };
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

/** troca a senha (precisa da atual). Mantém só a sessão em uso. */
export async function changePassword(userId, keepToken, oldPassword, newPassword) {
  const u = q.userById2.get(userId);
  if (!u) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
  const { hash } = await hashPassword(String(oldPassword ?? ''), u.salt);
  if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.pass_hash, 'hex'))) throw new HttpError(400, 'A senha atual está errada.');
  validatePassword(newPassword);
  if (newPassword === oldPassword) throw new HttpError(400, 'A senha nova precisa ser diferente da atual.');
  const h = await hashPassword(newPassword);
  q.setPassword.run(h.hash, h.salt, 0, userId);
  for (const s of q.sessionsOf.all(userId)) if (s.token !== keepToken) q.deleteSession.run(s.token);
}

/** senha temporária gerada pelo admin (recuperação de conta): derruba todas as sessões e obriga a trocar no próximo login */
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o/1/l/i, que se confundem
export async function setTemporaryPassword(userId) {
  const bytes = randomBytes(10);
  let pw = '';
  for (const b of bytes) pw += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  pw = `${pw.slice(0, 5)}-${pw.slice(5)}`;
  const h = await hashPassword(pw);
  q.setPassword.run(h.hash, h.salt, 1, userId);
  q.deleteUserSessions.run(userId);
  return pw;
}

/** apaga mensagens do chat, denúncias e registros da equipe mais velhos que RETENTION_DAYS */
export function purgeOldRecords(now = Date.now()) {
  const before = now - RETENTION_DAYS * 86400_000;
  const r = { chat: q.purgeChat.run(before).changes, reports: q.purgeReports.run(before).changes, staff: q.purgeStaffLog.run(before).changes };
  if (r.chat || r.reports || r.staff) console.log(`[limpeza] apagados com mais de ${RETENTION_DAYS} dias: ${r.chat} mensagens, ${r.reports} denúncias, ${r.staff} registros da equipe`);
  return r;
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
