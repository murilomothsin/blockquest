// Contadores do mundo para o painel admin. Ficam na memória e vão para o banco a cada 10 s.
//   dmg                 dano total causado pelos jogadores
//   dmg_weapon:<item>   dano por arma        dmg_mob:<tipo>  dano recebido por tipo de monstro
//   taken / taken_mob:<tipo>   dano que os jogadores levaram (e de quem)
//   kills / kills:<tipo>       abates          deaths / death_by:<tipo>   mortes de jogadores
//   gold_lost           ouro perdido em mortes
//   drop:<item>  buy:<item>  sell:<item>   itens que caíram / foram comprados / vendidos
import { db, q } from './db.js';

const mem = new Map(q.allStats.all().map((r) => [r.key, Number(r.value)]));
const dirty = new Set();

export function bump(key, n = 1) {
  if (!n || !Number.isFinite(n) || key.length > 80) return;
  mem.set(key, (mem.get(key) || 0) + Math.round(n));
  dirty.add(key);
}

export function flushStats() {
  if (!dirty.size) return;
  try {
    db.exec('BEGIN');
    for (const k of dirty) q.setStat.run(k, mem.get(k) || 0);
    db.exec('COMMIT');
    dirty.clear();
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* nada */ }
    console.error('[stats] falhou ao salvar:', e.message);
  }
}

export function statsSnapshot() { return Object.fromEntries(mem); }

/** soma das chaves com um prefixo: { sufixo: valor } (ex.: prefix 'kills:' → { slime: 30, goblin: 12 }) */
export function byPrefix(prefix) {
  const out = {};
  for (const [k, v] of mem) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  return out;
}

export function resetWorldStats() {
  mem.clear();
  dirty.clear();
  q.clearStats.run();
}

setInterval(flushStats, 10_000).unref();
