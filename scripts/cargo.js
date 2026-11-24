// Cargos da equipe pela linha de comando (necessário para criar o PRIMEIRO admin).
//   npm run cargo                 → lista a equipe
//   npm run cargo -- nome admin   → define o cargo (player, qa, mod, admin)
// No jogo, admins também podem usar /cargo nome cargo. Se a pessoa estiver online, o cargo novo vale ao reconectar.
import { db, q } from '../server/db.js';
import { ROLES, ROLE_IDS } from '../src/shared/roles.js';
import { staffLog } from '../server/moderation.js';

const [name, role] = process.argv.slice(2);
if (!name) {
  const rows = q.staffList.all();
  if (!rows.length) console.log('Ninguém na equipe ainda. Use: npm run cargo -- nome admin');
  for (const r of rows) console.log(`${(ROLES[r.role]?.label || r.role).padEnd(12)} ${r.username}`);
  process.exit();
}
if (!ROLE_IDS.includes(role)) { console.error(`Cargo inválido. Use um de: ${ROLE_IDS.join(', ')}`); process.exit(1); }
const u = q.userByName.get(name);
if (!u) { console.error(`Usuário "${name}" não existe.`); process.exit(1); }
q.setRole.run(role, u.id);
staffLog(null, 'cargo (console)', u.username, role);
console.log(`${u.username} agora é ${ROLES[role].label}.`);
db.close();
