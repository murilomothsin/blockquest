import * as THREE from 'three';

const SPEED = 45;

/** Flechas do arco, com leve "homing" quando há alvo travado. */
export class Projectiles {
  constructor(scene, world, enemies, onHit) {
    this.scene = scene; this.world = world; this.enemies = enemies; this.onHit = onHit;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.07, 0.07, 1.1);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    this.tipGeo = new THREE.ConeGeometry(0.09, 0.25, 4);
    this.tipMat = new THREE.MeshLambertMaterial({ color: 0xbfc5cc });
  }

  fire(from, target, dirFallback, range, roll) {
    const mesh = new THREE.Group();
    const shaft = new THREE.Mesh(this.geo, this.mat);
    const tip = new THREE.Mesh(this.tipGeo, this.tipMat);
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.65;
    mesh.add(shaft, tip);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const aim = target
      ? new THREE.Vector3(target.pos.x, target.def.height * 0.5, target.pos.z)
      : from.clone().addScaledVector(dirFallback, range);
    const vel = aim.sub(from).normalize().multiplyScalar(SPEED);
    this.list.push({ mesh, vel, target, traveled: 0, range, roll });
  }

  update(dt) {
    const look = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const pos = p.mesh.position;
      if (p.target && p.target.state !== 'dead') {
        const want = new THREE.Vector3(p.target.pos.x, p.target.def.height * 0.5, p.target.pos.z).sub(pos).normalize().multiplyScalar(SPEED);
        p.vel.lerp(want, Math.min(1, dt * 8));
      }
      pos.addScaledVector(p.vel, dt);
      p.traveled += SPEED * dt;
      p.mesh.lookAt(look.copy(pos).add(p.vel));

      let done = p.traveled > p.range + 6 || pos.y < 0;
      if (!done) {
        for (const e of this.enemies.list) {
          if (e.state === 'dead') continue;
          if (Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) < e.def.radius + 0.45 && pos.y < e.def.height + 0.3) {
            const { dmg, crit } = p.roll();
            const dir = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize();
            this.onHit(this.enemies.damage(e, dmg, crit, dir, 0.4));
            done = true;
            break;
          }
        }
      }
      if (!done && pos.y < 4) {
        done = this.world.colliders.some((c) => Math.hypot(pos.x - c.x, pos.z - c.z) < c.r);
        if (done) this.onWorld?.(pos.clone());
      }
      if (done) { this.scene.remove(p.mesh); this.list.splice(i, 1); }
    }
  }
}
