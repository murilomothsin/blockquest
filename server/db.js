// Banco de dados (SQLite nativo do Node 22: node:sqlite, sem dependência nativa)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH || join(DATA_DIR, 'blockquest.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash   TEXT NOT NULL,
    salt        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    last_login  INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- denúncias de jogadores; "evidence" = últimas mensagens do denunciado, gravadas pelo servidor
  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    evidence    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'aberta'
  );

  -- configuração do painel admin (visual/assets e regras do jogo), JSON por chave
  CREATE TABLE IF NOT EXISTS config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- contadores do mundo para o painel (dano por arma/monstro, abates, mortes, drops, compras...)
  CREATE TABLE IF NOT EXISTS world_stats (
    key         TEXT PRIMARY KEY,
    value       INTEGER NOT NULL
  );

  -- mensagens do chat (texto original, inclusive sussurros), guardadas por RETENTION_DAYS para moderação
  CREATE TABLE IF NOT EXISTS chat_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_name     TEXT,
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_log_at ON chat_log(created_at);
  CREATE INDEX IF NOT EXISTS chat_log_user ON chat_log(user_id, created_at);

  -- tudo que a equipe faz (comandos de teste, punições, mudanças de cargo)
  CREATE TABLE IF NOT EXISTS staff_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    actor_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    target_name TEXT,
    details     TEXT,
    created_at  INTEGER NOT NULL
  );
`);

// migrações de colunas novas em bancos antigos
const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const userCols = cols('users');
if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
if (!userCols.includes('banned_until')) db.exec('ALTER TABLE users ADD COLUMN banned_until INTEGER');
if (!userCols.includes('ban_reason')) db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT');
// quando a pessoa confirmou a idade mínima no cadastro; senha temporária (gerada pelo admin) obriga a trocar
if (!userCols.includes('age_ok_at')) db.exec('ALTER TABLE users ADD COLUMN age_ok_at INTEGER');
if (!userCols.includes('pass_temp')) db.exec('ALTER TABLE users ADD COLUMN pass_temp INTEGER NOT NULL DEFAULT 0');

export const q = {
  insertUser: db.prepare('INSERT INTO users (username, pass_hash, salt, created_at, age_ok_at) VALUES (?, ?, ?, ?, ?)'),
  userById2: db.prepare('SELECT * FROM users WHERE id = ?'),
  setPassword: db.prepare('UPDATE users SET pass_hash = ?, salt = ?, pass_temp = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  logChat: db.prepare('INSERT INTO chat_log (user_id, to_name, text, created_at) VALUES (?, ?, ?, ?)'),
  chatOf: db.prepare('SELECT to_name, text, created_at FROM chat_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'),
  purgeChat: db.prepare('DELETE FROM chat_log WHERE created_at < ?'),
  purgeReports: db.prepare('DELETE FROM reports WHERE created_at < ?'),
  purgeStaffLog: db.prepare('DELETE FROM staff_log WHERE created_at < ?'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  touchLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare(`SELECT u.id, u.username, u.role, u.banned_until, u.ban_reason, u.pass_temp FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.token = ? AND s.expires_at > ?`),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  sessionsOf: db.prepare('SELECT token FROM sessions WHERE user_id = ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  getCharacter: db.prepare('SELECT data FROM characters WHERE user_id = ?'),
  upsertCharacter: db.prepare(`INSERT INTO characters (user_id, data, updated_at) VALUES (?, ?, ?)
                               ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  insertReport: db.prepare('INSERT INTO reports (reporter_id, target_id, reason, evidence, created_at) VALUES (?, ?, ?, ?, ?)'),
  recentReport: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND target_id = ? AND created_at > ?'),
  reportsBy: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND created_at > ?'),
  openReports: db.prepare(`SELECT r.id, r.reason, r.evidence, r.created_at, a.username AS reporter, b.username AS target
                           FROM reports r JOIN users a ON a.id = r.reporter_id JOIN users b ON b.id = r.target_id
                           WHERE r.status = 'aberta' ORDER BY r.created_at DESC LIMIT ?`),
  resolveReport: db.prepare("UPDATE reports SET status = 'resolvida' WHERE id = ? AND status = 'aberta'"),
  setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  setBan: db.prepare('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?'),
  deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  staffLog: db.prepare('INSERT INTO staff_log (actor_id, actor_name, action, target_name, details, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  staffList: db.prepare("SELECT username, role FROM users WHERE role != 'player' ORDER BY role, username"),
  getConfig: db.prepare('SELECT value, updated_at FROM config WHERE key = ?'),
  setConfig: db.prepare(`INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
  allStats: db.prepare('SELECT key, value FROM world_stats'),
  setStat: db.prepare(`INSERT INTO world_stats (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
  clearStats: db.prepare('DELETE FROM world_stats'),
  allCharacters: db.prepare(`SELECT u.id, u.username, u.role, u.last_login, u.created_at, c.data FROM users u
                             LEFT JOIN characters c ON c.user_id = u.id`),
  userById: db.prepare('SELECT id, username, role FROM users WHERE id = ?'),
};
