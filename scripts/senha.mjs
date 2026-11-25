// Gera uma senha temporária para uma conta (quando o próprio admin esquece a senha e não consegue entrar no painel).
// Uso: npm run senha -- NOME   → mostra a senha; o jogo pede para trocar no primeiro login.
import { q } from '../server/db.js';
import { setTemporaryPassword } from '../server/auth.js';
import { staffLog } from '../server/moderation.js';

const name = process.argv[2];
if (!name) { console.log('Uso: npm run senha -- NOME'); process.exit(1); }
const u = q.userByName.get(name);
if (!u) { console.log(`Conta "${name}" não encontrada.`); process.exit(1); }
const pw = await setTemporaryPassword(u.id);
staffLog(null, 'senha temporária (terminal)', u.username);
console.log(`Senha temporária de ${u.username}: ${pw}`);
console.log('Ela vale até a pessoa trocar (o jogo pede a troca no primeiro login). Se estava online, entra de novo com ela.');
