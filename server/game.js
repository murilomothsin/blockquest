// Mundo compartilhado no servidor: monstros, IA, dano e recompensas.
// A mesma MobSim do modo offline, mas aqui ela é a "verdade" para todos os jogadores.
import { MobSim } from '../src/shared/mobs.js';
import { buildLayout, createWorldQueries } from '../src/shared/worldData.js';
import { ITEMS, ATTACK } from '../src/shared/items.js';

const TICK_MS = 50; // simulação a 20 Hz
const SNAP_EVERY = 2; // estado dos monstros a 10 Hz
const VIEW = 110; // só manda o que está a até 110 m do jogador
const MELEE_SLACK = 2; // tolerância de distância (latência) para golpe corpo a corpo
const RANGED_SLACK = 8; // idem para flechas
const CD_SLACK = 0.75; // aceita golpes até 25% mais rápido que o cooldown (jitter de rede)

/**
 * players: Map userId → { id, name, ws, state }  (state vem das mensagens 'state' do cliente)
 * send(ws, msg)
 */
export function createGame({ players, send }) {
  const world = createWorldQueries(buildLayout());
  const sim = new MobSim(world, { emit: route });

  const inView = (p, x, z, r = VIEW) => p.state && Math.hypot(p.state.x - x, p.state.z - z) < r;

  function route(ev) {
    if (ev.e === 'hurtPlayer') { // dano no jogador vai só para ele
      const p = players.get(ev.pid);
      if (p) send(p.ws, { t: 'hurt', dmg: ev.dmg, mob: ev.type });
      return;
    }
    const msg = { t: 'mev', ...ev };
    for (const p of players.values()) {
      const credited = ev.e === 'killed' && ev.credit.includes(p.id); // quem ganhou o abate sempre recebe
      if (ev.e === 'removed' || credited || ev.x == null || inView(p, ev.x, ev.z)) send(p.ws, msg);
    }
  }

  let tick = 0;
  const timer = setInterval(() => {
    const list = [];
    for (const p of players.values()) if (p.state) list.push({ id: p.id, x: p.state.x, z: p.state.z, dead: !!p.state.d });
    if (!list.length) return; // ninguém online: mundo pausado
    sim.update(TICK_MS / 1000, list);
    if (++tick % SNAP_EVERY) return;
    for (const p of players.values()) {
      if (!p.state) continue;
      const m = [];
      for (const mob of sim.mobs) if (inView(p, mob.x, mob.z)) m.push(sim.snapshot(mob));
      send(p.ws, { t: 'mobs', m });
    }
  }, TICK_MS);

  /** Cliente diz que acertou monstros. Servidor confere arma, distância e cooldown, e rola o dano. */
  function handleHit(p, msg) {
    const s = p.state;
    if (!s || s.d) return;
    const w = ITEMS[s.w];
    if (!w || w.kind !== 'weapon') return;
    const style = msg.kind === 'arrow' ? 'ranged' : 'melee';
    if (w.style !== style) return;
    const now = Date.now();
    if (now - (p.lastAttack || 0) < ATTACK[style].cooldown * 1000 * CD_SLACK) return;
    p.lastAttack = now;

    const ids = Array.isArray(msg.ids) ? [...new Set(msg.ids.filter(Number.isInteger))].slice(0, 8) : [];
    const maxD = style === 'melee' ? ATTACK.melee.range + MELEE_SLACK : (w.range || 22) + RANGED_SLACK;
    const lv = Math.max(1, Math.min(999, Math.trunc(s.lv) || 1));
    for (const id of ids) {
      const m = sim.byId.get(id);
      if (!m || m.state === 'dead') continue;
      const d = Math.hypot(m.x - s.x, m.z - s.z);
      if (d > maxD + m.def.radius) continue;
      const base = 10 + lv * 3 + (w.bonus || 0);
      const crit = Math.random() < 0.15;
      const dmg = Math.round(base * (0.85 + Math.random() * 0.3) * (crit ? 2 : 1));
      sim.damage(m, dmg, crit, (m.x - s.x) / (d || 1), (m.z - s.z) / (d || 1), style === 'melee' ? 0.8 : 0.4, p.id);
    }
  }

  return { sim, handleHit, stop: () => clearInterval(timer) };
}
