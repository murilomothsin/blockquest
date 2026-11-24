// Teste online das novidades: classes e árvore, casa (privada, armário/baú/cofre), mina (porta, paredes, monstros),
// baús de tesouro, morte (perde itens, ouro progressivo) e habilidade ativa validada no servidor.
// Uso (com o servidor rodando): node scripts/test-mina.mjs [baseUrl]. Cria t_a/t_b e apaga no final.
import WebSocket from 'ws';
import { db, q } from '../server/db.js';
import { HOME_DOOR, HOME_FURNITURE, HOME_EXIT, MINE_DOOR, MINE_ENTRY, TREASURES, inMine } from '../src/shared/worldData.js';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };
const PASS = 'teste-mina-123';

async function api(path, body) {
  const r = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function account(name, char) {
  let r = await api('register', { username: name, password: PASS });
  if (r.status !== 201) r = await api('login', { username: name, password: PASS });
  const u = q.userByName.get(name);
  q.setRole.run('player', u.id);
  if (char) q.upsertCharacter.run(u.id, JSON.stringify(char), Date.now());
  else db.prepare('DELETE FROM characters WHERE user_id = ?').run(u.id);
  return r.body.token;
}
function client(token, name) {
  const c = { name, mobs: new Map(), ev: [], fx: [], sys: [], snaps: [], skill: [], ws: new WebSocket(WS), x: 0, z: 8 };
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') { c.id = m.id; c.char = m.c; c.x = m.c.pos[0]; c.z = m.c.pos[2]; res(); }
      else if (m.t === 'mobs') { c.mobs.clear(); for (const s of m.m) c.mobs.set(s[0], s); }
      else if (m.t === 'mev') c.ev.push(m);
      else if (m.t === 'fx') { if (m.c) c.char = m.c; c.fx.push(...m.fx); }
      else if (m.t === 'setpos') { c.x = m.x; c.z = m.z; }
      else if (m.t === 'sys') c.sys.push(m.text);
      else if (m.t === 'snap') c.snaps.push(m.players);
      else if (m.t === 'skill') c.skill.push(m);
    });
  });
  c.state = () => c.ws.send(JSON.stringify({ t: 'state', x: c.x, y: 0, z: c.z, r: 0, m: 0 }));
  c.act = (a) => c.ws.send(JSON.stringify({ t: 'act', ...a }));
  c.hit = (ids, kind) => c.ws.send(JSON.stringify({ t: 'hit', kind, ids }));
  c.walk = async (x, z) => {
    for (;;) {
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      const step = Math.min(d, 1.2);
      c.x += (dx / d) * step; c.z += (dz / d) * step;
      c.state(); await sleep(100);
    }
  };
  c.idle = async (ms) => { for (let t = 0; t < ms; t += 100) { c.state(); await sleep(100); } };
  c.lastLog = () => [...c.fx].reverse().find((f) => f.k === 'log')?.text || '';
  return c;
}

const base = { level: 5, xp: 0, gold: 300, kills: 0, inv: { potion: 3, wood_sword: 1, iron_sword: 1 }, equipped: 'iron_sword', quest: { idx: 0, status: 'available', progress: 0 }, pos: [-6, 0, -4] };
const A = client(await account('t_a', base), 'A');
const B = client(await account('t_b', { ...base, pos: [-5, 0, -3] }), 'B');
await Promise.all([A.ready, B.ready]);

console.log('\n— Classe e árvore —');
A.act({ a: 'skill_up', node: 'a_poder' }); await A.idle(200);
ok(!A.char.skills?.a_poder, 'sem classe não ganha ponto de habilidade');
A.act({ a: 'choose_class', cls: 'hacker' }); await A.idle(200);
ok(!A.char.cls, 'classe inexistente recusada');
A.act({ a: 'choose_class', cls: 'arcanista' }); await A.idle(250);
ok(A.char.cls === 'arcanista' && A.char.equipped === 'apprentice_staff', `virou Arcanista e ganhou o cajado (${A.char.equipped}); vida ${A.char.maxHp} (−10%)`);
A.act({ a: 'choose_class', cls: 'guerreiro' }); await A.idle(200);
ok(A.char.cls === 'arcanista', 'não troca de classe depois de escolher');
A.act({ a: 'skill_up', node: 'a_foco' }); await A.idle(200);
ok(!A.char.skills.a_foco, 'nó com pré-requisito recusado');
for (const n of ['a_poder', 'a_bola', 'a_eco', 'a_eco', 'a_eco']) { A.act({ a: 'skill_up', node: n }); await sleep(60); }
await A.idle(250);
const spent = Object.values(A.char.skills).reduce((s, n) => s + n, 0);
ok(spent === 4, `nível 5 = 4 pontos: gastou ${spent} (${JSON.stringify(A.char.skills)}); o 5º foi recusado`);

console.log('\n— Casa —');
await A.walk(HOME_DOOR.x + 1, HOME_DOOR.z + 1);
await B.walk(HOME_DOOR.x + 1.5, HOME_DOOR.z + 0.5);
A.act({ a: 'enter_home' }); await A.idle(400); B.idle(400);
ok(Math.abs(A.x - 407) < 1, `A entrou em casa (x=${A.x.toFixed(1)}, z=${A.z.toFixed(1)})`);
await Promise.all([A.idle(400), B.idle(400)]);
const lastB = B.snaps.at(-1) || [];
ok(!lastB.some((p) => p.id === A.id), 'B não vê A dentro de casa (interior privado)');
A.act({ a: 'deposit', n: 100 }); await A.idle(200);
ok(A.char.home.safe === 0, 'cofre só funciona perto do cofre');
await A.walk(HOME_FURNITURE.safe.x - 1, HOME_FURNITURE.safe.z);
A.act({ a: 'deposit', n: 200 }); await A.idle(250);
ok(A.char.home.safe === 200 && A.char.gold === 100, `guardou 200 no cofre (mão ${A.char.gold}, cofre ${A.char.home.safe})`);
await A.walk(HOME_FURNITURE.rack.x + 1, HOME_FURNITURE.rack.z);
A.act({ a: 'store', box: 'rack', id: 'apprentice_staff' }); await A.idle(200);
ok(!A.char.home.rack.apprentice_staff, 'não guarda a arma equipada (o cajado)');
A.act({ a: 'store', box: 'rack', id: 'iron_sword' }); await A.idle(200);
A.act({ a: 'store', box: 'rack', id: 'potion' }); await A.idle(200);
ok(A.char.home.rack.iron_sword === 1 && !A.char.home.rack.potion, 'armário guardou a espada de ferro e recusou a poção');
await A.walk(HOME_FURNITURE.chest.x, HOME_FURNITURE.chest.z + 1);
A.act({ a: 'store', box: 'chest', id: 'potion', n: -1 }); await A.idle(200);
ok(A.char.home.chest.potion === 3 && !A.char.inv.potion, 'baú guardou as 3 poções');
await A.walk(HOME_EXIT.x, HOME_EXIT.z - 0.4);
A.act({ a: 'leave_home' }); await A.idle(300);
ok(Math.hypot(A.x - HOME_DOOR.x, A.z - HOME_DOOR.z) < 1, 'saiu pela porta da casa');
B.act({ a: 'deposit', n: 50 }); await B.idle(200);
ok(B.char.home.safe === 0, 'B (fora de casa) não mexe em cofre');

console.log('\n— Mina —');
A.act({ a: 'enter_mine' }); await A.idle(200);
ok(!inMine(A.x, A.z), 'longe da porta não entra na mina');
// QA-free: anda até a porta (a pedreira é longe; vai em linha reta pela estrada)
const md = Math.hypot(MINE_DOOR.x, MINE_DOOR.z);
await A.walk(MINE_DOOR.x * (1 - 2 / md), MINE_DOOR.z * (1 - 2 / md)); // 2 m antes da porta
A.act({ a: 'enter_mine' }); await A.idle(500);
ok(inMine(A.x, A.z), `entrou na mina (${A.x.toFixed(0)}, ${A.z.toFixed(0)})`);
const types = new Set([...A.mobs.values()].map((s) => s[1]));
ok(A.mobs.size >= 5, `vê ${A.mobs.size} monstros da mina (tipos ${[...types].join(',')})`);
const before = A.x;
A.x += 8; A.state(); await A.idle(200); // rápido demais
ok(Math.abs(A.x - before) < 1, 'não pula 8 m de uma vez');
// a oeste da entrada a parede começa em x=408 (tile 1): anda 14 m devagar para lá
for (let i = 0; i < 14; i++) { A.x -= 1; A.state(); await sleep(100); }
await A.idle(200);
ok(A.x > 407.4, `não atravessa a parede da mina andando devagar (parou em x=${A.x.toFixed(1)}; parede em 408, alvo era 404)`);
await A.walk(MINE_ENTRY.x, MINE_ENTRY.z);

console.log('\n— Habilidade ativa —');
A.ws.send(JSON.stringify({ t: 'skill', skill: 'giro' })); await A.idle(200);
ok(A.skill.at(-1)?.ok === false, `habilidade de outra classe recusada (${A.skill.at(-1)?.reason})`);
A.ws.send(JSON.stringify({ t: 'skill', skill: 'bola', target: 999999 })); await A.idle(200);
ok(A.skill.at(-1)?.ok === false, `Bola de Fogo sem alvo recusada (${A.skill.at(-1)?.reason})`);

console.log('\n— Baú do tesouro —');
const t = TREASURES.find((x) => x.id === 't_mina1');
const g0 = A.char.gold;
A.act({ a: 'open_chest', id: t.id }); await A.idle(200);
ok(!A.char.chests[t.id], 'baú longe não abre');
// teleporte de teste direto no servidor (anda pela mina seria longo): usa o caminho do jogo
const { createWorldQueries } = await import('../src/shared/worldData.js');
await A.walk(MINE_ENTRY.x, MINE_ENTRY.z);
// caminho pela grade até o baú 1 (sala das aranhas): entrada → leste
for (const [x, z] of [[MINE_ENTRY.x, -42], [446, -42], [446, -50], [t.x - 2, t.z + 2]]) await A.walk(x, z);
A.ev.length = 0;
A.act({ a: 'open_chest', id: t.id }); await A.idle(300);
const drops = A.fx.filter((f) => f.k === 'loot');
const goldDrop = drops.find((f) => f.item === 'gold');
ok(A.char.chests[t.id] > 0 && goldDrop && drops.length >= 3, `abriu o baú: ${goldDrop?.n} moedas + ${drops.length - 1} itens`);
A.act({ a: 'open_chest', id: t.id }); await A.idle(200);
ok(/vazio/.test(A.lastLog()), `reabrir: "${A.lastLog()}"`);
for (const d of drops) { await A.walk(d.x, d.z); A.act({ a: 'pickup', lid: d.lid }); await A.idle(700); }
ok(A.char.gold === g0 + goldDrop.n, `moedas pegas: ${g0} → ${A.char.gold}`);

console.log('\n— Morte —');
const inv0 = Object.values(A.char.inv).reduce((s, n) => s + n, 0);
const gold0 = A.char.gold;
A.fx.length = 0;
for (let i = 0; i < 300 && !A.char.dead; i++) { A.state(); await sleep(100); } // fica parado na sala até morrer
const d1 = A.fx.find((f) => f.k === 'death');
ok(d1 && d1.pct === 10 && d1.lost === Math.floor(gold0 * 0.1), `1ª morte: −${d1?.lost} (${d1?.pct}%) de ${gold0}, por ${d1?.by}`);
ok(JSON.stringify(A.char.inv) === '{"wood_sword":1}' && A.char.equipped === 'wood_sword', `perdeu ${inv0} itens; voltou só com a Espada de Madeira`);
ok(A.char.home.safe === 200 && A.char.home.rack.iron_sword === 1 && A.char.home.chest.potion === 3, 'cofre, armário e baú da casa intactos');
A.act({ a: 'respawn' }); await A.idle(300);
ok(!inMine(A.x, A.z) && Math.hypot(A.x, A.z) < 10, 'renasceu na vila');
// 2ª morte: progressão
const u = q.userByName.get('t_a');
await A.idle(100);
A.fx.length = 0;
const gold1 = A.char.gold;
// leva o A para perto de um slime agressivo? Mais simples: comando de teste é proibido para player → usa a regra direto
const { hurt } = await import('../src/shared/progress.js');
const sim = { ...A.char, home: A.char.home, deaths: A.char.deaths, inv: { ...A.char.inv } };
const f2 = []; hurt(sim, 99999, 'zombie', { clock: Date.now() }, f2);
ok(f2[0] && f2.find((f) => f.k === 'death').pct === 20, `2ª morte no mesmo período custaria 20% (deaths ${JSON.stringify(A.char.deaths)})`);
const f3 = []; const sim2 = { ...sim, dead: false, hp: 10 }; hurt(sim2, 99999, 'zombie', { clock: Date.now() + 3 * 86400_000 }, f3);
ok(f3.find((f) => f.k === 'death').pct === 10, 'depois do reset (2 dias, meia-noite UTC) volta para 10%');

// proteção de novato (regra compartilhada; online roda igual no servidor)
const nov = { level: 3, gold: 100, hp: 5, maxHp: 130, inv: { iron_sword: 1, potion: 2, leather_armor: 1 }, equipped: 'iron_sword', armor: 'leather_armor', helmet: null, deaths: { period: 0, n: 0 } };
const fn = []; hurt(nov, 9999, 'goblin', { clock: Date.now(), rand: () => 0.99 }, fn);
const dn = fn.find((f) => f.k === 'death');
ok(dn?.novice && nov.inv.iron_sword === 1 && nov.equipped === 'iron_sword' && nov.armor === 'leather_armor' && nov.gold === 90, `nível 3 morre e mantém os itens (${JSON.stringify(nov.inv)}), ouro 100 → ${nov.gold}`);
const vet = { ...nov, level: 4, dead: false, hp: 5, gold: 100, inv: { iron_sword: 1, potion: 2 }, equipped: 'iron_sword', deaths: { period: 0, n: 0 } };
const fv = []; hurt(vet, 9999, 'goblin', { clock: Date.now(), rand: () => 0.99 }, fv);
ok(!fv.find((f) => f.k === 'death').novice && JSON.stringify(vet.inv) === '{"wood_sword":1}', 'nível 4 já perde tudo');

A.ws.close(); B.ws.close();
await sleep(300);
for (const n of ['t_a', 't_b']) {
  const id = q.userByName.get(n).id;
  for (const tb of ['sessions', 'characters']) db.prepare(`DELETE FROM ${tb} WHERE user_id = ?`).run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}
console.log(fails ? `\n❌ ${fails} falha(s)` : '\n✅ tudo certo');
process.exit(fails ? 1 : 0);
