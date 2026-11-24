import * as THREE from 'three';
import { ITEMS } from './items.js';
import { makeLabel } from './world.js';

/**
 * Baús de loot no chão. Encostar manda um pedido de "pegar" (offline resolve na hora;
 * online o servidor confere a distância e responde). O baú some quando chega o lootGone.
 */
export class Loot {
  constructor(scene) { this.scene = scene; this.list = []; }

  /** id = item ou 'gold' (n moedas) */
  drop(id, at, lid, n = 1) {
    if (lid != null && this.list.some((l) => l.lid === lid)) return; // já está no chão (reconexão)
    if (id === 'gold') return this.dropGold(at, lid, n);
    const it = ITEMS[id];
    if (!it) return;
    const rare = it.kind !== 'consumable';
    const g = new THREE.Group();
    const chest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
    base.position.y = 0.28;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.65), new THREE.MeshLambertMaterial({ color: rare ? 0xb46bff : 0x6b4423 }));
    top.position.y = 0.66;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.67), new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0x332200 }));
    band.position.y = 0.4;
    for (const m of [base, top, band]) { m.castShadow = true; chest.add(m); }
    g.add(chest);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 10, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: rare ? 0xb46bff : 0x7dff7d, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 5;
    g.add(beam);
    const label = makeLabel(`${it.icon} ${it.name}`, rare ? '#d9b3ff' : '#b8ffb0', 0.7);
    label.position.y = 1.6;
    g.add(label);
    g.position.set(at.x, 0, at.z);
    this.scene.add(g);
    this.list.push({ id, lid, g, chest, t: 0, askedT: -99 });
  }

  /** pilha de moedas douradas girando */
  dropGold(at, lid, n) {
    const g = new THREE.Group();
    const chest = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x5a3a00 });
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14);
    const count = Math.min(7, 2 + Math.floor(n / 15));
    for (let i = 0; i < count; i++) {
      const c = new THREE.Mesh(geo, mat);
      c.position.set((i % 3 - 1) * 0.22, 0.05 + i * 0.07, (Math.floor(i / 3) - 0.5) * 0.2);
      c.castShadow = true;
      chest.add(c);
    }
    const big = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18), mat);
    big.rotation.x = Math.PI / 2; big.position.y = 0.95;
    chest.add(big);
    g.add(chest);
    const label = makeLabel(`+${n} ouro`, '#ffd65c', 0.6);
    label.position.y = 1.7;
    g.add(label);
    g.position.set(at.x, 0, at.z);
    this.scene.add(g);
    this.list.push({ id: 'gold', lid, g, chest, t: 0, askedT: -99, coin: big });
  }

  remove(lid) {
    const i = this.list.findIndex((l) => l.lid === lid);
    if (i < 0) return;
    this.scene.remove(this.list[i].g);
    this.list.splice(i, 1);
  }

  clear() { for (const l of this.list) this.scene.remove(l.g); this.list = []; }

  update(dt, player, onTouch) {
    for (const l of [...this.list]) {
      l.t += dt;
      l.chest.rotation.y += dt * 1.5;
      l.chest.position.y = 0.15 + Math.sin(l.t * 3) * 0.12;
      const touching = !player.dead && Math.hypot(player.pos.x - l.g.position.x, player.pos.z - l.g.position.z) < 1.8;
      if (l.t > 0.6 && touching && l.t - l.askedT > 1) { l.askedT = l.t; onTouch(l.lid); } // pede de novo no máx. 1x/s
    }
  }
}
