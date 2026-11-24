import * as THREE from 'three';
import { createCharacter, animateCharacter, flash } from './character.js';
import { makeLabel, SAFE_ZONE } from './world.js';

/**
 * Encontros selvagens estilo Pokémon GBA: andando no meio das árvores, a cada
 * `stepDist` metros há `chance` de um monstro pular do mato. Nunca na vila nem na estrada.
 */
export const WILD = {
  table: [['goblin', 1]], // [tipo, peso] (dá pra adicionar outros depois)
  stepDist: 3,
  chance: 0.08,
  cooldown: 15, // segundos mínimos entre encontros
  max: 2, // máximo de selvagens vivos ao mesmo tempo
  minDist: 7, maxDist: 13, // distância do jogador em que aparecem
  despawnDist: 70,
};

// leash: distância máxima do ponto de spawn antes de desistir (precisa ser > alcance do maior arco)
export const TYPES = {
  slime: { name: 'Slime', hp: 30, dmg: 5, speed: 2.6, xp: 12, gold: [1, 4], aggro: 9, range: 1.7, cd: 1.4, respawn: 15, radius: 0.7, height: 1.2, leash: 40 },
  goblin: { name: 'Goblin', hp: 75, dmg: 10, speed: 3.9, xp: 32, gold: [4, 10], aggro: 13, range: 2.0, cd: 1.1, respawn: 20, radius: 0.6, height: 2.3, leash: 45 },
  golem: {
    name: 'Golem Antigo', hp: 700, dmg: 26, speed: 2.9, xp: 450, gold: [150, 220], aggro: 18, range: 3.8, cd: 2.0, respawn: 60, radius: 1.8, height: 6.3, boss: true, leash: 60,
    // arremesso de pedra contra quem fica longe: área marcada no chão, dá pra desviar
    throw: { min: 8, max: 36, cd: 4.5, dmg: 24, radius: 2.8, windup: 0.8, flight: 1.25 },
  },
};

const REGEN_DELAY = 6; // segundos sem levar dano antes de começar a regenerar

const SPAWNS = [
  { type: 'slime', x: -35, z: -35, r: 15, n: 8 },
  { type: 'slime', x: 38, z: 40, r: 12, n: 6 },
  { type: 'goblin', x: 65, z: -15, r: 7, n: 6 },
  { type: 'golem', x: 0, z: -97, r: 2, n: 1 },
];

function buildModel(type) {
  if (type === 'slime') {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), new THREE.MeshLambertMaterial({ color: 0x5bd35b, transparent: true, opacity: 0.88 }));
    m.position.y = 0.55; m.castShadow = true; body.add(m);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const x of [-0.28, 0.28]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.05), eyeMat);
      e.position.set(x, 0.7, 0.66); body.add(e);
    }
    return { root, body, materials: [m.material], slime: true };
  }
  if (type === 'goblin') {
    const c = createCharacter({ skin: 0x6bbf3a, shirt: 0x6b4a2b, pants: 0x3b2a1a, hair: null, eyes: 0xffdd00, scale: 0.85, weapon: true, swordColor: 0x777777 });
    for (const x of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.12), new THREE.MeshLambertMaterial({ color: 0x6bbf3a }));
      ear.position.set(x * 0.38, 0.05, 0); c.head.add(ear); c.materials.push(ear.material);
    }
    return c;
  }
  const c = createCharacter({ skin: 0x8a8a8a, shirt: 0x6e6e6e, pants: 0x5a5a5a, hair: null, eyes: 0xff7b00, scale: 2.4 });
  for (const m of c.materials) m.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
  return c;
}

function makeHpBar(width) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.08, 0.22), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false }));
  const fgGeo = new THREE.PlaneGeometry(width, 0.16); fgGeo.translate(width / 2, 0, 0);
  const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0xe53935, depthTest: false }));
  fg.position.set(-width / 2, 0, 0.001);
  bg.renderOrder = 10; fg.renderOrder = 11;
  g.add(bg, fg);
  g.userData.fg = fg;
  return g;
}

const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
const rockMat = new THREE.MeshLambertMaterial({ color: 0x7d7468 });

export class EnemyManager {
  /** sfx(nome, posição) toca um som posicional */
  constructor(scene, world, sfx = () => {}) {
    this.scene = scene;
    this.world = world;
    this.sfx = sfx;
    this.list = [];
    this.rocks = [];
    this.fx = [];
    this.walked = 0;
    this.wildCd = 5;
    this.lastPlayerPos = null;
    this.onWild = null; // callback(e) quando um selvagem aparece
    for (const sp of SPAWNS) {
      for (let i = 0; i < sp.n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * sp.r;
        this.spawn(sp.type, new THREE.Vector3(sp.x + Math.cos(a) * d, 0, sp.z + Math.sin(a) * d));
      }
    }
  }

  spawn(type, at, opts = {}) {
    const def = TYPES[type];
    const model = buildModel(type);
    model.root.position.copy(at);
    model.root.rotation.y = Math.random() * 6;
    this.scene.add(model.root);
    const bar = makeHpBar(def.boss ? 3 : 1.4);
    bar.visible = false;
    this.scene.add(bar);
    const entry = {
      type, def, model, bar, spawn: at.clone(), pos: model.root.position,
      hp: def.hp, state: 'idle', wander: at.clone(), wanderT: Math.random() * 3,
      atkCd: 0, attackAnim: 0, pendingHit: 0, deadT: 0, flashT: 0, t: Math.random() * 10, moving: 0, provokedT: 0,
      throwCd: 2, windup: 0, wild: !!opts.wild, emergeT: 0, alert: null,
    };
    model.root.userData.enemy = entry;
    this.list.push(entry);
    return entry;
  }

  // ---------- Encontros selvagens ----------
  updateWild(dt, player) {
    this.wildCd -= dt;
    const p = player.pos;
    if (!this.lastPlayerPos) this.lastPlayerPos = p.clone();
    const moved = Math.hypot(p.x - this.lastPlayerPos.x, p.z - this.lastPlayerPos.z);
    this.lastPlayerPos.copy(p);
    if (player.dead || moved > 5 || !this.world.isWooded(p.x, p.z)) return; // >5: teleporte/respawn
    this.walked += moved;
    while (this.walked >= WILD.stepDist) {
      this.walked -= WILD.stepDist;
      if (this.wildCd > 0) continue;
      if (this.list.filter((e) => e.wild && e.state !== 'dead').length >= WILD.max) continue;
      if (Math.random() < WILD.chance) this.spawnWild(player);
    }
  }

  spawnWild(player) {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = WILD.minDist + Math.random() * (WILD.maxDist - WILD.minDist);
      const x = player.pos.x + Math.cos(a) * d, z = player.pos.z + Math.sin(a) * d;
      if (!this.world.isWooded(x, z) || this.world.isBlocked(x, z, 1)) continue;
      const total = WILD.table.reduce((s, [, w]) => s + w, 0);
      let r = Math.random() * total, type = WILD.table[0][0];
      for (const [t, w] of WILD.table) { if ((r -= w) <= 0) { type = t; break; } }

      const e = this.spawn(type, new THREE.Vector3(x, 0, z), { wild: true });
      e.state = 'chase';
      e.provokedT = 8;
      e.emergeT = 0.6;
      e.pos.y = -e.def.height;
      e.model.root.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
      e.alert = makeLabel('!', '#ff4a3d', 2);
      this.scene.add(e.alert);
      e.alertT = 1.6;
      this.wildCd = WILD.cooldown;
      this.sfx('ambush', e.pos);
      this.onWild?.(e);
      return e;
    }
    return null;
  }

  remove(e) {
    e.state = 'dead';
    e.removed = true;
    this.scene.remove(e.model.root, e.bar);
    if (e.alert) this.scene.remove(e.alert);
  }

  alive() { return this.list.filter((e) => e.state !== 'dead'); }

  /** Golpe em arco do jogador. Retorna lista de {enemy, dmg, crit, killed}. */
  hitArc(origin, facing, range, rollDamage) {
    const hits = [];
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.def.radius) continue;
      const dot = (dx * facing.x + dz * facing.z) / (dist || 1);
      if (dot < 0.25 && dist > e.def.radius + 0.6) continue;
      const { dmg, crit } = rollDamage();
      hits.push(this.damage(e, dmg, crit, new THREE.Vector3(dx, 0, dz).normalize(), 0.8));
    }
    return hits;
  }

  /** Aplica dano (corpo a corpo ou flecha). Retorna {enemy, dmg, crit, killed}. */
  damage(e, dmg, crit, dir, knock = 0.8) {
    e.hp -= dmg;
    e.lastHitT = e.t;
    e.flashT = 0.15;
    flash(e.model, 0x880000);
    if (e.state === 'idle') this.sfx(`${e.type}Aggro`, e.pos);
    // voltando pra casa por ter passado do leash: toma dano, mas não volta a perseguir até chegar
    if (e.state !== 'return' || !e.leashed) e.state = 'chase';
    e.provokedT = 8; // persegue mesmo se o jogador estiver longe (ex.: atacou com arco)
    if (!e.def.boss && dir) {
      e.pos.x += dir.x * knock;
      e.pos.z += dir.z * knock;
    }
    const killed = e.hp <= 0;
    if (killed) this.kill(e);
    this.sfx(killed ? `${e.type}Die` : `${e.type}Hurt`, e.pos);
    return { enemy: e, dmg, crit, killed };
  }

  kill(e) {
    e.hp = 0;
    e.state = 'dead';
    e.deadT = e.def.respawn;
    e.windup = 0;
    e.bar.visible = false;
  }

  // ---------- Arremesso de pedra (Golem) ----------
  throwRock(e, target) {
    const T = e.def.throw;
    const from = new THREE.Vector3(e.pos.x, e.def.height + 0.6, e.pos.z);
    const to = new THREE.Vector3(target.x, 0, target.z);
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.scene.add(mesh);

    // marcação no chão: anel vermelho + disco que vai enchendo até o impacto
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(T.radius - 0.18, T.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(T.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    fill.scale.setScalar(0.01);
    marker.add(ring, fill);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(to.x, 0.07, to.z);
    this.scene.add(marker);

    this.rocks.push({ e, mesh, marker, fill, from, to, t: 0, dur: T.flight });
    this.sfx('golemThrow', e.pos);
  }

  updateRocks(dt, player, cb) {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.position.lerpVectors(r.from, r.to, k);
      r.mesh.position.y += Math.sin(k * Math.PI) * 9;
      r.mesh.rotation.x += dt * 6; r.mesh.rotation.z += dt * 4;
      r.fill.scale.setScalar(Math.max(0.01, k));
      if (k < 1) continue;

      this.scene.remove(r.mesh, r.marker);
      this.rocks.splice(i, 1);
      this.sfx('rockImpact', r.to);
      this.dust(r.to, r.e.def.throw.radius);
      if (!player.dead && Math.hypot(player.pos.x - r.to.x, player.pos.z - r.to.z) < r.e.def.throw.radius + 0.4) {
        cb.onPlayerHit(r.e.def.throw.dmg, r.e);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / 0.5;
      f.mesh.scale.setScalar(f.r * (0.4 + k));
      f.mesh.material.opacity = 0.7 * (1 - k);
      if (k >= 1) { this.scene.remove(f.mesh); this.fx.splice(i, 1); }
    }
  }

  dust(at, r) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xb8a990, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.1, at.z);
    this.scene.add(mesh);
    this.fx.push({ mesh, r, t: 0 });
  }

  update(dt, player, camera, cb) {
    for (const e of this.list) {
      const { def, model } = e;
      e.t += dt;

      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) flash(model, 0x000000); }

      if (e.state === 'dead') {
        if (e.removed) continue;
        e.deadT -= dt;
        const since = def.respawn - e.deadT;
        model.root.visible = since < 1.2;
        model.root.position.y = -since * 1.5;
        model.root.rotation.z = Math.min(1.5, since * 3);
        if (e.wild) { if (since > 1.3) this.remove(e); continue; } // selvagens não renascem
        if (e.deadT <= 0) {
          e.state = 'idle'; e.hp = def.hp;
          e.pos.copy(e.spawn); e.pos.y = 0;
          model.root.rotation.z = 0; model.root.visible = true;
        }
        continue;
      }

      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = player.dead ? Infinity : Math.hypot(dx, dz);
      const fromSpawn = Math.hypot(e.pos.x - e.spawn.x, e.pos.z - e.spawn.z);
      let move = null, speed = def.speed;

      if (e.state === 'idle' && dist < def.aggro && !this.world.isSafe(player.pos.x, player.pos.z)) { e.state = 'chase'; this.sfx(`${e.type}Aggro`, e.pos); }
      e.provokedT = Math.max(0, (e.provokedT || 0) - dt);
      e.throwCd -= dt;

      // selvagem longe do jogador e fora de combate some
      if (e.wild && e.state !== 'chase' && dist > WILD.despawnDist) { this.remove(e); continue; }
      // jogador entrou na zona segura: monstros desistem
      if (e.state === 'chase' && this.world.isSafe(player.pos.x, player.pos.z) && e.provokedT <= 6) {
        e.state = 'return'; e.leashed = false; e.windup = 0;
      }

      if (e.state === 'chase') {
        if (fromSpawn > def.leash) { e.state = 'return'; e.leashed = true; e.windup = 0; }
        else if (dist > def.aggro * 2.2 && e.provokedT <= 0) { e.state = 'return'; e.leashed = false; e.windup = 0; }
        else if (dist > def.range * 0.8) move = new THREE.Vector2(dx, dz);

        if (e.state === 'chase' && dist < def.range && e.atkCd <= 0 && e.windup <= 0) {
          e.atkCd = def.cd; e.attackAnim = 1; e.pendingHit = def.boss ? 0.5 : 0.3;
          if (!def.boss) this.sfx(`${e.type}Attack`, e.pos);
        }
        // começa a preparar o arremesso se o jogador está longe
        const T = def.throw;
        if (T && e.state === 'chase' && e.windup <= 0 && e.throwCd <= 0 && e.pendingHit <= 0 && dist > T.min && dist < T.max) {
          e.windup = T.windup; e.throwCd = T.cd;
          this.sfx('golemWindup', e.pos);
        }
        e.model.root.rotation.y = Math.atan2(dx, dz);
      } else if (e.state === 'return') {
        move = new THREE.Vector2(e.spawn.x - e.pos.x, e.spawn.z - e.pos.z);
        speed *= 1.4;
        if (fromSpawn < 1) { e.state = 'idle'; e.leashed = false; }
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 2 + Math.random() * 4;
          e.wander.set(e.spawn.x + (Math.random() - 0.5) * 10, 0, e.spawn.z + (Math.random() - 0.5) * 10);
        }
        const wx = e.wander.x - e.pos.x, wz = e.wander.z - e.pos.z;
        if (Math.hypot(wx, wz) > 0.5) { move = new THREE.Vector2(wx, wz); speed *= 0.35; }
      }

      // preparando arremesso: fica parado com os braços subindo; solta quando termina
      if (e.windup > 0) {
        move = null;
        e.windup -= dt;
        if (e.windup <= 0 && e.state === 'chase' && !player.dead) this.throwRock(e, player.pos);
      }

      // saindo do mato: sobe do chão antes de poder andar/atacar
      if (e.emergeT > 0) {
        e.emergeT -= dt;
        e.pos.y = -def.height * Math.max(0, e.emergeT / 0.6);
        move = null;
        e.atkCd = Math.max(e.atkCd, 0.4);
      } else if (e.pos.y !== 0) e.pos.y = 0;
      if (e.alert) {
        e.alertT -= dt;
        e.alert.position.set(e.pos.x, def.height + 1.4 + Math.abs(Math.sin(e.t * 8)) * 0.25, e.pos.z);
        if (e.alertT <= 0) { this.scene.remove(e.alert); e.alert = null; }
      }

      e.atkCd -= dt;
      if (e.state !== 'chase' && e.hp < def.hp && e.t - (e.lastHitT ?? -99) > REGEN_DELAY) {
        e.hp = Math.min(def.hp, e.hp + def.hp * 0.2 * dt);
      }
      if (e.pendingHit > 0) {
        e.pendingHit -= dt;
        if (e.pendingHit <= 0) {
          if (def.boss) this.sfx('golemSlam', e.pos);
          if (dist < def.range * 1.35) cb.onPlayerHit(def.dmg, e);
        }
      }

      e.moving = 0;
      if (move && move.lengthSq() > 1e-4) {
        move.normalize();
        e.pos.x += move.x * speed * dt;
        e.pos.z += move.y * speed * dt;
        if (e.state !== 'chase') model.root.rotation.y = Math.atan2(move.x, move.y);
        e.moving = Math.min(1, speed / def.speed);
        this.world.resolve(e.pos, def.radius);
        // monstros não entram na zona segura
        const sx = e.pos.x - SAFE_ZONE.x, sz = e.pos.z - SAFE_ZONE.z, sd = Math.hypot(sx, sz);
        const edge = SAFE_ZONE.r + def.radius;
        if (sd < edge && sd > 1e-3) { e.pos.x = SAFE_ZONE.x + (sx / sd) * edge; e.pos.z = SAFE_ZONE.z + (sz / sd) * edge; }
      }

      // animação
      if (e.attackAnim > 0) e.attackAnim = Math.max(0, e.attackAnim - dt * 2.2);
      if (model.slime) {
        const hop = Math.abs(Math.sin(e.t * (e.moving ? 8 : 3)));
        model.body.position.y = e.moving ? hop * 0.6 : 0;
        model.body.scale.set(1 + (1 - hop) * 0.15, 1 - (1 - hop) * 0.15 + e.attackAnim * 0.3, 1 + (1 - hop) * 0.15);
      } else {
        animateCharacter(model, e.t, e.moving, e.attackAnim);
        if (def.boss && e.attackAnim > 0) model.armL.rotation.x = model.armR.rotation.x; // golpe com os dois braços
        if (e.windup > 0) { // ergue a pedra com os dois braços
          const k = 1 - e.windup / def.throw.windup;
          model.armL.rotation.x = model.armR.rotation.x = -3.0 * Math.min(1, k * 1.3);
        }
      }

      // barra de vida
      const showBar = e.hp < def.hp || e.state === 'chase';
      e.bar.visible = showBar;
      if (showBar) {
        e.bar.position.set(e.pos.x, def.height + 0.6, e.pos.z);
        e.bar.quaternion.copy(camera.quaternion);
        e.bar.userData.fg.scale.x = Math.max(0.001, e.hp / def.hp);
      }
    }
    this.updateRocks(dt, player, cb);
    this.updateWild(dt, player);
    if (this.list.some((e) => e.removed)) this.list = this.list.filter((e) => !e.removed);
  }
}
