// Teste de moderação: filtro de palavrões, silêncio temporário, denúncia com provas.
// Uso: node scripts/test-chat.mjs [baseUrl]
import WebSocket from 'ws';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) process.exitCode = 1; };

async function api(path, username, password = 'teste-chat-123') {
  const r = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return { status: r.status, body: await r.json() };
}
async function account(name) {
  let r = await api('register', name);
  if (r.status !== 201) r = await api('login', name);
  return r.body.token;
}
function client(token) {
  const c = { got: [], ws: new WebSocket(WS) };
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'welcome') { c.id = m.id; res(); } if (['chat', 'whisper', 'sys'].includes(m.t)) c.got.push(m); });
  });
  c.say = (text, to) => c.ws.send(JSON.stringify({ t: 'chat', text, to }));
  c.last = (t) => [...c.got].reverse().find((m) => m.t === t);
  return c;
}

// nome ofensivo é recusado no cadastro
const bad = await api('register', 'PorraGamer');
ok(bad.status === 400, `cadastro "PorraGamer" recusado (${bad.status}: ${bad.body.error})`);

const A = client(await account('chatteste_a')), B = client(await account('chatteste_b'));
await Promise.all([A.ready, B.ready]);

A.say('oi B, cuidado com o golem'); await sleep(650);
ok(B.last('chat')?.text === 'oi B, cuidado com o golem', `frase normal passa: "${B.last('chat')?.text}"`);

A.say('que p0rra de slime'); await sleep(650);
ok(B.last('chat')?.text === 'que ***** de slime', `palavrão mascarado: "${B.last('chat')?.text}"`);

A.say('seu fdp', 'chatteste_b'); await sleep(650);
ok(B.last('whisper')?.text === 'seu ***', `sussurro também é filtrado: "${B.last('whisper')?.text}"`);

// 3º palavrão em 1 min → silenciado
A.say('caralho'); await sleep(650);
ok(/silenciado/.test(A.last('sys')?.text || ''), `A silenciado: "${A.last('sys')?.text}"`);
const before = B.got.length;
A.say('mensagem durante o silêncio'); await sleep(650);
ok(B.got.length === before, 'mensagem durante o silêncio não chega no B');

// denúncia
B.ws.send(JSON.stringify({ t: 'report', name: 'chatteste_a', reason: 'ofensa', note: 'xingou no chat' })); await sleep(300);
ok(/Denúncia de chatteste_a enviada/.test(B.last('sys')?.text || ''), `denúncia aceita: "${B.last('sys')?.text}"`);
B.ws.send(JSON.stringify({ t: 'report', name: 'chatteste_a', reason: 'ofensa' })); await sleep(300);
ok(/já denunciou/.test(B.last('sys')?.text || ''), `denúncia repetida bloqueada: "${B.last('sys')?.text}"`);
B.ws.send(JSON.stringify({ t: 'report', name: 'chatteste_b', reason: 'ofensa' })); await sleep(300);
ok(/si mesmo/.test(B.last('sys')?.text || ''), 'não dá pra se denunciar');

A.ws.close(); B.ws.close();
await sleep(200);
process.exit();
