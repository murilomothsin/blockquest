// Outros jogadores no mundo: avatar, nome em cima da cabeça e movimento interpolado
import * as THREE from 'three';
import { createCharacter, animateCharacter } from '../character.js';
import { makeLabel } from '../world.js';
import { ITEMS } from '../items.js';

const SHIRTS = [0x2f6fdf, 0x2e9d4a, 0x8a3fb5, 0xe0a72e, 0x1fa3a3, 0xff7ab8, 0x6b7280, 0xf97316];
const PANTS = [0x2b3a67, 0x3b2a1a, 0x333a4a, 0x14532d];
const HAIR = [0x3b2414, 0x111111, 0xc58a3a, 0x8a3b12, 0xe8e8e8];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
  }

  add({ id, name, ...state }) {
    if (this.map.has(id)) return this.map.get(id);
    const h = hash(name.toLowerCase());
    const char = createCharacter({
      shirt: SHIRTS[h % SHIRTS.length], pants: PANTS[(h >>> 4) % PANTS.length], hair: HAIR[(h >>> 8) % HAIR.length],
      weapon: true, bow: true,
    });
    char.root.visible = false;
    this.scene.add(char.root);
    const label = makeLabel(name, '#9fe3ff', 0.75);
    label.visible = false;
    this.scene.add(label);
    const p = {
      id, name, char, label,
      pos: new THREE.Vector3(), target: new THREE.Vector3(), rot: 0, targetRot: 0,
      m: 0, air: false, dead: false, seq: 0, attack: 0, w: null, has: false, t: Math.random() * 10,
    };
    this.map.set(id, p);
    if (state.x != null) this.apply(p, state);
    return p;
  }

  remove(id) {
    const p = this.map.get(id);
    if (!p) return null;
    this.scene.remove(p.char.root, p.label);
    this.map.delete(id);
    return p;
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  apply(p, s) {
    p.target.set(s.x, s.y, s.z);
    p.targetRot = s.r;
    p.m = s.m; p.air = s.air; p.dead = !!s.d;
    if (p.has && s.s !== p.seq) p.attack = 1; // contador de ataques mudou → animar golpe
    p.seq = s.s;
    if (s.w !== p.w) {
      p.w = s.w;
      const it = ITEMS[s.w] || ITEMS.wood_sword;
      p.char.sword.visible = it.style === 'melee';
      p.char.bow.visible = it.style === 'ranged';
      (it.style === 'melee' ? p.char.sword.userData.blade : p.char.bow.userData.limb).material.color.setHex(it.color);
    }
    if (!p.has) { p.pos.copy(p.target); p.rot = p.targetRot; }
    p.has = true;
  }

  snapshot(list, myId) {
    for (const s of list) {
      if (s.id === myId) continue;
      const p = this.map.get(s.id);
      if (p) this.apply(p, s);
    }
  }

  update(dt) {
    for (const p of this.map.values()) {
      p.char.root.visible = p.label.visible = p.has;
      if (!p.has) continue;
      p.t += dt;
      p.pos.lerp(p.target, Math.min(1, dt * 12));
      let d = p.targetRot - p.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.rot += d * Math.min(1, dt * 12);
      p.char.root.position.copy(p.pos);
      p.char.root.rotation.y = p.rot;
      p.char.root.rotation.z = p.dead ? Math.PI / 2 : 0;
      p.attack = Math.max(0, p.attack - dt * 3);
      const ranged = ITEMS[p.w]?.style === 'ranged';
      animateCharacter(p.char, p.t, p.m, ranged ? 0 : p.attack, p.air);
      if (ranged && p.attack > 0) { p.char.armL.rotation.x = -1.55; p.char.armR.rotation.x = -1.35; }
      p.label.position.set(p.pos.x, p.pos.y + 3.3, p.pos.z);
    }
  }

  list() { return [...this.map.values()].filter((p) => p.has); }
}
