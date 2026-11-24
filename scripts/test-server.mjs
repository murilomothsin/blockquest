// Teste do servidor autoritativo: monstros, economia (XP/ouro/itens/baús), morte, anti-trapaça e cargos.
// Uso (com o servidor rodando): node scripts/test-server.mjs [baseUrl]
// Cria contas de teste (t_a, t_b, t_qa, t_mod, t_adm) e apaga tudo no final.
import WebSocket from 'ws';
import { db, q } from '../server/db.js';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };
const PASS = 'teste-servidor-123';

async function api(path, body, token) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
async function account(name, role = 'player') {
  let r = await api('register', { username: name, password: PASS });
  if (r.status !== 201) r = await api('login', { username: name, password: PASS });
  if (!r.body.token) throw new Error(`login ${name}: ${JSON.stringify(r.body)}`);
  const u = q.userByName.get(name);
  q.setRole.run(role, u.id);
  q.setBan.run(null, null, u.id);
  return r.body.token;
}

function client(token, name) {
  const c = { name, mobs: new Map(), ev: [], fx: [], sys: [], chat: [], other: [], ws: new WebSocket(WS), x: 0, z: 8, closed: null };
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('close', (code) => { c.closed = code; });
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') { c.id = m.id; c.role = m.role; c.char = m.c; c.x = m.c.pos[0]; c.z = m.c.pos[2]; res(); }
      else if (m.t === 'mobs') { c.mobs.clear(); for (const s of m.m) c.mobs.set(s[0], s); }
      else if (m.t === 'mev') c.ev.push(m);
      else if (m.t === 'fx') { if (m.c) c.char = m.c; c.fx.push(...m.fx); }
      else if (m.t === 'setpos') { c.x = m.x; c.z = m.z; c.setpos = (c.setpos || 0) + 1; }
      else if (m.t === 'sys') c.sys.push(m.text);
      else if (m.t === 'chat' || m.t === 'staff' || m.t === 'announce' || m.t === 'whisper') c.chat.push(m);
      else c.other.push(m);
    });
  });
  c.state = (extra = {}) => c.ws.send(JSON.stringify({ t: 'state', x: c.x, y: 0, z: c.z, r: 0, m: 0, ...extra }));
  c.hit = (ids, kind = 'melee') => c.ws.send(JSON.stringify({ t: 'hit', kind, ids }));
  c.act = (a) => c.ws.send(JSON.stringify({ t: 'act', ...a }));
  c.cmd = (cmd, ...args) => c.ws.send(JSON.stringify({ t: 'cmd', cmd, args: args.map(String) }));
  c.say = (text) => c.ws.send(JSON.stringify({ t: 'chat', text }));
  c.lastSys = () => c.sys.at(-1) || '';
  /** anda de verdade (12 m/s, mensagens a cada 100 ms) */
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
  return c;
}
const both = (fn) => Promise.all([fn(A), fn(B)]);

// ---------- contas ----------
const tok = {};
for (const [n, r] of [['t_a', 'player'], ['t_b', 'player'], ['t_qa', 'qa'], ['t_mod', 'mod'], ['t_adm', 'admin']]) tok[n] = await account(n, r);
// personagem novo para os jogadores
for (const n of ['t_a', 't_b', 't_qa']) db.prepare('DELETE FROM characters WHERE user_id = ?').run(q.userByName.get(n).id);

const A = client(tok.t_a, 'A'), B = client(tok.t_b, 'B');
await both((c) => c.ready);
console.log('\n— Movimento —');
A.state(); await sleep(150);
const before = A.setpos || 0;
A.x += 50; A.state(); await sleep(200); // "teleporte" de 50 m
ok((A.setpos || 0) > before && Math.abs(A.x - 0) < 1, `teleporte de 50 m recusado (servidor devolveu para x=${A.x.toFixed(1)})`);

console.log('\n— Monstros compartilhados —');
await both((c) => c.walk(-22, -22));
await both((c) => c.idle(300));
const slimesA = [...A.mobs.values()].filter((s) => s[1] === 0 && s[7] !== 3);
ok(slimesA.length >= 6 && slimesA.every((s) => B.mobs.has(s[0])), `A e B veem os mesmos ${slimesA.length} slimes`);
const far = slimesA.reduce((m, s) => (Math.hypot(s[2] - A.x, s[3] - A.z) > Math.hypot(m[2] - A.x, m[3] - A.z) ? s : m));
A.ev.length = 0; A.hit([far[0]]); await sleep(250);
ok(!A.ev.some((e) => e.e === 'hurt' && e.id === far[0]), `golpe a ${Math.hypot(far[2] - A.x, far[3] - A.z).toFixed(0)} m recusado`);

console.log('\n— Abate em dupla: recompensa calculada pelo servidor —');
const g0 = { a: A.char.gold, b: B.char.gold, ka: A.char.kills, xa: A.char.xp };
const target = slimesA.sort((s, t) => Math.hypot(s[2] - A.x, s[3] - A.z) - Math.hypot(t[2] - A.x, t[3] - A.z))[0][0];
A.ev.length = 0;
let killed = null;
for (let i = 0; i < 30 && !killed; i++) {
  const s = A.mobs.get(target);
  if (s) { A.x = s[2] + 1.2; A.z = s[3]; B.x = s[2] - 1.2; B.z = s[3]; } // (perto: dentro do limite de velocidade)
  A.state({ lv: 99, w: 'rune_blade' }); B.state(); // A tenta mentir nível e arma
  await sleep(120);
  (i % 2 ? B : A).hit([target]);
  await sleep(480);
  killed = A.ev.find((e) => e.e === 'killed' && e.id === target);
}
const aHits = A.ev.filter((e) => e.e === 'hurt' && e.by === A.id).map((e) => e.dmg);
ok(!!killed && killed.credit.includes(A.id) && killed.credit.includes(B.id), `slime morreu com crédito para os dois (${killed?.credit})`);
ok(aHits.length > 0 && aHits.every((d) => d <= 30), `dano da A = ${aHits.join(', ')} (nível 1 + espada de madeira; mentir nível 99/lâmina rúnica não adiantou)`);
await sleep(200);
ok(A.char.gold > g0.a && B.char.gold > g0.b, `ouro: A ${g0.a}→${A.char.gold}, B ${g0.b}→${B.char.gold}`);
ok(A.char.kills === g0.ka + 1 && A.char.xp > g0.xa, `abates ${A.char.kills}, XP ${g0.xa}→${A.char.xp}`);

console.log('\n— Trapaças de economia —');
const goldNow = A.char.gold;
A.ws.send(JSON.stringify({ t: 'save', data: { gold: 999999, level: 99, inv: { rune_blade: 1 } } })); // save falso (protocolo antigo)
A.act({ a: 'buy', id: 'potion' }); // longe da loja
await sleep(250);
ok(A.char.gold === goldNow && !A.char.inv.rune_blade && A.char.level === 1, `save falso ignorado e compra longe da loja negada (ouro ${A.char.gold}, nível ${A.char.level})`);

console.log('\n— Monstro bate: dano aplicado pelo servidor —');
const hp0 = A.char.hp;
B.walk(0, 8); // B volta para a vila
A.fx.length = 0;
const s1 = [...A.mobs.values()].find((s) => s[1] === 0 && s[7] !== 3);
for (let i = 0; i < 30 && !A.fx.some((f) => f.k === 'hurt'); i++) {
  const s = A.mobs.get(s1[0]);
  if (s) { const d = Math.hypot(s[2] + 1 - A.x, s[3] - A.z); if (d < 2) { A.x = s[2] + 1; A.z = s[3]; } else await A.walk(s[2] + 1, s[3]); }
  A.state(); await sleep(100);
}
const hurtFx = A.fx.find((f) => f.k === 'hurt');
const hurtSum = A.fx.filter((f) => f.k === 'hurt').reduce((t, f) => t + f.dmg, 0); // às vezes 2 slimes batem juntos
ok(!!hurtFx && A.char.hp === hp0 - hurtSum, `A levou ${hurtSum} de dano: vida ${hp0}→${A.char.hp}`);
await A.walk(-10, 8); // sai da floresta

console.log('\n— Loja (perto da Mercadora Lia) —');
await A.walk(-5, 3); await A.idle(200);
const gBuy = A.char.gold, pBuy = A.char.inv.wood_sword || 0;
A.act({ a: 'buy', id: 'wood_sword' }); await sleep(250); // 10 de ouro (A tem pouco: só 1 abate)
ok(A.char.gold === gBuy - 10 && A.char.inv.wood_sword === pBuy + 1, `comprou espada de madeira: ouro ${gBuy}→${A.char.gold}, espadas ${pBuy}→${A.char.inv.wood_sword}`);
A.act({ a: 'buy', id: 'potion' }); await sleep(250);
ok(A.char.gold === gBuy - 10 && (A.char.inv.potion || 0) === 3, `poção (15) negada com ${A.char.gold} de ouro`);
const gAfter = A.char.gold;
A.act({ a: 'buy', id: 'elven_bow' }); await sleep(250);
ok(!A.char.inv.elven_bow, 'Arco Élfico (só drop) não pode ser comprado');

console.log('\n— Cargos —');
const QA = client(tok.t_qa, 'QA'), MOD = client(tok.t_mod, 'MOD'), ADM = client(tok.t_adm, 'ADM');
await Promise.all([QA.ready, MOD.ready, ADM.ready]);
ok(QA.role === 'qa' && MOD.role === 'mod' && ADM.role === 'admin', `welcome traz o cargo: ${QA.role}, ${MOD.role}, ${ADM.role}`);
await Promise.all([QA, MOD, ADM].map((c) => c.idle(200)));
A.cmd('/ouro', 1000); await sleep(200);
ok(/permissão/.test(A.lastSys()) && A.char.gold === gAfter, `jogador comum não usa /ouro ("${A.lastSys()}")`);
QA.cmd('/ouro', 500); await sleep(200);
ok(QA.char.gold === 510, `QA /ouro 500 → ouro ${QA.char.gold}`);
QA.cmd('/mutar', 't_a', 5); await sleep(200);
ok(/permissão/.test(QA.lastSys()), 'QA não pode mutar');
MOD.cmd('/ouro', 500); await sleep(200);
ok(/permissão/.test(MOD.lastSys()), 'moderador não usa comandos de teste');

// chat com etiqueta
MOD.say('olá pessoal'); await sleep(600);
const modMsg = A.chat.find((m) => m.t === 'chat' && m.from === 't_mod');
ok(modMsg?.role === 'mod', `mensagem do moderador chega com cargo "${modMsg?.role}"`);
// chat da equipe
MOD.cmd('/equipe', 'reunião às 18h'); await sleep(250);
ok(QA.chat.some((m) => m.t === 'staff') && ADM.chat.some((m) => m.t === 'staff') && !A.chat.some((m) => m.t === 'staff'), '/equipe chega na equipe e não no jogador');
MOD.cmd('/aviso', 'Servidor reinicia em 5 min'); await sleep(250);
ok(A.chat.some((m) => m.t === 'announce' && /reinicia/.test(m.text)), '/aviso chega para todos');

console.log('\n— Moderação —');
MOD.cmd('/mutar', 't_a', 1, 'teste'); await sleep(250);
A.say('posso falar?'); await sleep(600);
ok(/silenciado/.test(A.lastSys()) && !B.chat.some((m) => m.text === 'posso falar?'), `A mutado: "${A.lastSys()}"`);
MOD.cmd('/desmutar', 't_a'); await sleep(250);
A.say('voltei'); await sleep(600);
ok(B.chat.some((m) => m.text === 'voltei'), 'A desmutado volta a falar');
MOD.cmd('/mutar', 't_adm', 5); await sleep(200);
ok(/não pode punir/.test(MOD.lastSys()), `moderador não pune admin ("${MOD.lastSys()}")`);
MOD.cmd('/expulsar', 't_b', 'teste'); await sleep(400);
ok(B.closed === 4005, `B expulso (código ${B.closed})`);
MOD.cmd('/banir', 't_b', 1, 'teste de ban'); await sleep(250);
const banLogin = await api('login', { username: 't_b', password: PASS });
ok(banLogin.status === 403 && /suspensa/.test(banLogin.body.error), `login do banido: ${banLogin.status} "${banLogin.body.error}"`);
MOD.cmd('/desbanir', 't_b'); await sleep(250);
ok((await api('login', { username: 't_b', password: PASS })).status === 200, 'desbanido consegue entrar');

console.log('\n— Admin muda cargo —');
MOD.cmd('/cargo', 't_a', 'admin'); await sleep(200);
ok(/permissão/.test(MOD.lastSys()), 'moderador não muda cargo');
ADM.cmd('/cargo', 't_a', 'qa'); await sleep(250);
A.cmd('/ouro', 7); await sleep(250);
ok(A.other.some((m) => m.t === 'role' && m.role === 'qa') && A.char.gold === gAfter + 7, `A virou QA na hora e usou /ouro (ouro ${A.char.gold})`);
ADM.cmd('/cargo', 't_a', 'player'); await sleep(200);
ADM.cmd('/cargo', 't_adm', 'player'); await sleep(200);
ok(/próprio cargo/.test(ADM.lastSys()), 'admin não muda o próprio cargo');

console.log('\n— QA: baús e missão —');
await QA.walk(4, -3); await QA.idle(200); // perto do Ancião
QA.act({ a: 'quest_accept' }); await sleep(250);
ok(QA.char.quest.status === 'active', `missão aceita (${QA.char.quest.status})`);
QA.cmd('/tp', -30, -30); await sleep(300);
ok(Math.hypot(QA.x + 30, QA.z + 30) < 0.5, '/tp levou o QA à floresta');
await QA.idle(300);
QA.cmd('/imortal'); await sleep(150);
QA.fx.length = 0;
QA.cmd('/spawn', 'slime', 5); await QA.idle(400);
QA.cmd('/matar'); await QA.idle(600);
const lootFx = QA.fx.find((f) => f.k === 'loot');
ok(QA.char.kills >= 5 && !!lootFx, `5 abates → baú com ${lootFx?.item} (abates ${QA.char.kills})`);
ok(QA.char.quest.status === 'complete', `missão dos slimes completa (${QA.char.quest.progress}/5)`);
QA.cmd('/tp', lootFx.x + 12, lootFx.z); await QA.idle(300); // se afasta do baú
QA.act({ a: 'pickup', lid: 9999 }); QA.act({ a: 'pickup', lid: lootFx.lid }); await sleep(250); // baú falso + baú longe
const inv0 = QA.char.inv[lootFx.item] || 0;
ok(!QA.fx.some((f) => f.k === 'pickup'), 'baú inexistente e baú longe não são pegos');
await QA.walk(lootFx.x + 1, lootFx.z); await QA.idle(200);
QA.act({ a: 'pickup', lid: lootFx.lid }); await sleep(250);
ok((QA.char.inv[lootFx.item] || 0) === inv0 + 1, `pegou o baú: ${lootFx.item} ${inv0}→${QA.char.inv[lootFx.item]}`);
QA.act({ a: 'pickup', lid: lootFx.lid }); await sleep(250);
ok((QA.char.inv[lootFx.item] || 0) === inv0 + 1, 'o mesmo baú não pode ser pego duas vezes');
QA.cmd('/tp', 4, -3); await QA.idle(300);
const gq = QA.char.gold;
QA.act({ a: 'quest_turnin' }); await sleep(250);
ok(QA.char.gold === gq + 30 && QA.char.armor === 'leather_armor', `recompensa: ouro ${gq}→${QA.char.gold}, vestiu ${QA.char.armor}`);

console.log('\n— Morte —');
QA.cmd('/imortal'); QA.cmd('/tp', 40, 45); await QA.idle(300);
const gd = QA.char.gold;
QA.fx.length = 0;
QA.cmd('/spawn', 'goblin', 6);
for (let i = 0; i < 120 && !QA.fx.some((f) => f.k === 'death'); i++) await QA.idle(100);
const death = QA.fx.find((f) => f.k === 'death');
ok(!!death && QA.char.dead && QA.char.gold === gd - death.lost && death.lost === Math.floor(gd * 0.1), `morreu para ${death?.by}: perdeu ${death?.lost} de ouro (${gd}→${QA.char.gold})`);
QA.x += 5; QA.state(); await sleep(200);
ok(Math.hypot(QA.x - 40, QA.z - 45) < 0.5, 'morto não anda');
QA.act({ a: 'respawn' }); await sleep(300);
ok(!QA.char.dead && QA.char.hp === QA.char.maxHp && Math.hypot(QA.x, QA.z - 8) < 0.5, `renasceu na vila com ${QA.char.hp}/${QA.char.maxHp}`);

console.log('\n— Progresso salvo no servidor —');
const gA = A.char.gold, kA = A.char.kills;
A.ws.close(); await sleep(400);
const A2 = client(tok.t_a, 'A2'); await A2.ready;
ok(A2.char.gold === gA && A2.char.kills === kA, `reconectou com ouro ${A2.char.gold} e ${A2.char.kills} abates`);
const logN = db.prepare("SELECT COUNT(*) n FROM staff_log WHERE actor_name IN ('t_qa','t_mod','t_adm')").get().n;
ok(logN >= 10, `${logN} ações da equipe registradas no staff_log`);

for (const c of [A2, QA, MOD, ADM]) c.ws.close();
await sleep(300);
// limpeza
for (const n of ['t_a', 't_b', 't_qa', 't_mod', 't_adm']) db.prepare('DELETE FROM users WHERE username = ?').run(n);
db.prepare("DELETE FROM staff_log WHERE actor_name IN ('t_qa','t_mod','t_adm')").run();
console.log(`\n${fails ? `❌ ${fails} falha(s)` : '✅ tudo certo'}`);
process.exit(fails ? 1 : 0);
