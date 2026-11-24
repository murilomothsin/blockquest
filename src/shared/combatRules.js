// Regras de ataque do jogador (dados puros): golpe normal, explosão mágica e habilidades ativas.
// Usadas pelo servidor (online) e pela simulação local (offline), com as mesmas checagens.
import { ATTACK, MAGIC_SPLASH } from './items.js';
import { statsOf, SKILLS, activeSkillOf } from './classes.js';
import { weaponOf } from './progress.js';

const SLACK = { melee: 2, ranged: 8, magic: 8 }; // tolerância de distância (latência)
const CD_SLACK = 0.75; // aceita golpes até 25% mais rápido (jitter de rede)
const KIND_STYLE = { melee: 'melee', arrow: 'ranged', magic: 'magic' };

/** tempo entre golpes (s), com arma (adagas), classe e árvore */
export function attackCooldown(c) {
  const w = weaponOf(c);
  return ATTACK[w.style].cooldown * (w.cdMul || 1) * statsOf(c).cdMul[w.style];
}
/** alcance do ataque normal (m) */
export function weaponRange(c) {
  const w = weaponOf(c);
  return w.style === 'melee' ? ATTACK.melee.range : (w.range || 22) + statsOf(c).range;
}
/** raio e % da explosão do cajado */
export function splashOf(c) {
  const s = statsOf(c);
  return { r: MAGIC_SPLASH.r + s.splashR, pct: MAGIC_SPLASH.pct + s.splashPct };
}

/** rola o dano de um golpe (nível, arma, classe, árvore). mul = multiplicador da habilidade */
export function rollHit(c, mul = 1, forceCrit = false, rand = Math.random) {
  const w = weaponOf(c), s = statsOf(c);
  const base = (10 + c.level * 3 + w.bonus) * s.dmg[w.style] * mul;
  const crit = forceCrit || rand() < s.crit;
  return { dmg: Math.max(1, Math.round(base * (0.85 + rand() * 0.3) * (crit ? s.critMul : 1))), crit };
}

const dirTo = (m, x, z) => { const d = Math.hypot(m.x - x, m.z - z) || 1; return [(m.x - x) / d, (m.z - z) / d]; };

/**
 * Golpe normal. msg = { kind: 'melee'|'arrow'|'magic', ids: [...] }.
 * pos = posição do jogador conhecida por quem valida; st = { lastAttack } (s); now em segundos.
 * Retorna quantos monstros foram atingidos.
 */
export function playerAttack(sim, c, pid, msg, pos, st, now, rand = Math.random) {
  if (!pos || c.dead) return 0;
  const w = weaponOf(c);
  const style = KIND_STYLE[msg.kind];
  if (!style || w.style !== style) return 0;
  if (now - (st.lastAttack ?? -99) < attackCooldown(c) * CD_SLACK) return 0;
  st.lastAttack = now;
  const raw = Array.isArray(msg.ids) ? msg.ids : [];
  const ids = [...new Set(raw.filter(Number.isInteger))].slice(0, style === 'melee' ? 8 : 1);
  const maxD = weaponRange(c) + SLACK[style];
  let n = 0;
  for (const id of ids) {
    const m = sim.byId.get(id);
    if (!m || m.state === 'dead') continue;
    if (Math.hypot(m.x - pos.x, m.z - pos.z) > maxD + m.def.radius) continue;
    if (!sim.world.los(pos.x, pos.z, m.x, m.z)) continue; // nada de bater através da parede
    const { dmg, crit } = rollHit(c, 1, false, rand);
    const [dx, dz] = dirTo(m, pos.x, pos.z);
    const cx = m.x, cz = m.z;
    sim.damage(m, dmg, crit, dx, dz, style === 'melee' ? 0.8 : 0.4, pid);
    n++;
    if (style === 'magic') { // cajado: explode em volta do alvo
      const sp = splashOf(c);
      for (const o of sim.mobs) {
        if (o === m || o.state === 'dead' || Math.hypot(o.x - cx, o.z - cz) > sp.r + o.def.radius) continue;
        const [ox, oz] = dirTo(o, cx, cz);
        sim.damage(o, Math.max(1, Math.round(dmg * sp.pct)), false, ox, oz, 0.6, pid);
      }
      sim.emit({ e: 'splash', x: cx, z: cz, r: sp.r, by: pid });
    }
  }
  return n;
}

/**
 * Habilidade ativa. msg = { skill, target? }. st = { skillReady } (s).
 * Retorna { ok, reason?, hits, cd }.
 */
export function playerSkill(sim, c, pid, msg, pos, st, now, rand = Math.random) {
  if (!pos || c.dead) return { ok: false };
  const id = activeSkillOf(c);
  if (!id || msg.skill !== id) return { ok: false, reason: 'Você ainda não tem essa habilidade.' };
  const S = SKILLS[id];
  const w = weaponOf(c);
  if (S.needs && w.style !== S.needs) {
    const need = { ranged: 'um arco', magic: 'um cajado', melee: 'uma arma corpo a corpo' }[S.needs];
    return { ok: false, reason: `${S.name} precisa de ${need}.` };
  }
  if (now < (st.skillReady ?? 0)) return { ok: false, reason: `${S.name} recarregando (${Math.ceil(st.skillReady - now)} s).` };
  let cx = pos.x, cz = pos.z;
  let main = null;
  if (S.area === 'target') {
    main = sim.byId.get(msg.target);
    const reach = (S.reach ?? weaponRange(c) + 4) + SLACK[w.style];
    if (!main || main.state === 'dead' || Math.hypot(main.x - pos.x, main.z - pos.z) > reach + main.def.radius || !sim.world.los(pos.x, pos.z, main.x, main.z)) {
      return { ok: false, reason: 'Precisa de um alvo no alcance.' };
    }
    cx = main.x; cz = main.z;
  }
  const targets = S.r > 0
    ? sim.mobs.filter((m) => m.state !== 'dead' && Math.hypot(m.x - cx, m.z - cz) <= S.r + m.def.radius && sim.world.los(cx, cz, m.x, m.z))
    : [main];
  for (const m of targets) {
    const { dmg, crit } = rollHit(c, S.mul, !!S.crit, rand);
    const [dx, dz] = dirTo(m, cx, cz);
    sim.damage(m, dmg, crit, dx, dz, 1, pid);
  }
  st.skillReady = now + S.cd;
  sim.emit({ e: 'skill', skill: id, x: cx, z: cz, r: S.r || 1.5, by: pid });
  return { ok: true, hits: targets.length, cd: S.cd };
}
