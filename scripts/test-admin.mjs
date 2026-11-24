// Teste do painel admin: permissões, config (visual + regras) com broadcast, pacotes, upload, estatísticas e resets.
// Uso (com o servidor rodando): node scripts/test-admin.mjs [baseUrl]. Cria t_adm e t_ply e apaga no final.
import WebSocket from 'ws';
import { rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, q } from '../server/db.js';
import { PRESETS } from '../src/shared/assetConfig.js';
import { TYPES, TYPE_IDS } from '../src/shared/mobs.js';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };
const PASS = 'teste-admin-123';

async function api(path, { body, token, method } = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* vazio */ }
  return { status: r.status, body: data };
}
async function account(name, role, char) {
  let r = await api('register', { body: { username: name, password: PASS } });
  if (r.status !== 201) r = await api('login', { body: { username: name, password: PASS } });
  const u = q.userByName.get(name);
  q.setRole.run(role, u.id);
  q.upsertCharacter.run(u.id, JSON.stringify(char), Date.now());
  return r.body.token;
}
function client(token) {
  const c = { mobs: new Map(), fx: [], msgs: [], ws: new WebSocket(WS), x: 0, z: 8 };
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === 'welcome') { c.char = m.c; c.x = m.c.pos[0]; c.z = m.c.pos[2]; res(); }
      else if (m.t === 'mobs') { c.mobs.clear(); for (const s of m.m) c.mobs.set(s[0], s); }
      else if (m.t === 'fx') { if (m.c) c.char = m.c; c.fx.push(...m.fx); }
      else if (m.t === 'setpos') { c.x = m.x; c.z = m.z; }
    });
  });
  c.state = () => c.ws.send(JSON.stringify({ t: 'state', x: c.x, y: 0, z: c.z, r: 0, m: 0 }));
  c.cmd = (cmd, ...args) => c.ws.send(JSON.stringify({ t: 'cmd', cmd, args }));
  c.idle = async (ms) => { for (let t = 0; t < ms; t += 100) { c.state(); await sleep(100); } };
  c.last = (t) => [...c.msgs].reverse().find((m) => m.t === t);
  return c;
}
const char = (extra = {}) => ({ level: 10, xp: 0, gold: 300, kills: 0, inv: { potion: 3, iron_sword: 1 }, equipped: 'iron_sword', pos: [0, 0, 8], ...extra });

const admTok = await account('t_adm', 'admin', char({ level: 20 }));
const plyTok = await account('t_ply', 'player', char());
const before = await api('admin/config', { token: admTok });

try {
  console.log('\n— Permissões —');
  ok((await api('config')).status === 200, 'GET /api/config é público (o jogo lê o visual e as regras)');
  ok((await api('admin/me')).status === 401, 'sem login: 401');
  const pm = await api('admin/me', { token: plyTok });
  ok(pm.status === 403, `jogador comum: 403 (${pm.body.error})`);
  const am = await api('admin/me', { token: admTok });
  ok(am.status === 200 && am.body.user.name === 't_adm' && am.body.settingDefs.xpMul, 'admin entra no painel');
  ok((await api('admin/reset', { token: plyTok, body: { scope: 'world', confirm: 'RESETAR' } })).status === 403, 'jogador não consegue resetar o mundo');

  console.log('\n— Pacotes de assets —');
  const packs = (await api('admin/packs', { token: admTok })).body;
  const kv = packs.textures?.find((p) => p.id === 'kenney-voxel');
  ok(kv && kv.files.includes('grass_top.png') && kv.license.includes('CC0'), `texturas: ${packs.textures.length} pacotes (kenney-voxel com ${kv?.files.length} arquivos, CC0)`);
  ok(packs.icons.some((p) => p.id === 'rpg-496' && p.files.length === 496), 'ícones: rpg-496 com 496 arquivos');
  ok(packs.particles.length >= 1 && packs.foliage.length >= 2, `partículas ${packs.particles.length}, vegetação ${packs.foliage.length}`);
  const png = await fetch(`${BASE}/packs/textures/kenney-voxel/grass_top.png`);
  ok(png.status === 200 && png.headers.get('content-type') === 'image/png', 'servidor entrega /packs/... direto de public/packs');
  const trav = await fetch(`${BASE}/packs/..%2f..%2fserver%2fdata%2fblockquest.db`);
  ok(!(await trav.text()).startsWith('SQLite'), 'caminho com ../ não vaza arquivos');

  console.log('\n— Visual: salvar e mandar para todos —');
  const ply = client(plyTok);
  await ply.ready;
  await ply.idle(300);
  ok(ply.msgs.some((m) => m.t === 'config' && m.assets), 'ao entrar o jogador recebe a config atual');
  const preset = structuredClone(PRESETS.find((p) => p.id === 'blocos16').assets);
  preset.texturas.chao.tex = '../../etc/passwd';
  preset.icones.map.potion = 'icons/rpg-496/P_Blue01.png';
  const saved = await api('admin/config', { token: admTok, body: { assets: preset } });
  ok(saved.status === 200 && saved.body.assets.texturas.pedra.tex === 'textures/blocos-16/cobblestone.png', 'predefinição "Blocos 16×16" salva');
  ok(saved.body.assets.texturas.chao.tex === null, 'caminho inválido (../../etc/passwd) vira "sem textura"');
  await ply.idle(300);
  const cfgMsg = ply.last('config');
  ok(cfgMsg?.assets?.icones.map.potion === 'icons/rpg-496/P_Blue01.png' && cfgMsg.notice?.includes('visual'), `jogador online recebeu a mudança na hora ("${cfgMsg?.notice}")`);

  console.log('\n— Regras do jogo —');
  const r1 = await api('admin/config', { token: admTok, body: { settings: { mobHpMul: 2, xpMul: 99, motd: '  Bem-vindos   ao teste!  ' } } });
  ok(r1.body.settings.mobHpMul === 2 && r1.body.settings.xpMul === 10 && r1.body.settings.motd === 'Bem-vindos ao teste!', 'valores limitados (XP 99 → 10) e texto limpo');
  await ply.idle(400);
  const slime = [...ply.mobs.values()].find((s) => TYPE_IDS[s[1]] === 'slime');
  ok(slime && slime[10] === TYPES.slime.hp * 2, `monstros vivos dobram a vida máxima: slime ${slime?.[10]} (era ${TYPES.slime.hp})`);
  await api('admin/config', { token: admTok, body: { settings: before.body.settings } });
  await ply.idle(300);
  const slime2 = [...ply.mobs.values()].find((s) => TYPE_IDS[s[1]] === 'slime');
  ok(slime2?.[10] === TYPES.slime.hp, 'regras restauradas: vida volta ao normal');

  console.log('\n— Estatísticas —');
  const adm = client(admTok);
  await adm.ready;
  await adm.idle(400);
  const near = [...adm.mobs.values()].filter((s) => !TYPES[TYPE_IDS[s[1]]].boss && s[7] !== 3).sort((a, b) => Math.hypot(a[2], a[3]) - Math.hypot(b[2], b[3]))[0];
  adm.cmd('/tp', String(Math.round(near[2] + 2)), String(Math.round(near[3])));
  await adm.idle(500);
  const s0 = (await api('admin/stats', { token: admTok })).body;
  adm.cmd('/matar');
  await adm.idle(600);
  const s1 = (await api('admin/stats', { token: admTok })).body;
  const me1 = s1.ranking.find((r) => r.name === 't_adm');
  ok(s1.totals.dmg > s0.totals.dmg && s1.totals.kills > s0.totals.kills, `dano e abates contam: +${s1.totals.dmg - s0.totals.dmg} de dano, +${s1.totals.kills - s0.totals.kills} abates`);
  ok(me1?.dmg > 0 && me1.online, `ranking mostra o dano do jogador (t_adm: ${me1?.dmg})`);
  ok(s1.dmgByWeapon.some((w) => w.id === 'iron_sword' && w.dmg > 0), 'dano por arma (Espada de Ferro)');
  ok(s1.mobs.length > 0 && s1.mobs[0].kills >= 0, `monstros com dano recebido: ${s1.mobs.map((m) => m.name).slice(0, 4).join(', ')}`);
  ok(s1.items.some((i) => i.id === 'iron_sword' && i.players >= 2), 'itens: quantos jogadores têm cada item');

  console.log('\n— Upload de PNG —');
  const tiny = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await api('admin/upload', { token: admTok, body: { category: 'textures', pack: 'teste-upload', name: 'meu bloco.png', data: tiny } });
  ok(up.status === 200 && up.body.path === 'textures/teste-upload/meu_bloco.png', `PNG enviado: ${up.body.path}`);
  const packs2 = (await api('admin/packs', { token: admTok })).body;
  ok(packs2.textures.some((p) => p.id === 'teste-upload' && p.files.includes('meu_bloco.png')), 'pacote novo aparece na lista');
  ok((await fetch(`${BASE}/packs/textures/teste-upload/meu_bloco.png`)).status === 200, 'e já é servido (sem rebuild)');
  ok((await api('admin/upload', { token: admTok, body: { category: 'textures', pack: 'x', name: 'a.png', data: Buffer.from('GIF89a').toString('base64') } })).status === 400, 'arquivo que não é PNG: recusado');
  ok((await api('admin/upload', { token: admTok, body: { category: 'textures', pack: '../hack', name: 'a.png', data: tiny } })).status === 400, 'nome de pacote com ../ recusado');
  ok((await api('admin/upload', { token: plyTok, body: { category: 'textures', pack: 'x', name: 'a.png', data: tiny } })).status === 403, 'jogador comum não envia arquivos');

  console.log('\n— Resets —');
  ok((await api('admin/reset', { token: admTok, body: { scope: 'world' } })).status === 400, 'reset do mundo sem digitar RESETAR: recusado');
  const w = await api('admin/reset', { token: admTok, body: { scope: 'world', confirm: 'RESETAR' } });
  ok(w.status === 200 && /\d+ monstros/.test(w.body.message), `mundo: ${w.body.message}`);
  const rs = await api('admin/reset', { token: admTok, body: { scope: 'player_stats', name: 't_adm' } });
  await adm.idle(300);
  ok(rs.status === 200 && adm.char.stats.dmg === 0 && adm.char.kills === 0, `estatísticas do jogador zeradas (online): ${rs.body.message}`);
  const rc = await api('admin/reset', { token: admTok, body: { scope: 'player_char', name: 't_ply' } });
  await ply.idle(300);
  ok(rc.status === 200 && ply.char.level === 1 && ply.char.gold === 10 && !ply.char.inv.iron_sword, `personagem reiniciado (online): nível ${ply.char.level}, ouro ${ply.char.gold}`);
  ok(ply.fx.some((f) => f.k === 'log' && /reiniciado/.test(f.text)), 'o jogador recebe o aviso');
  ok((await api('admin/reset', { token: admTok, body: { scope: 'player_char', name: 'ninguem_existe' } })).status === 404, 'jogador inexistente: 404');
  ok(db.prepare("SELECT COUNT(*) AS n FROM staff_log WHERE actor_name = 't_adm' AND action LIKE 'painel:%'").get().n >= 5, 'tudo registrado no staff_log');

  ply.ws.close(); adm.ws.close();
} finally {
  await api('admin/config', { token: admTok, body: { assets: before.body.assets, settings: before.body.settings } });
  await rm(join(ROOT, 'public', 'packs', 'textures', 'teste-upload'), { recursive: true, force: true });
  await sleep(300);
  for (const n of ['t_adm', 't_ply']) { const u = q.userByName.get(n); if (u) db.prepare('DELETE FROM users WHERE id = ?').run(u.id); }
  db.prepare("DELETE FROM staff_log WHERE actor_name = 't_adm'").run();
}
console.log(fails ? `\n❌ ${fails} falha(s)` : '\n✅ tudo certo');
process.exit(fails ? 1 : 0);
