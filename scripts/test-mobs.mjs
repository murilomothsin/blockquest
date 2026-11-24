// Teste do mundo autoritativo: 2 jogadores via WebSocket, sem navegador.
// Uso: node scripts/test-mobs.mjs [baseUrl]
import WebSocket from 'ws';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function account(name) {
  const body = JSON.stringify({ username: name, password: 'teste-mobs-123' });
  let r = await fetch(`${BASE}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (!r.ok) r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const j = await r.json();
  if (!j.token) throw new Error(`login ${name}: ${JSON.stringify(j)}`);
  return j.token;
}

function client(token, name) {
  const c = { name, mobs: new Map(), ev: [], hurt: [], ws: new WebSocket(WS) };
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') { c.id = m.id; res(); }
      if (m.t === 'mobs') { c.mobs.clear(); for (const s of m.m) c.mobs.set(s[0], s); }
      if (m.t === 'mev') c.ev.push(m);
      if (m.t === 'hurt') c.hurt.push(m);
    });
  });
  c.state = (x, z, extra = {}) => c.ws.send(JSON.stringify({ t: 'state', x, y: 0, z, r: 0, m: 0, w: 'wood_sword', lv: 1, hp: 100, mhp: 100, ...extra }));
  c.hit = (ids, kind = 'melee') => c.ws.send(JSON.stringify({ t: 'hit', kind, ids }));
  return c;
}

const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) process.exitCode = 1; };

const [ta, tb] = await Promise.all([account('mobteste_a'), account('mobteste_b')]);
const A = client(ta, 'A'), B = client(tb, 'B');
await Promise.all([A.ready, B.ready]);

// 1) os dois perto dos slimes da floresta devem ver os MESMOS monstros (mesmos ids e posições)
for (let i = 0; i < 6; i++) { A.state(-25, -25); B.state(-26, -24); await sleep(100); }
const slimesA = [...A.mobs.values()].filter((s) => s[1] === 0);
const common = slimesA.filter((s) => B.mobs.has(s[0]));
ok(slimesA.length >= 6, `A vê ${slimesA.length} slimes`);
ok(common.length === slimesA.length, `B vê os mesmos ${common.length} slimes (mesmos ids)`);
const s0 = slimesA[0], s0b = B.mobs.get(s0[0]);
ok(Math.hypot(s0[2] - s0b[2], s0[3] - s0b[3]) < 0.5, `posição igual nos dois: A=(${s0[2]},${s0[3]}) B=(${s0b[2]},${s0b[3]})`);

// 2) golpe de longe é recusado
const far = slimesA.sort((p, q) => Math.hypot(q[2] + 25, q[3] + 25) - Math.hypot(p[2] + 25, p[3] + 25))[0];
const farD = Math.hypot(far[2] + 25, far[3] + 25);
A.ev.length = 0;
A.state(-25, -25); A.hit([far[0]]); await sleep(300);
ok(farD < 5.5 || !A.ev.some((e) => e.e === 'hurt' && e.id === far[0]), `golpe a ${farD.toFixed(1)} m recusado pelo servidor`);

// 3) A e B batem no mesmo slime: os dois ganham o abate
const target = slimesA[0][0];
A.ev.length = 0; B.ev.length = 0;
let killed = null;
for (let i = 0; i < 40 && !killed; i++) {
  const s = A.mobs.get(target) || B.mobs.get(target);
  if (s) { A.state(s[2] + 1.5, s[3]); B.state(s[2] - 1.5, s[3]); }
  await sleep(80);
  (i % 2 ? B : A).hit([target]);
  await sleep(450);
  killed = A.ev.find((e) => e.e === 'killed' && e.id === target);
}
const hurtsB = B.ev.filter((e) => e.e === 'hurt' && e.id === target);
ok(!!killed, `slime ${target} morreu (${A.ev.filter((e) => e.e === 'hurt' && e.id === target).length} golpes)`);
ok(hurtsB.some((e) => e.by === A.id) && hurtsB.some((e) => e.by === B.id), 'B viu os golpes de A e os próprios');
ok(killed && killed.credit.includes(A.id) && killed.credit.includes(B.id), `crédito do abate: ${killed?.credit} (A=${A.id}, B=${B.id})`);

// 4) spam de golpes: o cooldown do servidor limita
const alive = [...A.mobs.values()].find((s) => s[7] !== 3 && s[1] === 0);
A.ev.length = 0;
A.state(alive[2] + 1, alive[3]);
for (let i = 0; i < 10; i++) A.hit([alive[0]]);
await sleep(300);
const spamHurts = A.ev.filter((e) => e.e === 'hurt' && e.by === A.id).length;
ok(spamHurts <= 1, `10 golpes no mesmo instante → ${spamHurts} aceito`);

// 5) monstro ataca: o dano chega só para quem levou
A.hurt.length = 0; B.hurt.length = 0;
for (let i = 0; i < 30; i++) {
  const s = A.mobs.get(alive[0]);
  if (s) A.state(s[2] + 1, s[3]);
  B.state(-5, 5); // B na vila (zona segura)
  await sleep(100);
}
ok(A.hurt.length > 0, `A levou ${A.hurt.length} golpes do slime (dano ${A.hurt[0]?.dmg})`);
ok(B.hurt.length === 0, 'B (na vila) não levou dano');

// 6) zona segura: o slime para na borda
const sm = A.mobs.get(alive[0]);
for (let i = 0; i < 40; i++) { A.state(-20, -20); await sleep(100); }
const after = A.mobs.get(alive[0]);
ok(after && Math.hypot(after[2], after[3]) >= 31.5, `slime ficou fora da vila (r=${after && Math.hypot(after[2], after[3]).toFixed(1)})`);

// 7) longe: não recebe monstros de longe
for (let i = 0; i < 5; i++) { B.state(0, 130); await sleep(120); }
ok(![...B.mobs.values()].some((s) => s[1] === 2), `B em (0,130) não recebe o Golem (vê ${B.mobs.size} monstros)`);

A.ws.close(); B.ws.close();
await sleep(200);
console.log(`ids: A=${A.id} B=${B.id}`);
process.exit();
