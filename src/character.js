import * as THREE from 'three';

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Personagem blocado estilo Roblox. Olha para +Z.
 * Membros têm pivô no ombro/quadril para animar.
 */
export function createCharacter({
  skin = 0xf5c99b, shirt = 0x2f6fdf, pants = 0x333a4a, hair = 0x4a2f1b,
  eyes = 0x111111, scale = 1, weapon = false, swordColor = 0xcfd6de, bow = false,
} = {}) {
  const s = 0.5 * scale;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const limb = (color, x, y, sleeve) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = box(1 * s, 2 * s, 1 * s, color);
    m.position.y = -1 * s;
    pivot.add(m);
    if (sleeve != null) {
      const sl = box(1.05 * s, 0.8 * s, 1.05 * s, sleeve);
      sl.position.y = -0.4 * s;
      pivot.add(sl);
    }
    body.add(pivot);
    return pivot;
  };

  const legL = limb(pants, -0.5 * s, 2 * s);
  const legR = limb(pants, 0.5 * s, 2 * s);
  const torso = box(2 * s, 2 * s, 1 * s, shirt);
  torso.position.y = 3 * s;
  body.add(torso);
  const armL = limb(skin, -1.5 * s, 4 * s, shirt);
  const armR = limb(skin, 1.5 * s, 4 * s, shirt);

  const head = box(1.2 * s, 1.2 * s, 1.2 * s, skin);
  head.position.y = 4.6 * s;
  body.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: eyes });
  for (const x of [-0.25, 0.25]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.24 * s, 0.04 * s), eyeMat);
    e.position.set(x * s, 0.1 * s, 0.61 * s);
    head.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.08 * s, 0.04 * s), new THREE.MeshBasicMaterial({ color: 0x3a1a1a }));
  mouth.position.set(0, -0.25 * s, 0.61 * s);
  head.add(mouth);

  if (hair != null) {
    const top = box(1.3 * s, 0.35 * s, 1.3 * s, hair);
    top.position.y = 0.55 * s;
    head.add(top);
    const back = box(1.3 * s, 0.8 * s, 0.3 * s, hair);
    back.position.set(0, 0.2 * s, -0.55 * s);
    head.add(back);
  }

  let sword = null;
  if (weapon) {
    sword = new THREE.Group();
    sword.position.set(0, -2 * s, 0.1 * s);
    const hilt = box(0.2 * s, 0.2 * s, 0.6 * s, 0x5a3a1a);
    const guard = box(0.7 * s, 0.15 * s, 0.15 * s, 0xc9a227);
    guard.position.z = 0.35 * s;
    const blade = box(0.15 * s, 0.3 * s, 2.4 * s, swordColor);
    blade.position.z = 1.6 * s;
    sword.add(hilt, guard, blade);
    sword.userData.blade = blade;
    armR.add(sword);
  }

  let bowMesh = null;
  if (bow) {
    // Arco na mão esquerda: arco de torus no plano YZ do braço, barriga apontando pra frente ao mirar
    bowMesh = new THREE.Group();
    const r = 1.15 * s;
    const limbs = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12 * s, 6, 16, Math.PI), new THREE.MeshLambertMaterial({ color: 0x9a6a3a }));
    limbs.rotation.y = Math.PI / 2;
    limbs.castShadow = true;
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.04 * s, 2 * r), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
    bowMesh.add(limbs, str);
    bowMesh.rotation.x = Math.PI;
    bowMesh.position.set(0, -2.2 * s + r, 0);
    bowMesh.userData.limb = limbs;
    bowMesh.visible = false;
    armL.add(bowMesh);
  }

  const materials = [];
  root.traverse((o) => { if (o.isMesh && o.material.emissive) materials.push(o.material); });

  return { root, body, legL, legR, armL, armR, head, sword, bow: bowMesh, materials, height: 5.2 * s };
}

/** attack: 0..1 (1 = início do golpe) */
export function animateCharacter(c, t, moveAmount, attack = 0, airborne = false) {
  const swing = Math.sin(t * 11) * 0.9 * moveAmount;
  if (airborne) {
    c.legL.rotation.x = -0.5; c.legR.rotation.x = 0.3;
    c.armL.rotation.x = -2.6;
  } else {
    c.legL.rotation.x = swing;
    c.legR.rotation.x = -swing;
    c.armL.rotation.x = -swing;
  }
  if (attack > 0) {
    const p = 1 - attack;
    c.armR.rotation.x = -2.8 + Math.min(1, p * 1.6) * 3.1;
  } else {
    c.armR.rotation.x = airborne ? -2.6 : swing;
  }
  c.body.position.y = moveAmount > 0 && !airborne ? Math.abs(Math.sin(t * 11)) * 0.08 : 0;
}

export function flash(c, color = 0xff0000) {
  for (const m of c.materials) m.emissive.setHex(color);
}
