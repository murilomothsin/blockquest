import * as THREE from 'three';
import { ITEMS } from './items.js';
import { makeLabel } from './world.js';

/** Baús de loot no chão. Coleta automática ao encostar. */
export class Loot {
  constructor(scene) { this.scene = scene; this.list = []; }

  drop(id, at) {
    const it = ITEMS[id];
    const rare = it.kind === 'weapon';
    const g = new THREE.Group();
    const chest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
    base.position.y = 0.28;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.65), new THREE.MeshLambertMaterial({ color: rare ? 0xb46bff : 0x6b4423 }));
    lid.position.y = 0.66;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.67), new THREE.MeshLambertMaterial({ color: 0xf5c542, emissive: 0x332200 }));
    band.position.y = 0.4;
    for (const m of [base, lid, band]) { m.castShadow = true; chest.add(m); }
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
    this.list.push({ id, g, chest, t: 0 });
  }

  update(dt, player, onPickup) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const l = this.list[i];
      l.t += dt;
      l.chest.rotation.y += dt * 1.5;
      l.chest.position.y = 0.15 + Math.sin(l.t * 3) * 0.12;
      if (l.t > 0.6 && !player.dead && Math.hypot(player.pos.x - l.g.position.x, player.pos.z - l.g.position.z) < 1.8) {
        this.scene.remove(l.g);
        this.list.splice(i, 1);
        onPickup(l.id);
      }
    }
  }
}
