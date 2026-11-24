import * as THREE from 'three';
import { createCharacter, animateCharacter, flash } from './character.js';

export const TYPES = {
  slime: { name: 'Slime', hp: 30, dmg: 5, speed: 2.6, xp: 12, gold: [1, 4], aggro: 9, range: 1.7, cd: 1.4, respawn: 15, radius: 0.7, height: 1.2 },
  goblin: { name: 'Goblin', hp: 75, dmg: 10, speed: 3.9, xp: 32, gold: [4, 10], aggro: 13, range: 2.0, cd: 1.1, respawn: 20, radius: 0.6, height: 2.3 },
  golem: { name: 'Golem Antigo', hp: 700, dmg: 26, speed: 2.9, xp: 450, gold: [150, 220], aggro: 18, range: 3.8, cd: 2.0, respawn: 60, radius: 1.8, height: 6.3, boss: true },
};

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
    // orelhas
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

export class EnemyManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    for (const sp of SPAWNS) {
      for (let i = 0; i < sp.n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * sp.r;
        this.spawn(sp.type, new THREE.Vector3(sp.x + Math.cos(a) * d, 0, sp.z + Math.sin(a) * d));
      }
    }
  }

  spawn(type, at) {
    const def = TYPES[type];
    const model = buildModel(type);
    model.root.position.copy(at);
    model.root.rotation.y = Math.random() * 6;
    this.scene.add(model.root);
    const bar = makeHpBar(def.boss ? 3 : 1.4);
    bar.visible = false;
    this.scene.add(bar);
    this.list.push({
      type, def, model, bar, spawn: at.clone(), pos: model.root.position,
      hp: def.hp, state: 'idle', wander: at.clone(), wanderT: Math.random() * 3,
      atkCd: 0, attackAnim: 0, pendingHit: 0, deadT: 0, flashT: 0, t: Math.random() * 10, moving: 0,
    });
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
      e.hp -= dmg;
      e.flashT = 0.15;
      flash(e.model, 0x880000);
      if (e.state !== 'return') e.state = 'chase';
      if (!e.def.boss) {
        e.pos.x += (dx / (dist || 1)) * 0.8;
        e.pos.z += (dz / (dist || 1)) * 0.8;
      }
      const killed = e.hp <= 0;
      if (killed) this.kill(e);
      hits.push({ enemy: e, dmg, crit, killed });
    }
    return hits;
  }

  kill(e) {
    e.hp = 0;
    e.state = 'dead';
    e.deadT = e.def.respawn;
    e.bar.visible = false;
  }

  update(dt, player, camera, cb) {
    for (const e of this.list) {
      const { def, model } = e;
      e.t += dt;

      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) flash(model, 0x000000); }

      if (e.state === 'dead') {
        e.deadT -= dt;
        const since = def.respawn - e.deadT;
        model.root.visible = since < 1.2;
        model.root.position.y = -since * 1.5;
        model.root.rotation.z = Math.min(1.5, since * 3);
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

      if (e.state === 'idle' && dist < def.aggro) e.state = 'chase';

      if (e.state === 'chase') {
        if (fromSpawn > (def.boss ? 22 : 30) || dist > def.aggro * 2.2) e.state = 'return';
        else if (dist > def.range * 0.8) move = new THREE.Vector2(dx, dz);
        if (dist < def.range && e.atkCd <= 0) {
          e.atkCd = def.cd; e.attackAnim = 1; e.pendingHit = def.boss ? 0.5 : 0.3;
        }
        e.model.root.rotation.y = Math.atan2(dx, dz);
      } else if (e.state === 'return') {
        move = new THREE.Vector2(e.spawn.x - e.pos.x, e.spawn.z - e.pos.z);
        speed *= 1.4;
        e.hp = Math.min(def.hp, e.hp + def.hp * 0.5 * dt);
        if (fromSpawn < 1) e.state = 'idle';
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 2 + Math.random() * 4;
          e.wander.set(e.spawn.x + (Math.random() - 0.5) * 10, 0, e.spawn.z + (Math.random() - 0.5) * 10);
        }
        const wx = e.wander.x - e.pos.x, wz = e.wander.z - e.pos.z;
        if (Math.hypot(wx, wz) > 0.5) { move = new THREE.Vector2(wx, wz); speed *= 0.35; }
      }

      e.atkCd -= dt;
      if (e.pendingHit > 0) {
        e.pendingHit -= dt;
        if (e.pendingHit <= 0 && dist < def.range * 1.35) cb.onPlayerHit(def.dmg, e);
      }

      e.moving = 0;
      if (move && move.lengthSq() > 1e-4) {
        move.normalize();
        e.pos.x += move.x * speed * dt;
        e.pos.z += move.y * speed * dt;
        if (e.state !== 'chase') model.root.rotation.y = Math.atan2(move.x, move.y);
        e.moving = Math.min(1, speed / def.speed);
        this.world.resolve(e.pos, def.radius);
      }

      // animação
      if (e.attackAnim > 0) e.attackAnim = Math.max(0, e.attackAnim - dt * 2.2);
      if (model.slime) {
        const hop = Math.abs(Math.sin(e.t * (e.moving ? 8 : 3)));
        model.body.position.y = e.moving ? hop * 0.6 : 0;
        model.body.scale.set(1 + (1 - hop) * 0.15, 1 - (1 - hop) * 0.15 + e.attackAnim * 0.3, 1 + (1 - hop) * 0.15);
      } else {
        animateCharacter(model, e.t, e.moving, e.attackAnim);
        if (def.boss && e.attackAnim > 0) {
          model.armL.rotation.x = model.armR.rotation.x; // golpe com os dois braços
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
  }
}
