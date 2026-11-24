// Visual dos monstros. Os dados vêm de uma MobSim local (offline) ou do servidor (online);
// em ambos os casos chegam os mesmos eventos ({e:'attack'|'hurt'|...}).
import * as THREE from 'three';
import { createCharacter, animateCharacter, flash } from './character.js';
import { makeLabel } from './world.js';
import { MobSim, TYPES, TYPE_IDS, STATES, WILD, inArc } from './shared/mobs.js';

export { TYPES, WILD };
export const LOCAL_ID = 'local';

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
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class EnemyManager {
  /**
   * online=false: roda a IA aqui (MobSim). online=true: só desenha o que o servidor manda
   * (applySnapshot/onEvent) e envia os golpes com `send`.
   */
  constructor(scene, world, sfx = () => {}, { online = false } = {}) {
    this.scene = scene;
    this.world = world;
    this.sfx = sfx;
    this.online = online;
    this.myId = LOCAL_ID;
    this.send = null;
    this.views = new Map();
    this.list = [];
    this.rocks = [];
    this.fx = [];
    this.handlers = { onPlayerHit() {}, onDamage() {}, onKill() {}, onWild() {} };
    if (!online) this.sim = new MobSim(world, { emit: (ev) => this.onEvent(ev) });
  }

  alive() { return this.list.filter((e) => e.state !== 'dead'); }

  // ---------- Criação / remoção dos modelos ----------
  createView(id, type, x, z, rot = 0) {
    const def = TYPES[type];
    const model = buildModel(type);
    model.root.position.set(x, 0, z);
    model.root.rotation.y = rot;
    this.scene.add(model.root);
    const bar = makeHpBar(def.boss ? 3 : 1.4);
    bar.visible = false;
    this.scene.add(bar);
    const v = {
      id, type, def, model, bar, pos: model.root.position,
      hp: def.hp, state: 'idle', moving: 0, windup: 0, attackAnim: 0, flashT: 0, deadSince: 0,
      t: Math.random() * 10, alert: null, alertT: 0, target: { x, z, y: 0, rot }, lastSeen: performance.now(),
    };
    model.root.userData.enemy = v;
    this.views.set(id, v);
    this.list.push(v);
    return v;
  }

  removeView(id) {
    const v = this.views.get(id);
    if (!v) return;
    v.state = 'dead';
    this.scene.remove(v.model.root, v.bar);
    if (v.alert) this.scene.remove(v.alert);
    this.views.delete(id);
    this.list = this.list.filter((e) => e !== v);
  }

  /** view do monstro; no modo offline cria na hora se a simulação já tem o monstro */
  view(id) {
    let v = this.views.get(id);
    if (!v && this.sim) {
      const m = this.sim.byId.get(id);
      if (m) v = this.createView(m.id, m.type, m.x, m.z, m.rot);
    }
    return v || null;
  }

  // ---------- Online: estado vindo do servidor ----------
  applySnapshot(list) {
    const now = performance.now();
    for (const [id, ti, x, z, y, rot, hp, st, mv, wu] of list) {
      let v = this.views.get(id);
      if (!v) v = this.createView(id, TYPE_IDS[ti], x, z, rot);
      const state = STATES[st];
      if (state !== 'dead' && v.state === 'dead') { // renasceu
        v.pos.set(x, y, z); v.model.root.rotation.z = 0; v.model.root.visible = true; v.deadSince = 0;
      }
      if (state === 'dead' && v.state !== 'dead') v.deadSince = 0;
      if (Math.hypot(v.pos.x - x, v.pos.z - z) > 6) v.pos.set(x, y, z); // pulo grande: teleporta
      v.target.x = x; v.target.z = z; v.target.y = y; v.target.rot = rot;
      v.hp = hp; v.state = state; v.moving = mv; v.windup = wu; v.lastSeen = now;
    }
  }

  // ---------- Golpes do jogador ----------
  /** Golpe corpo a corpo. Offline resolve aqui; online manda os alvos para o servidor validar. */
  melee(px, pz, fx, fz, range, roll) {
    if (!this.online) { this.sim.hitArc(px, pz, fx, fz, range, roll, this.myId); return; }
    const ids = this.alive().filter((v) => inArc(v.pos.x, v.pos.z, v.def.radius, px, pz, fx, fz, range)).map((v) => v.id);
    if (ids.length) this.send?.({ t: 'hit', kind: 'melee', ids });
  }

  /** Flecha acertou um monstro (detecção no cliente). */
  arrowHit(v, dirX, dirZ, roll) {
    if (!this.online) {
      const { dmg, crit } = roll();
      this.sim.damage(this.sim.byId.get(v.id), dmg, crit, dirX, dirZ, 0.4, this.myId);
      return;
    }
    this.send?.({ t: 'hit', kind: 'arrow', ids: [v.id] });
  }

  // ---------- Eventos (da MobSim local ou do servidor) ----------
  onEvent(ev) {
    const v = ev.id != null && ev.e !== 'rock' && ev.e !== 'impact' ? this.view(ev.id) : null;
    const at = new THREE.Vector3(ev.x ?? v?.pos.x ?? 0, 0, ev.z ?? v?.pos.z ?? 0);
    switch (ev.e) {
      case 'aggro': if (v) this.sfx(`${v.type}Aggro`, at); break;
      case 'attack':
        if (v) { v.attackAnim = 1; if (!v.def.boss) this.sfx(`${v.type}Attack`, at); }
        break;
      case 'slam': this.sfx('golemSlam', at); break;
      case 'windup': if (v) { v.windup = TYPES[v.type].throw.windup; this.sfx('golemWindup', at); } break;
      case 'rock': this.spawnRock(ev); break;
      case 'impact': this.sfx('rockImpact', at); this.dust(at, ev.r); break;
      case 'hurt':
        if (v) {
          v.flashT = 0.15; flash(v.model, 0x880000);
          if (ev.killed) { v.state = 'dead'; v.deadSince = 0; v.hp = 0; }
          this.sfx(ev.killed ? `${v.type}Die` : `${v.type}Hurt`, at);
          this.handlers.onDamage({ enemy: v, dmg: ev.dmg, crit: ev.crit, killed: ev.killed, mine: ev.by === this.myId });
        }
        break;
      case 'killed':
        if (!this.online && ev.credit?.includes(this.myId)) { // online: a recompensa vem do servidor (fx)
          this.handlers.onKill(v || { id: ev.id, type: ev.type, def: TYPES[ev.type], pos: at, state: 'dead' });
        }
        break;
      case 'wild':
        if (v) {
          v.alert = makeLabel('!', '#ff4a3d', 2);
          v.alertT = 1.6;
          this.scene.add(v.alert);
          this.sfx('ambush', at);
          if (ev.pid === this.myId) this.handlers.onWild(v);
        }
        break;
      case 'hurtPlayer': // só no offline (online o servidor aplica o dano e manda o resultado)
        if (ev.pid === this.myId) this.handlers.onPlayerHit(ev.dmg, { def: TYPES[ev.type], type: ev.type });
        break;
      case 'removed': this.removeView(ev.id); break;
      default: break;
    }
  }

  // ---------- Pedra do Golem (visual) ----------
  spawnRock(ev) {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.castShadow = true;
    const from = new THREE.Vector3(ev.fx, ev.fy, ev.fz);
    const to = new THREE.Vector3(ev.tx, 0, ev.tz);
    mesh.position.copy(from);
    this.scene.add(mesh);
    // marcação no chão: anel vermelho + disco que vai enchendo até o impacto
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(ev.r - 0.18, ev.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(ev.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    fill.scale.setScalar(0.01);
    marker.add(ring, fill);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(to.x, 0.07, to.z);
    this.scene.add(marker);
    this.rocks.push({ mesh, marker, fill, from, to, t: 0, dur: ev.dur });
    this.sfx('golemThrow', from);
  }

  dust(at, r) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xb8a990, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.1, at.z);
    this.scene.add(mesh);
    this.fx.push({ mesh, r, t: 0 });
  }

  // ---------- Loop ----------
  update(dt, player, camera) {
    if (!this.online) {
      this.sim.update(dt, [{ id: this.myId, x: player.pos.x, z: player.pos.z, dead: player.dead }]);
      for (const m of this.sim.mobs) {
        const v = this.view(m.id);
        if (!v) continue;
        if (m.state !== 'dead') {
          if (v.state === 'dead') { v.model.root.rotation.z = 0; v.model.root.visible = true; v.deadSince = 0; }
          v.pos.set(m.x, m.y, m.z);
          v.model.root.rotation.y = m.rot;
        } else if (v.state !== 'dead') v.deadSince = 0;
        v.hp = m.hp; v.state = m.state; v.moving = m.moving; v.windup = Math.max(0, m.windup);
      }
    } else {
      const now = performance.now();
      for (const v of [...this.list]) {
        if (now - v.lastSeen > 2000) { this.removeView(v.id); continue; } // saiu do raio de visão
        if (v.state === 'dead') continue;
        const k = Math.min(1, dt * 10);
        v.pos.x += (v.target.x - v.pos.x) * k;
        v.pos.z += (v.target.z - v.pos.z) * k;
        v.pos.y += (v.target.y - v.pos.y) * k;
        v.model.root.rotation.y = lerpAngle(v.model.root.rotation.y, v.target.rot, k);
        v.windup = Math.max(0, v.windup - dt);
      }
    }

    for (const v of this.list) {
      const { def, model } = v;
      v.t += dt;
      if (v.flashT > 0) { v.flashT -= dt; if (v.flashT <= 0) flash(model, 0x000000); }

      if (v.state === 'dead') {
        v.deadSince += dt;
        model.root.visible = v.deadSince < 1.2;
        model.root.position.y = -v.deadSince * 1.5;
        model.root.rotation.z = Math.min(1.5, v.deadSince * 3);
        v.bar.visible = false;
        continue;
      }

      if (v.alert) {
        v.alertT -= dt;
        v.alert.position.set(v.pos.x, def.height + 1.4 + Math.abs(Math.sin(v.t * 8)) * 0.25, v.pos.z);
        if (v.alertT <= 0) { this.scene.remove(v.alert); v.alert = null; }
      }

      if (v.attackAnim > 0) v.attackAnim = Math.max(0, v.attackAnim - dt * 2.2);
      if (model.slime) {
        const hop = Math.abs(Math.sin(v.t * (v.moving ? 8 : 3)));
        model.body.position.y = v.moving ? hop * 0.6 : 0;
        model.body.scale.set(1 + (1 - hop) * 0.15, 1 - (1 - hop) * 0.15 + v.attackAnim * 0.3, 1 + (1 - hop) * 0.15);
      } else {
        animateCharacter(model, v.t, v.moving, v.attackAnim);
        if (def.boss && v.attackAnim > 0) model.armL.rotation.x = model.armR.rotation.x; // golpe com os dois braços
        if (v.windup > 0 && def.throw) { // ergue a pedra com os dois braços
          const k = 1 - v.windup / def.throw.windup;
          model.armL.rotation.x = model.armR.rotation.x = -3.0 * Math.min(1, k * 1.3);
        }
      }

      const showBar = v.hp < def.hp || v.state === 'chase';
      v.bar.visible = showBar;
      if (showBar) {
        v.bar.position.set(v.pos.x, def.height + 0.6, v.pos.z);
        v.bar.quaternion.copy(camera.quaternion);
        v.bar.userData.fg.scale.x = Math.max(0.001, v.hp / def.hp);
      }
    }

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.position.lerpVectors(r.from, r.to, k);
      r.mesh.position.y += Math.sin(k * Math.PI) * 9;
      r.mesh.rotation.x += dt * 6; r.mesh.rotation.z += dt * 4;
      r.fill.scale.setScalar(Math.max(0.01, k));
      if (k >= 1) { this.scene.remove(r.mesh, r.marker); this.rocks.splice(i, 1); }
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
}
