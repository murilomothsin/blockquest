// Teste de contas e privacidade: idade mínima no cadastro, chat gravado e apagado depois de 90 dias,
// senha temporária pelo painel, troca de senha, exclusão de conta e página /privacidade.
// Uso (com o servidor rodando): node scripts/test-contas.mjs [baseUrl]. Cria t_cadm, t_cply, t_cpl2 e apaga no final.
import WebSocket from 'ws';
import { db, q } from '../server/db.js';
import { purgeOldRecords } from '../server/auth.js';
import { RETENTION_DAYS } from '../src/shared/legal.js';

const BASE = process.argv[2] || 'http://localhost:3001';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };
const PASS = 'teste-contas-123';
const NAMES = ['t_cadm', 't_cply', 't_cpl2'];

async function api(path, { body, token } = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* vazio */ }
  return { status: r.status, body: data };
}
function connect(token) {
  const c = { ws: new WebSocket(WS), msgs: [] };
  c.closed = new Promise((res) => c.ws.on('close', (code) => res(code)));
  c.ready = new Promise((res) => {
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', token })));
    c.ws.on('message', (raw) => { const m = JSON.parse(raw); c.msgs.push(m); if (m.t === 'welcome') res(); });
  });
  return c;
}
const userId = (n) => q.userByName.get(n)?.id;
for (const n of NAMES) { const id = userId(n); if (id) q.deleteUser.run(id); }

try {
  console.log('\n— Idade mínima —');
  const noAge = await api('register', { body: { username: 't_cply', password: PASS } });
  ok(noAge.status === 400 && /13 anos/.test(noAge.body.error), `cadastro sem confirmar a idade: recusado ("${noAge.body.error}")`);
  const reg = await api('register', { body: { username: 't_cply', password: PASS, ageOk: true } });
  ok(reg.status === 201 && reg.body.user.mustChange === false, 'cadastro confirmando a idade: aceito');
  ok(q.userByName.get('t_cply').age_ok_at > Date.now() - 60e3, 'data da confirmação de idade gravada');
  let plyTok = reg.body.token;
  const admTok = (await api('register', { body: { username: 't_cadm', password: PASS, ageOk: true } })).body.token;
  q.setRole.run('admin', userId('t_cadm'));
  await api('register', { body: { username: 't_cpl2', password: PASS, ageOk: true } });

  console.log('\n— Chat gravado (90 dias) —');
  let ply = connect(plyTok);
  await ply.ready;
  ply.ws.send(JSON.stringify({ t: 'chat', text: 'oi pessoal, teste de log' }));
  await sleep(600);
  ply.ws.send(JSON.stringify({ t: 'chat', text: 'segredo', to: 't_cadm' }));
  await sleep(300);
  const logged = q.chatOf.all(userId('t_cply'), 10);
  ok(logged.some((m) => m.text === 'oi pessoal, teste de log' && m.to_name === null), 'mensagem pública gravada com o texto original');
  ok(logged.some((m) => m.text === 'segredo' && m.to_name === 't_cadm'), 'sussurro gravado com o destinatário');

  const uid = userId('t_cply');
  const old = Date.now() - (RETENTION_DAYS + 1) * 86400_000;
  const recent = Date.now() - (RETENTION_DAYS - 1) * 86400_000;
  q.logChat.run(uid, null, 'mensagem antiga', old);
  q.logChat.run(uid, null, 'mensagem de 89 dias', recent);
  q.insertReport.run(userId('t_cadm'), uid, 'spam', '{}', old);
  q.insertReport.run(userId('t_cadm'), uid, 'ofensa', '{}', recent);
  q.staffLog.run(null, 't_ctest', 'teste antigo', null, null, old);
  const purged = purgeOldRecords();
  const texts = q.chatOf.all(uid, 50).map((m) => m.text);
  ok(!texts.includes('mensagem antiga') && texts.includes('mensagem de 89 dias'), `limpeza: mensagem de ${RETENTION_DAYS + 1} dias apagada, de ${RETENTION_DAYS - 1} dias mantida (${purged.chat} apagada)`);
  const reasons = db.prepare('SELECT reason FROM reports WHERE target_id = ?').all(uid).map((r) => r.reason);
  ok(!reasons.includes('spam') && reasons.includes('ofensa'), 'denúncia antiga apagada, recente mantida');
  ok(!db.prepare("SELECT 1 FROM staff_log WHERE actor_name = 't_ctest'").get(), 'registro antigo da equipe apagado');

  console.log('\n— Trocar a própria senha —');
  ok((await api('password', { body: { old: 'errada', password: 'nova-senha-1' }, token: plyTok })).status === 400, 'senha atual errada: recusado');
  ok((await api('password', { body: { old: PASS, password: '123' }, token: plyTok })).status === 400, 'senha nova curta: recusada');
  const otherTok = (await api('login', { body: { username: 't_cply', password: PASS } })).body.token;
  ok((await api('password', { body: { old: PASS, password: 'nova-senha-1' }, token: plyTok })).status === 200, 'troca com a senha certa: ok');
  ok((await api('me', { token: plyTok })).status === 200, 'a sessão em uso continua valendo');
  ok((await api('me', { token: otherTok })).status === 401, 'as outras sessões da conta foram encerradas');
  ok((await api('login', { body: { username: 't_cply', password: 'nova-senha-1' } })).status === 200, 'login com a senha nova');

  console.log('\n— Senha temporária pelo painel —');
  ok((await api('admin/account', { body: { action: 'password', name: 't_cpl2' }, token: plyTok })).status === 403, 'jogador comum não usa o painel');
  ok((await api('admin/account', { body: { action: 'password', name: 't_cadm' }, token: admTok })).status === 400, 'admin não gera senha para a própria conta');
  const tmp = await api('admin/account', { body: { action: 'password', name: 't_cply' }, token: admTok });
  ok(tmp.status === 200 && /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(tmp.body.password), `senha temporária gerada: ${tmp.body.password}`);
  const code = await Promise.race([ply.closed, sleep(2000).then(() => 'nada')]);
  ok(code === 4005 && ply.msgs.some((m) => m.t === 'kicked' && /redefinida/.test(m.message)), `jogador online foi desconectado com aviso (código ${code})`);
  ok((await api('me', { token: plyTok })).status === 401, 'sessões antigas derrubadas');
  ok((await api('login', { body: { username: 't_cply', password: 'nova-senha-1' } })).status === 401, 'a senha anterior não funciona mais');
  const tl = await api('login', { body: { username: 't_cply', password: tmp.body.password } });
  ok(tl.status === 200 && tl.body.user.mustChange === true, 'login com a temporária: o jogo recebe "precisa trocar"');
  plyTok = tl.body.token;
  ok((await api('password', { body: { old: tmp.body.password, password: 'minha-senha-2' }, token: plyTok })).status === 200, 'troca a temporária por uma senha nova');
  ok((await api('me', { token: plyTok })).body.user?.mustChange === false, 'depois da troca não pede mais');
  ok(db.prepare("SELECT details FROM staff_log WHERE action = 'painel: senha temporária' AND target_name = 't_cply'").get()?.details == null, 'staff_log registra a ação, mas não a senha');

  console.log('\n— Excluir conta —');
  ply = connect(plyTok);
  await ply.ready;
  ok((await api('admin/account', { body: { action: 'delete', name: 't_cply', confirm: 'outro' }, token: admTok })).status === 400, 'sem digitar o nome certo: recusado');
  const del = await api('admin/account', { body: { action: 'delete', name: 't_cply', confirm: 'T_CPLY' }, token: admTok });
  ok(del.status === 200, `excluída: ${del.body.message}`);
  ok(await Promise.race([ply.closed, sleep(2000).then(() => 'nada')]) === 4005, 'jogador online desconectado');
  await sleep(300);
  ok(!q.userByName.get('t_cply'), 'conta some do banco');
  ok(!db.prepare('SELECT 1 FROM chat_log WHERE user_id = ?').get(uid) && !db.prepare('SELECT 1 FROM reports WHERE target_id = ?').get(uid)
    && !db.prepare('SELECT 1 FROM characters WHERE user_id = ?').get(uid), 'mensagens, denúncias e personagem apagados junto');
  ok((await api('login', { body: { username: 't_cply', password: 'minha-senha-2' } })).status === 401, 'não entra mais');

  console.log('\n— Página de privacidade —');
  const pp = await fetch(`${BASE}/privacidade`);
  const html = await pp.text();
  ok(pp.status === 200 && html.includes('Política de Privacidade') && html.includes('não é destinado a crianças'), '/privacidade é servida pelo servidor (build)');
  const cfg = await api('config');
  ok('contato' in cfg.body.settings && 'responsavel' in cfg.body.settings, 'contato e responsável configuráveis no painel (Regras)');
} finally {
  await sleep(300);
  for (const n of NAMES) { const id = userId(n); if (id) q.deleteUser.run(id); }
  db.prepare("DELETE FROM staff_log WHERE actor_name IN ('t_cadm', 't_ctest') OR target_name IN ('t_cply', 't_cpl2')").run();
}
console.log(fails ? `\n❌ ${fails} falha(s)` : '\n✅ tudo certo');
process.exit(fails ? 1 : 0);
