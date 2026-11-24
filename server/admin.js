// Painel admin (HTTP): visual/assets, regras do jogo, estatísticas e resets.
// Todas as rotas /api/admin/* exigem uma sessão com cargo admin.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { q } from './db.js';
import { HttpError, userFromToken } from './auth.js';
import { staffLog } from './moderation.js';
import { bump, byPrefix, statsSnapshot, resetWorldStats, flushStats } from './stats.js';
import { sanitizeAssets, PACK_CATEGORIES, PACK_ID_RE } from '../src/shared/assetConfig.js';
import { sanitizeSettings, applySettings, SETTINGS, SETTING_DEFS } from '../src/shared/settings.js';
import { normalizeCharacter, publicCharacter, newCharacter, newStats } from '../src/shared/progress.js';
import { ITEMS } from '../src/shared/items.js';
import { TYPES } from '../src/shared/mobs.js';
import { CLASSES } from '../src/shared/classes.js';
import { can } from '../src/shared/roles.js';

const CONFIRM = 'RESETAR';
const actor = (u) => ({ id: u.id, name: u.username });
const MAX_UPLOAD = 2 * 1024 * 1024;

export function createAdmin({ root, players, broadcast, game }) {
  const PACKS = join(root, 'public', 'packs');

  // ---------- configuração (persistida no SQLite) ----------
  const readCfg = (key, sanitize) => {
    const row = q.getConfig.get(key);
    let v = null;
    if (row) { try { v = JSON.parse(row.value); } catch { /* corrompido: padrão */ } }
    return { value: sanitize(v), updated: row?.updated_at || 0 };
  };
  let assets = readCfg('assets', sanitizeAssets);
  let settings = readCfg('settings', sanitizeSettings);
  applySettings(settings.value);

  const publicConfig = () => ({ assets: assets.value, settings: settings.value, updated: Math.max(assets.updated, settings.updated) });

  function saveConfig(user, body) {
    const now = Date.now();
    const changed = [];
    if (body.assets) {
      assets = { value: sanitizeAssets(body.assets), updated: now };
      q.setConfig.run('assets', JSON.stringify(assets.value), now);
      changed.push('visual');
    }
    if (body.settings) {
      settings = { value: sanitizeSettings(body.settings), updated: now };
      q.setConfig.run('settings', JSON.stringify(settings.value), now);
      applySettings(settings.value);
      game.applySettingsLive();
      changed.push('regras');
    }
    if (!changed.length) throw new HttpError(400, 'Nada para salvar.');
    staffLog(actor(user), 'painel: config', null, changed.join(' + '));
    const notice = changed.includes('regras') && !changed.includes('visual') ? '⚙️ A administração ajustou as regras do jogo.' : '🎨 A administração atualizou o visual do jogo.';
    broadcast({ t: 'config', ...publicConfig(), notice });
    return publicConfig();
  }

  // ---------- pacotes de assets (pastas em public/packs) ----------
  let packCache = null, packCacheT = 0;
  async function listPacks() {
    if (packCache && Date.now() - packCacheT < 3000) return packCache;
    const out = {};
    for (const cat of Object.keys(PACK_CATEGORIES)) {
      out[cat] = [];
      let dirs = [];
      try { dirs = await readdir(join(PACKS, cat), { withFileTypes: true }); } catch { continue; }
      for (const d of dirs) {
        if (!d.isDirectory() || !PACK_ID_RE.test(d.name)) continue;
        const dir = join(PACKS, cat, d.name);
        let meta = {};
        try { meta = JSON.parse(await readFile(join(dir, 'pack.json'), 'utf8')); } catch { /* sem pack.json */ }
        const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        out[cat].push({ id: d.name, name: meta.name || d.name, author: meta.author || '', license: meta.license || '', url: meta.url || '', files });
      }
      out[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    packCache = out; packCacheT = Date.now();
    return out;
  }

  async function upload(user, body) {
    const { category, pack, name, data } = body || {};
    if (!PACK_CATEGORIES[category]) throw new HttpError(400, 'Categoria inválida.');
    if (typeof pack !== 'string' || !PACK_ID_RE.test(pack)) throw new HttpError(400, 'Nome do pacote: só letras minúsculas, números, - e _.');
    const base = String(name || '').replace(/\.png$/i, '').replace(/[^A-Za-z0-9_.()-]+/g, '_').slice(0, 80);
    if (!base) throw new HttpError(400, 'Nome de arquivo inválido.');
    const buf = Buffer.from(String(data || ''), 'base64');
    if (!buf.length || buf.length > MAX_UPLOAD) throw new HttpError(413, 'Arquivo vazio ou maior que 2 MB.');
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new HttpError(400, 'Só arquivos PNG.');
    const dir = join(PACKS, category, pack);
    await mkdir(dir, { recursive: true });
    try { await stat(join(dir, 'pack.json')); } catch {
      await writeFile(join(dir, 'pack.json'), JSON.stringify({ name: pack, author: user.username, license: 'enviado pelo painel admin' }, null, 1));
    }
    await writeFile(join(dir, `${base}.png`), buf);
    packCache = null;
    staffLog(actor(user), 'painel: upload', null, `${category}/${pack}/${base}.png`);
    return { path: `${category}/${pack}/${base}.png` };
  }

  // ---------- estatísticas ----------
  function allChars() {
    return q.allCharacters.all().map((r) => {
      const online = players.get(r.id);
      let c;
      if (online) c = online.c;
      else { let d = null; try { d = r.data ? JSON.parse(r.data) : null; } catch { /* corrompido */ } c = normalizeCharacter(d); }
      return { id: r.id, name: r.username, role: r.role, lastLogin: r.last_login, created: r.created_at, online: !!online, c };
    });
  }

  function stats() {
    flushStats();
    const chars = allChars();
    const W = statsSnapshot();
    const sum = (f) => chars.reduce((s, x) => s + (f(x.c) || 0), 0);
    const ranking = chars.map(({ name, role, online, lastLogin, c }) => ({
      name, role, online, lastLogin, level: c.level, cls: c.cls ? CLASSES[c.cls]?.name : null, xp: c.xp, gold: c.gold, safe: c.home?.safe || 0,
      kills: c.kills, ...(c.stats || newStats()), quest: c.quest?.idx || 0,
    })).sort((a, b) => b.level - a.level || b.xp - a.xp);

    const items = {};
    const add = (id, n, who) => {
      if (!ITEMS[id] || !n) return;
      const it = (items[id] ||= { id, name: ITEMS[id].name, icon: ITEMS[id].icon, owned: 0, players: new Set() });
      it.owned += n; it.players.add(who);
    };
    for (const { name, c } of chars) {
      for (const [id, n] of Object.entries(c.inv || {})) add(id, n, name);
      for (const [id, n] of Object.entries(c.home?.rack || {})) add(id, n, name);
      for (const [id, n] of Object.entries(c.home?.chest || {})) add(id, n, name);
    }
    const drops = byPrefix('drop:'), buys = byPrefix('buy:'), sells = byPrefix('sell:');
    for (const id of new Set([...Object.keys(drops), ...Object.keys(buys), ...Object.keys(sells)])) if (ITEMS[id]) items[id] ||= { id, name: ITEMS[id].name, icon: ITEMS[id].icon, owned: 0, players: new Set() };
    const itemList = Object.values(items).map((it) => ({ ...it, players: it.players.size, drops: drops[it.id] || 0, buys: buys[it.id] || 0, sells: sells[it.id] || 0 }))
      .sort((a, b) => b.owned - a.owned || b.drops - a.drops);

    const dmgW = byPrefix('dmg_weapon:');
    const dmgByWeapon = Object.entries(dmgW).map(([id, dmg]) => ({ id, name: ITEMS[id]?.name || id, icon: ITEMS[id]?.icon || '', dmg })).sort((a, b) => b.dmg - a.dmg);
    const dmgMob = byPrefix('dmg_mob:'), kills = byPrefix('kills:'), takenMob = byPrefix('taken_mob:'), deathBy = byPrefix('death_by:');
    const mobs = Object.keys(TYPES).map((type) => ({
      type, name: TYPES[type].name, dmgTaken: dmgMob[type] || 0, kills: kills[type] || 0, dmgDealt: takenMob[type] || 0, playerKills: deathBy[type] || 0,
    })).filter((m) => m.dmgTaken || m.kills || m.dmgDealt).sort((a, b) => b.dmgTaken - a.dmgTaken);

    return {
      generated: Date.now(),
      totals: {
        accounts: chars.length, online: players.size,
        dmg: W.dmg || 0, taken: W.taken || 0, kills: W.kills || 0, deaths: W.deaths || 0, goldLost: W.gold_lost || 0,
        goldNow: sum((c) => c.gold + (c.home?.safe || 0)), levels: sum((c) => c.level),
        dropsGold: drops.gold || 0,
      },
      ranking, items: itemList, dmgByWeapon, mobs,
    };
  }

  // ---------- resets ----------
  const findUser = (name) => {
    const u = typeof name === 'string' && q.userByName.get(name);
    if (!u) throw new HttpError(404, `Jogador "${name}" não encontrado.`);
    return u;
  };
  const writeChar = (id, c) => q.upsertCharacter.run(id, JSON.stringify(publicCharacter(c)), Date.now());

  function reset(user, { scope, name, confirm } = {}) {
    const needsConfirm = ['all_chars', 'all_stats', 'world'].includes(scope);
    if (needsConfirm && confirm !== CONFIRM) throw new HttpError(400, `Para confirmar, digite ${CONFIRM}.`);
    let msg;
    switch (scope) {
      case 'player_char': {
        const u = findUser(name);
        const p = players.get(u.id);
        if (p) game.resetCharacterOnline(p, '♻️ Seu personagem foi reiniciado pela administração.');
        else writeChar(u.id, newCharacter());
        msg = `Personagem de ${u.username} reiniciado (nível 1).`;
        break;
      }
      case 'player_stats': {
        const u = findUser(name);
        const p = players.get(u.id);
        if (p) { p.c.stats = newStats(); p.c.kills = 0; p.dirty = true; game.pushFx(p, []); } else {
          const c = normalizeCharacter(JSON.parse(q.getCharacter.get(u.id)?.data || 'null'));
          c.stats = newStats(); c.kills = 0; writeChar(u.id, c);
        }
        msg = `Estatísticas de ${u.username} zeradas.`;
        break;
      }
      case 'all_chars': {
        let n = 0;
        for (const r of q.allCharacters.all()) {
          const p = players.get(r.id);
          if (p) game.resetCharacterOnline(p, '♻️ Todos os personagens foram reiniciados pela administração.');
          else writeChar(r.id, newCharacter());
          n++;
        }
        msg = `${n} personagens reiniciados (nível 1).`;
        break;
      }
      case 'all_stats': {
        let n = 0;
        for (const r of q.allCharacters.all()) {
          const p = players.get(r.id);
          if (p) { p.c.stats = newStats(); p.c.kills = 0; p.dirty = true; game.pushFx(p, []); } else if (r.data) {
            let d = null; try { d = JSON.parse(r.data); } catch { /* corrompido */ }
            const c = normalizeCharacter(d); c.stats = newStats(); c.kills = 0; writeChar(r.id, c);
          }
          n++;
        }
        resetWorldStats();
        msg = `Estatísticas zeradas (${n} jogadores e contadores do mundo).`;
        break;
      }
      case 'world': {
        const n = game.resetWorld();
        bump('world_resets');
        msg = `Mundo reiniciado: ${n} monstros renasceram, baús de tesouro liberados.`;
        break;
      }
      default: throw new HttpError(400, 'Tipo de reset inválido.');
    }
    staffLog(actor(user), `painel: reset ${scope}`, name || null, msg);
    return { ok: true, message: msg };
  }

  // ---------- rotas ----------
  function requireAdmin(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
    const user = userFromToken(token);
    if (!user) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
    if (user.ban) throw new HttpError(403, user.ban);
    if (!can(user.role, 'panel')) throw new HttpError(403, 'Só administradores podem usar o painel.');
    return user;
  }

  /** retorna true se tratou a rota */
  async function handle(req, res, url, { sendJson, readJson }) {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/config') { sendJson(res, 200, publicConfig()); return true; }
    if (!url.pathname.startsWith('/api/admin/')) return false;
    const user = requireAdmin(req);
    switch (route) {
      case 'GET /api/admin/me': sendJson(res, 200, { user: { name: user.username, role: user.role }, settingDefs: SETTING_DEFS, settings: SETTINGS }); return true;
      case 'GET /api/admin/config': sendJson(res, 200, publicConfig()); return true;
      case 'POST /api/admin/config': sendJson(res, 200, saveConfig(user, await readJson(req, 200_000))); return true;
      case 'GET /api/admin/packs': sendJson(res, 200, await listPacks()); return true;
      case 'POST /api/admin/upload': sendJson(res, 200, await upload(user, await readJson(req, MAX_UPLOAD * 1.4 + 1000))); return true;
      case 'GET /api/admin/stats': sendJson(res, 200, stats()); return true;
      case 'POST /api/admin/reset': sendJson(res, 200, reset(user, await readJson(req))); return true;
      default: throw new HttpError(404, 'Rota não encontrada.');
    }
  }

  return { handle, publicConfig };
}
