// Teste online da expansão: pergaminhos (retorno e buffs), torre (portas entre andares, paredes no servidor),
// castelo (loja do ferreiro, fonte, missões da Capitã), monstros novos.
// Uso (com o servidor rodando): node scripts/test-expansao.mjs [baseUrl]. Cria t_e1..t_e3 e apaga no final.
import WebSocket from 'ws';
import { db, q } from '../server/db.js';
import { NPCS, TOWER_DOOR, DOOR_BY_ID, WELLS, SPAWN_POINT, dungeonAt, regionAt, DUNGEON_SPAWNS, CURSED } from '../src/shared/worldData.js';
import { MobSim, RESPAWN } from '../src/shared/mobs.js';
import { createWorldQueries, buildLayout } from '../src/shared/worldData.js';
import { newCharacter, kill, LootBag } from '../src/shared/progress.js';
import { ITEMS } from '../src/shared/items.js';
import { QUESTS } from '../src/shared/quests.js';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };
const PASS = 'teste-expansao-123';
const NAMES = ['t_e1', 't_e2', 't_e3'];

async function api(path, body) {
  const r = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function account(name, char) {
  let r = await api('register', { username: name, password: PASS, ageOk: true });
  if (r.status !== 201) r = await api('login', { username: name, password: PASS });
  const u = q.userByName.get(name);
  q.setRole.run('player', u.id);
  q.upsertCharacter.run(u.id, JSON.stringify(char), Date.now());
  return r.body.token;
}
function client(token) {
  const c = { mobs: new Map(), fx: [], ws: new WebSocket(WS), x: 0, z: 8 };
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') { c.char = m.c; c.x = m.c.pos[0]; c.z = m.c.pos[2]; res(); }
      else if (m.t === 'mobs') { c.mobs.clear(); for (const s of m.m) c.mobs.set(s[0], s); }
      else if (m.t === 'fx') { if (m.c) c.char = m.c; c.fx.push(...m.fx); }
      else if (m.t === 'setpos') { c.x = m.x; c.z = m.z; }
    });
  });
  c.state = () => c.ws.send(JSON.stringify({ t: 'state', x: c.x, y: 0, z: c.z, r: 0, m: 0 }));
  c.act = (a) => c.ws.send(JSON.stringify({ t: 'act', ...a }));
  c.idle = async (ms) => { for (let t = 0; t < ms; t += 100) { c.state(); await sleep(100); } };
  c.walk = async (x, z) => {
    for (let i = 0; i < 400; i++) {
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      const step = Math.min(d, 1.2);
      c.x += (dx / d) * step; c.z += (dz / d) * step;
      c.state(); await sleep(100);
    }
  };
  c.lastLog = () => [...c.fx].reverse().find((f) => f.k === 'log')?.text || '';
  return c;
}

const base = (pos, extra = {}) => ({
  level: 12, xp: 0, gold: 500, kills: 0, inv: { potion: 3, iron_sword: 1, scroll_return: 2, scroll_haste: 1 }, equipped: 'iron_sword',
  quest: { idx: 4, status: 'available', progress: 0 }, pos: [pos.x, 0, pos.z], ...extra,
});

console.log('\n— Mundo (regras puras) —');
const world = createWorldQueries(buildLayout());
const sim = new MobSim(world);
const count = (t) => sim.mobs.filter((m) => m.type === t).length;
ok(count('ghost') >= 8 && sim.mobs.filter((m) => m.type === 'ghost' && Math.hypot(m.x - CURSED.x, m.z - CURSED.z) < CURSED.r + 2).length >= 8, `fantasmas nas ruínas: ${count('ghost')}`);
ok(count('banshee') === 1 && count('necromancer') === 1, 'Rainha Espectral e Necromante existem (1 de cada)');
ok(count('wolf') >= 10 && count('cultist') > 0 && count('gargoyle') > 0, `lobos ${count('wolf')}, cultistas ${count('cultist')}, gárgulas ${count('gargoyle')}`);
ok(DUNGEON_SPAWNS.every((s) => dungeonAt(s.x, s.z)), `todos os ${DUNGEON_SPAWNS.length} monstros de dungeon nascem dentro de uma dungeon`);
ok(QUESTS.length === 8 && QUESTS.slice(4).every((qd) => qd.giver === 'captain'), '8 missões, as 4 novas com a Capitã Helena');

console.log('\n— Respawn nas dungeons (lento e gradual) —');
{
  const mine = sim.mobs.filter((m) => m.area === 'mine' && !m.def.boss).slice(0, 3);
  for (const m of mine) sim.kill(m);
  ok(mine.every((m) => m.deadT === m.def.respawn * RESPAWN.dungeonMul), `monstro da mina demora ${mine[0].deadT} s para voltar (era ${mine[0].def.respawn} s)`);
  const boss = sim.mobs.find((m) => m.type === 'goblin_boss'); sim.kill(boss);
  ok(boss.deadT >= 600, `Goblin Minerador volta em ${boss.deadT / 60} min`);
  const slime = sim.mobs.find((m) => m.type === 'slime'); sim.kill(slime);
  ok(slime.deadT === slime.def.respawn, 'slime da superfície continua com respawn normal');
  const far = [{ id: 1, x: 0, z: 8, dead: false }];
  const backAt = [];
  for (let t = 0; t < 260; t += 0.5) { sim.update(0.5, far); for (const m of mine) if (m.state !== 'dead' && !backAt.includes(m.id)) backAt.push(m.id, Math.round(sim.time)); }
  const times = backAt.filter((_, i) => i % 2).sort((a, b) => a - b);
  ok(times.length === 3 && times[1] - times[0] >= RESPAWN.gap && times[2] - times[1] >= RESPAWN.gap, `voltam um de cada vez: ${times.join(' s, ')} s`);
  const m2 = mine[0]; sim.kill(m2);
  const watcher = [{ id: 1, x: m2.spawnX + 2, z: m2.spawnZ, dead: false }];
  for (let t = 0; t < 260; t += 0.5) sim.update(0.5, watcher);
  ok(m2.state === 'dead', 'não renasce na frente de um jogador que está olhando');
}

console.log('\n— Drops de monstro de respawn (anti-farm) —');
{
  const c = newCharacter(); const bag = new LootBag();
  const ctx = (r) => ({ pos: { x: 0, z: 0 }, now: 0, clock: 1e9, rand: () => r, loot: bag });
  const dropsOf = (fx) => fx.filter((f) => f.k === 'loot').map((f) => f.item);
  c.kills = 4;
  let fx = []; kill(c, 'goblin_boss', { x: 0, z: 0 }, ctx(0.99), fx, 'goblin_boss@457,30');
  const first = dropsOf(fx);
  ok(first.some((id) => !ITEMS[id].price), `1º abate do chefe: equipamento raro (${first.join(', ')})`);
  c.kills = 9; fx = []; kill(c, 'goblin_boss', { x: 0, z: 0 }, ctx(0.1), fx, 'goblin_boss@457,30');
  const again = dropsOf(fx);
  ok(again.every((id) => ['potion', 'big_potion', 'leather_armor', 'leather_helmet', 'wood_sword', 'iron_dagger', 'iron_sword'].includes(id)), `chefe de novo em menos de 30 min: só item básico (${again.join(', ') || 'nada'})`);
  c.kills = 14; fx = []; kill(c, 'skeleton', { x: 0, z: 0 }, ctx(0.9), fx, 'skeleton@1,1');
  c.kills = 19; fx = []; kill(c, 'skeleton', { x: 0, z: 0 }, ctx(0.9), fx, 'skeleton@1,1');
  ok(dropsOf(fx).length === 0, 'monstro farmado: o drop dos 5 abates pode não cair (35%)');
  c.kills = 24; fx = []; kill(c, 'skeleton', { x: 0, z: 0 }, ctx(0.9), fx, 'skeleton@9,9');
  ok(dropsOf(fx).length === 1, 'monstro novo (outro ponto) dropa normal');
}

// ---------- Torre ----------
console.log('\n— Torre do Necromante —');
const T = client(await account(NAMES[0], base({ x: TOWER_DOOR.x, z: TOWER_DOOR.z - 2.5 })));
await T.ready;
T.act({ a: 'door', id: 'tower_up1' }); await T.idle(300);
ok(regionAt(T.x, T.z) === 'world', 'porta de outro andar (longe) é recusada');
T.act({ a: 'door', id: 'tower_in' }); await T.idle(400);
ok(dungeonAt(T.x, T.z)?.id === 'tower1', `entrou no 1º andar (${T.x.toFixed(0)}, ${T.z.toFixed(0)})`);
// atravessar parede: andar 20 m para o lado até bater
const x0 = T.x;
for (let i = 0; i < 30; i++) { T.x -= 0.9; T.state(); await sleep(100); }
await T.idle(300);
ok(T.x > x0 - 27 && !!dungeonAt(T.x, T.z), `parede da torre segura o jogador no servidor (parou em x=${T.x.toFixed(1)})`);
// sobe para o 2º andar
const up1 = DOOR_BY_ID.tower_up1;
T.act({ a: 'door', id: 'tower_up1' }); await T.idle(300);
ok(dungeonAt(T.x, T.z)?.id === 'tower1', 'escada longe recusada');
// teleporte de teste direto para perto da escada (comando de QA) não existe pro player: anda via setpos do servidor
T.ws.close(); await sleep(300);
const T2 = client(await account(NAMES[0], base(up1.at, { quest: { idx: 7, status: 'active', progress: 0 } })));
await T2.ready;
T2.act({ a: 'door', id: 'tower_up1' }); await T2.idle(400);
ok(dungeonAt(T2.x, T2.z)?.id === 'tower2', `subiu para o 2º andar (${dungeonAt(T2.x, T2.z)?.name})`);
T2.act({ a: 'door', id: 'tower_down2' }); await T2.idle(300);
ok(dungeonAt(T2.x, T2.z)?.id === 'tower2', 'chega a 4 m da escada de descida (não volta sem querer)');
await T2.walk(DOOR_BY_ID.tower_down2.at.x, DOOR_BY_ID.tower_down2.at.z - 1);
T2.act({ a: 'door', id: 'tower_down2' }); await T2.idle(400);
ok(dungeonAt(T2.x, T2.z)?.id === 'tower1', 'desceu de volta ao 1º andar');

console.log('\n— Pergaminhos —');
T2.act({ a: 'use', id: 'scroll_return' }); await T2.idle(400);
ok(Math.hypot(T2.x - SPAWN_POINT[0], T2.z - SPAWN_POINT[2]) < 1 && T2.char.inv.scroll_return === 1, `Pergaminho de Retorno: de volta à vila (${T2.x.toFixed(0)}, ${T2.z.toFixed(0)}), sobrou ${T2.char.inv.scroll_return}`);
T2.act({ a: 'use', id: 'scroll_haste' }); await T2.idle(300);
const left = (T2.char.buffs?.haste || 0) - Date.now();
ok(left > 40e3 && left <= 45e3 && !T2.char.inv.scroll_haste, `Pergaminho de Pressa ativo por ${(left / 1000).toFixed(0)} s e consumido`);
T2.act({ a: 'use', id: 'scroll_fury' }); await T2.idle(200);
ok(!T2.char.buffs?.fury, 'não usa pergaminho que não tem');
T2.ws.close();

// ---------- Castelo ----------
console.log('\n— Castelo de Pedralta —');
const cap = NPCS.captain, smith = NPCS.smith;
const C = client(await account(NAMES[1], base({ x: smith.x, z: smith.z + 2 }, { hp: 40 })));
await C.ready;
C.act({ a: 'buy', id: 'scroll_shield' }); await C.idle(300);
ok(!C.char.inv.scroll_shield && /Mago Eldrin/.test(C.lastLog()), `Ferreiro não vende pergaminho: "${C.lastLog()}"`);
C.act({ a: 'buy', id: 'steel_sword' }); await C.idle(300);
ok(C.char.inv.steel_sword === 1 && C.char.gold === 240, `Ferreiro vende Espada de Aço (ouro ${C.char.gold})`);
await C.walk(NPCS.mage.x + 2, NPCS.mage.z);
C.act({ a: 'buy', id: 'scroll_shield' }); await C.idle(300);
ok(C.char.inv.scroll_shield === 1 && C.char.gold === 180, `Mago vende Pergaminho de Proteção (ouro ${C.char.gold})`);
await C.walk(WELLS[1].x + 2, WELLS[1].z);
C.act({ a: 'well' }); await C.idle(300);
ok(C.char.hp === C.char.maxHp, `fonte do castelo curou (${C.char.hp}/${C.char.maxHp})`);
await C.walk(cap.x, cap.z + 2);
C.act({ a: 'quest_accept' }); await C.idle(300);
ok(C.char.quest.status === 'active' && C.char.quest.idx === 4, `aceitou "${QUESTS[4].title}" com a Capitã`);
C.act({ a: 'buy', id: 'potion' }); await C.idle(200);
ok(C.char.inv.potion === 3, 'longe do ferreiro não compra');
C.ws.close();

const V = client(await account(NAMES[2], base({ x: NPCS.elder.x + 1.5, z: NPCS.elder.z })));
await V.ready;
V.act({ a: 'quest_accept' }); await V.idle(300);
ok(V.char.quest.status === 'available', 'o Ancião não entrega missão da Capitã');
V.act({ a: 'buy', id: 'scroll_return' }); await V.idle(200);
ok(V.char.inv.scroll_return === 2, 'longe da loja não compra');
await V.walk(NPCS.merchant.x + 2, NPCS.merchant.z);
V.act({ a: 'buy', id: 'steel_armor' }); await V.idle(300);
ok(!V.char.inv.steel_armor && /Ferreiro Duarte/.test(V.lastLog()), `vila não vende item avançado: "${V.lastLog()}"`);
V.act({ a: 'buy', id: 'scroll_return' }); await V.idle(300);
ok(V.char.inv.scroll_return === 2, 'vila não vende pergaminho');
V.act({ a: 'buy', id: 'leather_armor' }); await V.idle(300);
ok(V.char.inv.leather_armor === 1, 'vila vende Armadura de Couro');
V.ws.close();

for (const n of NAMES) {
  const u = q.userByName.get(n);
  if (u) { db.prepare('DELETE FROM characters WHERE user_id = ?').run(u.id); db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); db.prepare('DELETE FROM users WHERE id = ?').run(u.id); }
}
console.log(fails ? `\n❌ ${fails} falha(s)` : '\n✅ tudo certo');
process.exit(fails ? 1 : 0);
