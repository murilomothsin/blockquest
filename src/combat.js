import * as THREE from 'three';
import { inMine } from './shared/worldData.js';

const SPEED = { arrow: 45, magic: 32 };

/** Flechas (arco) e orbes mágicos (cajado), com leve "homing" quando há alvo travado. */
export class Projectiles {
  constructor(scene, world, enemies, onHit) {
    this.scene = scene; this.world = world; this.enemies = enemies; this.onHit = onHit;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.07, 0.07, 1.1);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    this.tipGeo = new THREE.ConeGeometry(0.09, 0.25, 4);
    this.tipMat = new THREE.MeshLambertMaterial({ color: 0xbfc5cc });
    this.orbGeo = new THREE.IcosahedronGeometry(0.32, 0);
  }

  /** kind: 'arrow' | 'magic'. color = cor do cajado (magia) */
  fire(from, target, dirFallback, range, kind = 'arrow', color = 0x7fd0ff) {
    const mesh = new THREE.Group();
    if (kind === 'magic') {
      const orb = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color }));
      const halo = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
      halo.scale.setScalar(1.8);
      mesh.add(orb, halo);
    } else {
      const shaft = new THREE.Mesh(this.geo, this.mat);
      const tip = new THREE.Mesh(this.tipGeo, this.tipMat);
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.65;
      mesh.add(shaft, tip);
    }
    mesh.position.copy(from);
    this.scene.add(mesh);
    const aim = target
      ? new THREE.Vector3(target.pos.x, target.def.height * 0.5, target.pos.z)
      : from.clone().addScaledVector(dirFallback, range);
    const speed = SPEED[kind] || SPEED.arrow;
    const vel = aim.sub(from).normalize().multiplyScalar(speed);
    this.list.push({ mesh, vel, target, traveled: 0, range, kind, speed });
  }

  update(dt) {
    const look = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const pos = p.mesh.position;
      if (p.target && p.target.state !== 'dead') {
        const want = new THREE.Vector3(p.target.pos.x, p.target.def.height * 0.5, p.target.pos.z).sub(pos).normalize().multiplyScalar(p.speed);
        p.vel.lerp(want, Math.min(1, dt * 8));
      }
      pos.addScaledVector(p.vel, dt);
      p.traveled += p.speed * dt;
      p.mesh.lookAt(look.copy(pos).add(p.vel));

      let done = p.traveled > p.range + 6 || pos.y < 0;
      if (!done) {
        for (const e of this.enemies.list) {
          if (e.state === 'dead') continue;
          if (Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) < e.def.radius + 0.45 && pos.y < e.def.height + 0.3) {
            this.onHit(e, p.kind);
            done = true;
            break;
          }
        }
      }
      if (!done && pos.y < 4) {
        done = inMine(pos.x, pos.z)
          ? this.world.isBlocked(pos.x, pos.z) // paredes da mina
          : this.world.colliders.some((c) => Math.hypot(pos.x - c.x, pos.z - c.z) < c.r);
        if (done) this.onWorld?.(pos.clone());
      }
      if (done) { this.scene.remove(p.mesh); this.list.splice(i, 1); }
    }
  }
}
