// Simulação dos monstros em dados puros (sem three.js / DOM).
// Roda no navegador no modo offline e no servidor no modo online — a mesma IA nos dois.
import { SAFE_ZONES, DUNGEON_SPAWNS, ZONES, CURSED, TOWER, dungeonAt } from './worldData.js';
import { SETTINGS } from './settings.js';

/** vida máxima com o multiplicador do painel admin */
export const mobMaxHp = (def) => Math.max(1, Math.round(def.hp * SETTINGS.mobHpMul));

/**
 * Respawn: na superfície normal; nas dungeons e nas Ruínas Amaldiçoadas bem mais lento e GRADUAL
 * (um monstro por vez a cada `gap` s, e nunca na frente de um jogador).
 */
export const RESPAWN = {
  dungeonMul: 6, // mina/torre: esqueleto 30 s → 3 min
  ruinsMul: 3, // ruínas amaldiçoadas
  bossMul: 4, // chefes da superfície (Golem, Rainha); chefes de dungeon usam dungeonMul (Goblin Minerador 12 min)
  gap: 12, // s entre dois renascimentos na mesma área
  hiddenR: 16, // não renasce se um jogador estiver a menos disso, com visão
};
/** área de respawn gradual: id da dungeon, 'ruins' ou null (superfície normal) */
export function respawnArea(x, z) {
  const d = dungeonAt(x, z);
  if (d) return d.region === 'tower' ? 'tower' : d.id;
  return Math.hypot(x - CURSED.x, z - CURSED.z) < CURSED.r + 6 ? 'ruins' : null;
}

/**
 * Encontros selvagens estilo Pokémon GBA: andando no meio das árvores, a cada
 * `stepDist` metros há `chance` de um monstro pular do mato. Nunca na vila nem na estrada.
 */
export const WILD = {
  table: [['goblin', 1]], // [tipo, peso]
  stepDist: 3,
  chance: 0.08,
  cooldown: 15, // segundos mínimos entre encontros (por jogador)
  max: 2, // máximo de selvagens vivos por jogador
  minDist: 7, maxDist: 13,
  despawnDist: 70,
};

// leash: distância máxima do ponto de spawn antes de desistir (precisa ser > alcance do maior arco)
export const TYPES = {
  slime: { name: 'Slime', hp: 30, dmg: 5, speed: 2.6, xp: 12, gold: [1, 4], aggro: 9, range: 1.7, cd: 1.4, respawn: 15, radius: 0.7, height: 1.2, leash: 40 },
  goblin: { name: 'Goblin', hp: 75, dmg: 10, speed: 3.9, xp: 32, gold: [4, 10], aggro: 13, range: 2.0, cd: 1.1, respawn: 20, radius: 0.6, height: 2.3, leash: 45 },
  golem: {
    name: 'Golem Antigo', hp: 700, dmg: 26, speed: 2.9, xp: 450, gold: [150, 220], aggro: 18, range: 3.8, cd: 2.0, respawn: 60, radius: 1.8, height: 6.3, boss: true, leash: 60,
    // arremesso de pedra contra quem fica longe: área marcada no chão, dá pra desviar
    throw: { min: 8, max: 36, cd: 4.5, dmg: 24, radius: 2.8, windup: 0.8, flight: 1.25, kind: 'rock' },
  },
  // --- mina e biomas externos ---
  spider: { name: 'Aranha', hp: 80, dmg: 9, speed: 4.6, xp: 24, gold: [2, 6], aggro: 10, range: 1.6, cd: 0.9, respawn: 25, radius: 0.7, height: 0.9, leash: 40, los: true },
  skeleton: { name: 'Esqueleto', hp: 190, dmg: 15, speed: 3.4, xp: 55, gold: [5, 12], aggro: 12, range: 2.1, cd: 1.2, respawn: 30, radius: 0.6, height: 2.4, leash: 45, los: true },
  zombie: { name: 'Morto-vivo', hp: 300, dmg: 19, speed: 2.1, xp: 65, gold: [4, 11], aggro: 10, range: 1.9, cd: 1.6, respawn: 30, radius: 0.65, height: 2.4, leash: 40, los: true },
  cave_goblin: { name: 'Goblin das Cavernas', hp: 220, dmg: 16, speed: 4.0, xp: 60, gold: [8, 16], aggro: 13, range: 2.0, cd: 1.1, respawn: 30, radius: 0.6, height: 2.3, leash: 45, los: true },
  goblin_boss: {
    name: 'Goblin Minerador', hp: 3200, dmg: 36, speed: 3.0, xp: 1200, gold: [300, 450], aggro: 16, range: 3.6, cd: 1.9, respawn: 120, radius: 1.5, height: 5.2, boss: true, leash: 40, los: true,
    // joga dinamite: área marcada no chão, maior que a pedra do golem
    throw: { min: 6, max: 30, cd: 5, dmg: 30, radius: 3.5, windup: 0.9, flight: 1.1, kind: 'dynamite' },
  },
  // --- planalto, ruínas amaldiçoadas e torre (nível 9+) ---
  wolf: { name: 'Lobo Cinzento', hp: 780, dmg: 22, speed: 5.4, xp: 70, gold: [6, 14], aggro: 14, range: 1.8, cd: 0.95, respawn: 25, radius: 0.7, height: 1.3, leash: 45 },
  ghost: { name: 'Fantasma', hp: 900, dmg: 26, speed: 3.8, xp: 90, gold: [10, 20], aggro: 13, range: 2.0, cd: 1.2, respawn: 30, radius: 0.6, height: 2.4, leash: 40, los: true, float: true },
  banshee: {
    name: 'Rainha Espectral', hp: 6500, dmg: 46, speed: 3.4, xp: 2000, gold: [450, 650], aggro: 18, range: 3.2, cd: 1.8, respawn: 150, radius: 1.3, height: 4.6, boss: true, leash: 40, float: true,
    // grito espectral: orbe que cai numa área marcada
    throw: { min: 5, max: 30, cd: 4, dmg: 34, radius: 3.2, windup: 0.8, flight: 1.0, kind: 'spirit' },
  },
  cultist: {
    name: 'Cultista', hp: 1000, dmg: 24, speed: 3.3, xp: 110, gold: [12, 24], aggro: 15, range: 2.0, cd: 1.3, respawn: 35, radius: 0.6, height: 2.4, leash: 40, los: true,
    throw: { min: 4, max: 18, cd: 3.2, dmg: 22, radius: 2.2, windup: 0.6, flight: 0.8, kind: 'bolt' }, // feitiço à distância
  },
  gargoyle: { name: 'Gárgula', hp: 2000, dmg: 38, speed: 2.7, xp: 160, gold: [14, 28], aggro: 11, range: 2.4, cd: 1.6, respawn: 40, radius: 0.9, height: 3.2, leash: 35, los: true },
  necromancer: {
    name: 'Necromante', hp: 10000, dmg: 54, speed: 2.8, xp: 3500, gold: [700, 1000], aggro: 18, range: 3.0, cd: 1.9, respawn: 180, radius: 1.2, height: 4.4, boss: true, leash: 30, los: true,
    throw: { min: 4, max: 30, cd: 3.6, dmg: 40, radius: 3.4, windup: 0.9, flight: 1.0, kind: 'bolt' },
  },
};
export const TYPE_IDS = Object.keys(TYPES);
export const STATES = ['idle', 'chase', 'return', 'dead'];

const Z = (id) => ZONES.find((z) => z.id === id);
export const SPAWNS = [
  { type: 'slime', x: -35, z: -35, r: 15, n: 8 },
  { type: 'slime', x: 38, z: 40, r: 12, n: 6 },
  { type: 'goblin', x: 65, z: -15, r: 7, n: 6 },
  { type: 'golem', x: 0, z: -97, r: 2, n: 1 },
  // biomas externos
  { type: 'skeleton', x: Z('desert').x, z: Z('desert').z, r: 18, n: 5 },
  { type: 'spider', x: Z('swamp').x, z: Z('swamp').z, r: 18, n: 5 },
  { type: 'zombie', x: Z('swamp').x + 8, z: Z('swamp').z - 6, r: 14, n: 3 },
  { type: 'cave_goblin', x: Z('quarry').x, z: Z('quarry').z, r: 12, n: 3 },
  // anel externo (mapa maior)
  { type: 'skeleton', x: 235, z: -62, r: 14, n: 4 },
  { type: 'spider', x: -222, z: 104, r: 14, n: 4 },
  { type: 'zombie', x: -214, z: 92, r: 10, n: 2 },
  { type: 'cave_goblin', x: -200, z: -150, r: 12, n: 3 },
  // planalto: lobos em volta do castelo
  { type: 'wolf', x: Z('wolves').x, z: Z('wolves').z, r: 16, n: 6 },
  { type: 'wolf', x: -10, z: -232, r: 14, n: 4 },
  // terras amaldiçoadas: fantasmas nas ruínas, a Rainha Espectral na frente da cripta
  { type: 'ghost', x: CURSED.x, z: CURSED.z, r: 20, n: 8 },
  { type: 'banshee', x: CURSED.x, z: CURSED.z - 10, r: 1, n: 1 },
  { type: 'skeleton', x: 150, z: 200, r: 12, n: 4 },
  { type: 'ghost', x: TOWER.x + 4, z: TOWER.z - 28, r: 10, n: 3 },
  // dungeons (mina e andares da torre): um monstro por marcador do mapa
  ...DUNGEON_SPAWNS.map((m) => ({ type: m.type, x: m.x, z: m.z, r: 0.5, n: 1 })),
];

const REGEN_DELAY = 12; // s sem levar dano antes de regenerar
const REGEN_RATE = 0.02; // fração da vida máxima por segundo
const CREDIT_WINDOW = 30; // s: quem bateu nesse intervalo ganha o abate
const EMERGE = 0.6;

/** O monstro em (mx,mz) está no arco de um golpe a partir de (px,pz) olhando para (fx,fz)? */
export function inArc(mx, mz, radius, px, pz, fx, fz, range) {
  const dx = mx - px, dz = mz - pz;
  const dist = Math.hypot(dx, dz);
  if (dist > range + radius) return false;
  const dot = (dx * fx + dz * fz) / (dist || 1);
  return dot >= 0.25 || dist <= radius + 0.6;
}

export class MobSim {
  /**
   * world: consultas do mapa (resolve, isSafe, isWooded, isBlocked)
   * emit(evento): chamado com eventos em formato "de rede" ({e:'attack', id, x, z, ...})
   */
  constructor(world, { emit = () => {}, rand = Math.random } = {}) {
    this.world = world;
    this.emit = emit;
    this.rand = rand;
    this.mobs = [];
    this.byId = new Map();
    this.rocks = [];
    this.walk = new Map(); // jogador → {x, z, walked, cd}
    this.nextId = 1;
    this.nextRock = 1;
    this.time = 0;
    this.gate = new Map(); // área → próximo instante (s) em que alguém pode renascer
    for (const sp of SPAWNS) {
      for (let i = 0; i < sp.n; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * sp.r;
        this.spawn(sp.type, sp.x + Math.cos(a) * d, sp.z + Math.sin(a) * d);
      }
    }
  }

  spawn(type, x, z, opts = {}) {
    const def = TYPES[type];
    const m = {
      id: this.nextId++, type, def, x, z, y: 0, rot: this.rand() * 6,
      spawnX: x, spawnZ: z, hp: mobMaxHp(def), maxHp: mobMaxHp(def), state: 'idle', leashed: false,
      key: opts.wild ? null : `${type}@${Math.round(x)},${Math.round(z)}`, area: respawnArea(x, z),
      wanderX: x, wanderZ: z, wanderT: this.rand() * 3,
      atkCd: 0, pendingHit: 0, deadT: 0, t: 0, moving: 0, provokedT: 0,
      throwCd: 2, windup: 0, emergeT: 0, lastHitT: -99,
      wild: !!opts.wild, owner: opts.owner ?? null, targetId: null, contrib: new Map(), removed: false,
    };
    this.mobs.push(m);
    this.byId.set(m.id, m);
    return m;
  }

  remove(m) {
    if (m.removed) return;
    m.removed = true;
    m.state = 'dead';
    this.byId.delete(m.id);
    this.emit({ e: 'removed', id: m.id });
  }

  alive() { return this.mobs.filter((m) => m.state !== 'dead'); }

  /** painel admin: tira os selvagens e faz todos os outros renascerem cheios no ponto de origem */
  resetAll() {
    for (const m of [...this.mobs]) if (m.wild) { this.remove(m); }
    this.mobs = this.mobs.filter((m) => !m.removed);
    this.rocks = [];
    this.gate?.clear?.();
    for (const m of this.mobs) {
      m.maxHp = mobMaxHp(m.def);
      Object.assign(m, {
        x: m.spawnX, z: m.spawnZ, y: 0, hp: m.maxHp, state: 'idle', targetId: null, leashed: false, deadT: 0, windup: 0,
        pendingHit: 0, provokedT: 0, wanderX: m.spawnX, wanderZ: m.spawnZ, emergeT: 0, lastHitT: -99,
      });
      m.contrib.clear();
    }
    return this.mobs.length;
  }

  // ---------- Dano ----------
  /** Aplica dano de um jogador. Retorna {id, dmg, crit, killed}. */
  damage(m, dmg, crit, dirX = 0, dirZ = 0, knock = 0.8, by = null) {
    if (!m || m.state === 'dead') return null;
    m.hp -= dmg;
    m.lastHitT = m.t;
    if (by != null) { m.contrib.set(by, m.t); m.targetId = by; }
    if (m.state === 'idle') this.emit({ e: 'aggro', id: m.id, x: m.x, z: m.z });
    // voltando pra casa por ter passado do leash: toma dano, mas não volta a perseguir até chegar
    if (m.state !== 'return' || !m.leashed) m.state = 'chase';
    m.provokedT = 8; // persegue mesmo se o jogador estiver longe (ex.: atacou com arco)
    if (!m.def.boss && (dirX || dirZ)) { m.x += dirX * knock; m.z += dirZ * knock; }
    const killed = m.hp <= 0;
    this.emit({ e: 'hurt', id: m.id, dmg, crit: !!crit, killed, by, x: m.x, z: m.z });
    if (killed) this.kill(m);
    return { id: m.id, dmg, crit, killed };
  }

  kill(m) {
    m.hp = 0;
    m.state = 'dead';
    const mul = m.area && m.area !== 'ruins' ? RESPAWN.dungeonMul : m.area === 'ruins' ? (m.def.boss ? RESPAWN.bossMul : RESPAWN.ruinsMul) : m.def.boss ? RESPAWN.bossMul : 1;
    m.deadT = m.def.respawn * mul * SETTINGS.respawnMul;
    m.deadFor = m.deadT;
    m.windup = 0;
    m.pendingHit = 0;
    const credit = [...m.contrib].filter(([, t]) => m.t - t <= CREDIT_WINDOW).map(([pid]) => pid);
    m.contrib.clear();
    this.emit({ e: 'killed', id: m.id, type: m.type, key: m.key, credit, x: m.x, z: m.z });
  }

  /** Golpe em arco (modo offline: o próprio cliente resolve). */
  hitArc(px, pz, fx, fz, range, roll, by) {
    const hits = [];
    for (const m of this.mobs) {
      if (m.state === 'dead' || !inArc(m.x, m.z, m.def.radius, px, pz, fx, fz, range)) continue;
      const d = Math.hypot(m.x - px, m.z - pz) || 1;
      const { dmg, crit } = roll();
      hits.push(this.damage(m, dmg, crit, (m.x - px) / d, (m.z - pz) / d, 0.8, by));
    }
    return hits;
  }

  // ---------- Loop ----------
  /** players: [{id, x, z, dead}] */
  update(dt, players) {
    this.time += dt;
    const valid = (p) => p && !p.dead && !this.world.isSafe(p.x, p.z);
    const byId = new Map(players.map((p) => [p.id, p]));

    for (const m of this.mobs) {
      if (m.removed) continue;
      const def = m.def;
      m.t += dt;

      if (m.state === 'dead') {
        m.deadT -= dt;
        const since = (m.deadFor ?? def.respawn) - m.deadT;
        if (m.wild) { if (since > 1.3) this.remove(m); continue; } // selvagens não renascem
        if (m.deadT <= 0 && m.area) { // dungeon/ruínas: um de cada vez e escondido dos jogadores
          if (this.time < (this.gate.get(m.area) || 0)) continue;
          const seen = players.some((p) => !p.dead && Math.hypot(p.x - m.spawnX, p.z - m.spawnZ) < RESPAWN.hiddenR
            && (!this.world.los || this.world.los(p.x, p.z, m.spawnX, m.spawnZ)));
          if (seen) continue;
          this.gate.set(m.area, this.time + RESPAWN.gap);
        }
        if (m.deadT <= 0) {
          m.maxHp = mobMaxHp(def);
          m.state = 'idle'; m.hp = m.maxHp; m.targetId = null; m.leashed = false;
          m.x = m.spawnX; m.z = m.spawnZ; m.y = 0;
        }
        continue;
      }

      // distância até o jogador mais próximo (para despawn e aggro)
      let nearest = null, nearestD = Infinity;
      for (const p of players) {
        if (p.dead) continue;
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d < nearestD) { nearestD = d; nearest = p; }
      }

      if (m.state === 'idle' && nearest && nearestD < def.aggro && valid(nearest) && this.world.los(m.x, m.z, nearest.x, nearest.z)) {
        m.state = 'chase'; m.targetId = nearest.id;
        this.emit({ e: 'aggro', id: m.id, x: m.x, z: m.z });
      }
      m.provokedT = Math.max(0, m.provokedT - dt);
      m.throwCd -= dt;

      // selvagem longe de todo mundo e fora de combate some
      if (m.wild && m.state !== 'chase' && nearestD > WILD.despawnDist) { this.remove(m); continue; }

      // alvo atual (troca para o mais próximo se o alvo sumiu/morreu)
      let target = byId.get(m.targetId);
      if (m.state === 'chase' && (!target || target.dead)) {
        if (nearest && nearestD < def.aggro * 2.2 && valid(nearest)) { target = nearest; m.targetId = nearest.id; } else target = null;
      }
      const dx = target ? target.x - m.x : 0, dz = target ? target.z - m.z : 0;
      const dist = target ? Math.hypot(dx, dz) : Infinity;
      const fromSpawn = Math.hypot(m.x - m.spawnX, m.z - m.spawnZ);
      let mvx = 0, mvz = 0, speed = def.speed;

      if (m.state === 'chase') {
        // sem alvo, ou alvo entrou na zona segura (e não acabou de nos bater): desiste
        if (!target || (this.world.isSafe(target.x, target.z) && m.provokedT <= 6)) { m.state = 'return'; m.leashed = false; m.windup = 0; }
        else if (fromSpawn > def.leash) { m.state = 'return'; m.leashed = true; m.windup = 0; }
        else if (dist > def.aggro * 2.2 && m.provokedT <= 0) { m.state = 'return'; m.leashed = false; m.windup = 0; }
        else if (dist > def.range * 0.8) { mvx = dx; mvz = dz; }

        if (m.state === 'chase' && dist < def.range && m.atkCd <= 0 && m.windup <= 0 && m.emergeT <= 0) {
          m.atkCd = def.cd; m.pendingHit = def.boss ? 0.5 : 0.3;
          this.emit({ e: 'attack', id: m.id, x: m.x, z: m.z });
        }
        const T = def.throw;
        if (T && m.state === 'chase' && m.windup <= 0 && m.throwCd <= 0 && m.pendingHit <= 0 && dist > T.min && dist < T.max) {
          m.windup = T.windup; m.throwCd = T.cd;
          this.emit({ e: 'windup', id: m.id, x: m.x, z: m.z });
        }
        if (target) m.rot = Math.atan2(dx, dz);
      } else if (m.state === 'return') {
        mvx = m.spawnX - m.x; mvz = m.spawnZ - m.z;
        speed *= 1.4;
        if (fromSpawn < 1) { m.state = 'idle'; m.leashed = false; m.targetId = null; }
      } else {
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wanderT = 2 + this.rand() * 4;
          m.wanderX = m.spawnX + (this.rand() - 0.5) * 10;
          m.wanderZ = m.spawnZ + (this.rand() - 0.5) * 10;
        }
        const wx = m.wanderX - m.x, wz = m.wanderZ - m.z;
        if (Math.hypot(wx, wz) > 0.5) { mvx = wx; mvz = wz; speed *= 0.35; }
      }

      // preparando arremesso: parado; solta a pedra quando termina
      if (m.windup > 0) {
        mvx = mvz = 0;
        m.windup -= dt;
        if (m.windup <= 0 && m.state === 'chase' && target && !target.dead) this.throwRock(m, target);
      }

      // saindo do mato: sobe do chão antes de andar/atacar
      if (m.emergeT > 0) {
        m.emergeT -= dt;
        m.y = -def.height * Math.max(0, m.emergeT / EMERGE);
        mvx = mvz = 0;
      } else m.y = 0;

      m.atkCd -= dt;
      if (m.state !== 'chase' && m.hp < m.maxHp && m.t - m.lastHitT > REGEN_DELAY) {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * REGEN_RATE * dt);
      }
      if (m.pendingHit > 0) {
        m.pendingHit -= dt;
        if (m.pendingHit <= 0) {
          if (def.boss) this.emit({ e: 'slam', id: m.id, x: m.x, z: m.z });
          if (target && !target.dead && dist < def.range * 1.35) {
            this.emit({ e: 'hurtPlayer', pid: target.id, dmg: def.dmg * SETTINGS.mobDmgMul, id: m.id, type: m.type });
          }
        }
      }

      m.moving = 0;
      const ml = Math.hypot(mvx, mvz);
      if (ml > 1e-3) {
        m.x += (mvx / ml) * speed * dt;
        m.z += (mvz / ml) * speed * dt;
        if (m.state !== 'chase') m.rot = Math.atan2(mvx, mvz);
        m.moving = Math.min(1, speed / def.speed);
        this.world.resolve(m, def.radius);
        // monstros não entram na zona segura
        for (const S of SAFE_ZONES) {
          const sx = m.x - S.x, sz = m.z - S.z, sd = Math.hypot(sx, sz);
          const edge = S.r + def.radius;
          if (sd < edge && sd > 1e-3) { m.x = S.x + (sx / sd) * edge; m.z = S.z + (sz / sd) * edge; }
        }
      }
    }

    this.updateRocks(dt, players);
    this.updateWild(dt, players);
    if (this.mobs.some((m) => m.removed)) this.mobs = this.mobs.filter((m) => !m.removed);
  }

  // ---------- Pedras do Golem ----------
  throwRock(m, target) {
    const T = m.def.throw;
    const r = {
      id: this.nextRock++, mob: m.id, type: m.type,
      fx: m.x, fy: m.def.height + 0.6, fz: m.z, tx: target.x, tz: target.z,
      dur: T.flight, r: T.radius, dmg: T.dmg, t: 0,
    };
    this.rocks.push(r);
    this.emit({ e: 'rock', id: r.id, mob: m.id, kind: T.kind || 'rock', fx: r.fx, fy: r.fy, fz: r.fz, tx: r.tx, tz: r.tz, dur: r.dur, r: r.r, x: m.x, z: m.z });
  }

  updateRocks(dt, players) {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      if (r.t < r.dur) continue;
      this.rocks.splice(i, 1);
      this.emit({ e: 'impact', id: r.id, x: r.tx, z: r.tz, r: r.r });
      for (const p of players) {
        if (!p.dead && Math.hypot(p.x - r.tx, p.z - r.tz) < r.r + 0.4) {
          this.emit({ e: 'hurtPlayer', pid: p.id, dmg: r.dmg * SETTINGS.mobDmgMul, id: r.mob, type: r.type });
        }
      }
    }
  }

  // ---------- Encontros selvagens ----------
  updateWild(dt, players) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let w = this.walk.get(p.id);
      if (!w) { w = { x: p.x, z: p.z, walked: 0, cd: 5 }; this.walk.set(p.id, w); }
      const moved = Math.hypot(p.x - w.x, p.z - w.z);
      w.x = p.x; w.z = p.z;
      w.cd -= dt;
      if (p.dead || moved > 5 || !this.world.isWooded(p.x, p.z)) continue; // >5: teleporte/respawn
      w.walked += moved;
      while (w.walked >= WILD.stepDist) {
        w.walked -= WILD.stepDist;
        if (w.cd > 0) continue;
        if (this.mobs.filter((m) => m.wild && m.owner === p.id && m.state !== 'dead').length >= WILD.max) continue;
        if (this.rand() < WILD.chance && this.spawnWild(p)) w.cd = WILD.cooldown;
      }
    }
    for (const id of this.walk.keys()) if (!seen.has(id)) this.walk.delete(id);
  }

  spawnWild(p) {
    for (let i = 0; i < 20; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = WILD.minDist + this.rand() * (WILD.maxDist - WILD.minDist);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!this.world.isWooded(x, z) || this.world.isBlocked(x, z, 1)) continue;
      const total = WILD.table.reduce((s, [, w]) => s + w, 0);
      let r = this.rand() * total, type = WILD.table[0][0];
      for (const [t, w] of WILD.table) { if ((r -= w) <= 0) { type = t; break; } }
      const m = this.spawn(type, x, z, { wild: true, owner: p.id });
      m.state = 'chase';
      m.targetId = p.id;
      m.provokedT = 8;
      m.emergeT = EMERGE;
      m.y = -m.def.height;
      m.rot = Math.atan2(p.x - x, p.z - z);
      this.emit({ e: 'wild', id: m.id, pid: p.id, x, z });
      return m;
    }
    return null;
  }

  /** Estado compacto para enviar pela rede: [id, tipo, x, z, y, rot, hp, estado, andando, windup] */
  snapshot(m) {
    const r2 = (v) => Math.round(v * 100) / 100;
    return [m.id, TYPE_IDS.indexOf(m.type), r2(m.x), r2(m.z), r2(m.y), r2(m.rot), Math.ceil(m.hp), STATES.indexOf(m.state), r2(m.moving), r2(Math.max(0, m.windup)), m.maxHp];
  }
}
