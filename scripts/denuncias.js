// Lista as denúncias de jogadores: `npm run denuncias` (abertas) ou `npm run denuncias -- todas`
// Marcar como resolvida: `npm run denuncias -- resolver <id>`
import { db } from '../server/db.js';

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'resolver') {
  const r = db.prepare("UPDATE reports SET status = 'resolvida' WHERE id = ?").run(Number(arg));
  console.log(r.changes ? `Denúncia #${arg} marcada como resolvida.` : `Denúncia #${arg} não encontrada.`);
  process.exit();
}

const rows = db.prepare(`
  SELECT r.*, a.username AS reporter, b.username AS target,
         (SELECT COUNT(*) FROM reports x WHERE x.target_id = r.target_id) AS total
  FROM reports r JOIN users a ON a.id = r.reporter_id JOIN users b ON b.id = r.target_id
  ${cmd === 'todas' ? '' : "WHERE r.status = 'aberta'"}
  ORDER BY r.created_at DESC`).all();

if (!rows.length) { console.log('Nenhuma denúncia' + (cmd === 'todas' ? '.' : ' aberta.')); process.exit(); }
const fmt = (t) => new Date(t).toLocaleString('pt-BR');
for (const r of rows) {
  const ev = JSON.parse(r.evidence);
  console.log(`\n#${r.id} [${r.status}] ${fmt(r.created_at)} — ${r.reporter} denunciou ${r.target} por "${r.reason}" (${r.total} denúncia(s) contra essa conta)`);
  if (ev.note) console.log(`   Comentário: ${ev.note}`);
  if (!ev.messages.length) console.log('   (sem mensagens recentes registradas)');
  for (const m of ev.messages) console.log(`   ${fmt(m.at)} ${m.to ? `[para ${m.to}] ` : ''}${m.text}`);
}
