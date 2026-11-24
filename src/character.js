import * as THREE from 'three';

// geometrias compartilhadas por tamanho (cada personagem/monstro criava ~20 caixas novas na GPU)
const boxGeos = new Map();
function boxGeo(w, h, d) {
  const k = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  if (!boxGeos.has(k)) boxGeos.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeos.get(k);
}
function box(w, h, d, color) {
  // material continua por personagem: o flash de dano e as cores do equipamento mudam o material
  const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshLambertMaterial({ color }));
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
  const hairParts = [];

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
    hairParts.push(top, back);
  }

  // ---------- Equipamento visual (escondido até equipar) ----------
  // Armadura: peitoral + ombreiras + cinto. Cor principal = item, detalhes num tom mais escuro.
  const armor = new THREE.Group();
  armor.visible = false;
  const chest = box(2.2 * s, 2.05 * s, 1.25 * s, 0xffffff);
  chest.position.y = 3.05 * s;
  const chestPlate = box(1.4 * s, 1.1 * s, 0.1 * s, 0xffffff); // placa frontal em relevo
  chestPlate.position.set(0, 3.35 * s, 0.66 * s);
  const belt = box(2.25 * s, 0.3 * s, 1.3 * s, 0xffffff);
  belt.position.y = 2.15 * s;
  armor.add(chest, chestPlate, belt);
  body.add(armor);
  const pads = [armL, armR].map((arm) => {
    const pad = box(1.3 * s, 0.55 * s, 1.3 * s, 0xffffff);
    pad.position.y = -0.15 * s;
    pad.visible = false;
    arm.add(pad);
    return pad;
  });

  // Capacete: topo + laterais + nuca (rosto livre) + crista
  const helmet = new THREE.Group();
  helmet.visible = false;
  const cap = box(1.4 * s, 0.5 * s, 1.4 * s, 0xffffff);
  cap.position.y = 0.45 * s;
  const sideL = box(0.14 * s, 1.0 * s, 1.4 * s, 0xffffff);
  sideL.position.set(-0.66 * s, 0.05 * s, 0);
  const sideR = sideL.clone(); sideR.material = sideL.material; sideR.position.x = 0.66 * s;
  const nape = box(1.4 * s, 1.0 * s, 0.14 * s, 0xffffff);
  nape.position.set(0, 0.05 * s, -0.66 * s);
  const brow = box(1.42 * s, 0.16 * s, 0.16 * s, 0xffffff);
  brow.position.set(0, 0.28 * s, 0.66 * s);
  const crest = box(0.18 * s, 0.35 * s, 1.1 * s, 0xffffff);
  crest.position.y = 0.85 * s;
  helmet.add(cap, sideL, sideR, nape, brow, crest);
  head.add(helmet);

  const gear = {
    armor, helmet, pads, hairParts,
    main: [chest, belt, ...pads, cap, sideL, sideR, nape].map((m) => m.material),
    trim: [chestPlate, brow, crest].map((m) => m.material),
  };

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

  // Cajado (Arcanista): haste de madeira com um cristal brilhante na ponta. Escondido até equipar.
  let staff = null;
  if (weapon) {
    staff = new THREE.Group();
    staff.position.set(0, -2 * s, 0.1 * s);
    const shaft = box(0.16 * s, 0.16 * s, 3.4 * s, 0x6b4423);
    shaft.position.z = 0.9 * s;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.38 * s, 0), new THREE.MeshLambertMaterial({ color: 0x7fd0ff, emissive: 0x2a6080 }));
    orb.position.z = 2.75 * s;
    orb.castShadow = true;
    orb.userData.glow = true; // o brilho não é apagado pelo flash de dano
    staff.add(shaft, orb);
    staff.userData.orb = orb;
    staff.visible = false;
    armR.add(staff);
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
  root.traverse((o) => { if (o.isMesh && o.material.emissive && !o.userData.glow) materials.push(o.material); });

  return { root, body, legL, legR, armL, armR, head, sword, staff, bow: bowMesh, gear, materials, height: 5.2 * s };
}

/**
 * Mostra a arma certa na mão (espada, adaga, arco ou cajado) com a cor do item.
 * Adaga = espada com lâmina curta.
 */
export function setWeapon(c, it) {
  if (!it) return;
  const melee = it.style === 'melee';
  if (c.sword) {
    c.sword.visible = melee;
    c.sword.userData.blade.scale.z = it.sub === 'dagger' ? 0.45 : 1;
    c.sword.userData.blade.position.z = (it.sub === 'dagger' ? 0.95 : 1.6) * (c.sword.userData.blade.geometry.parameters.depth / 2.4);
    if (melee) c.sword.userData.blade.material.color.setHex(it.color);
  }
  if (c.bow) {
    c.bow.visible = it.style === 'ranged';
    if (it.style === 'ranged') c.bow.userData.limb.material.color.setHex(it.color);
  }
  if (c.staff) {
    c.staff.visible = it.style === 'magic';
    if (it.style === 'magic') {
      const orb = c.staff.userData.orb.material;
      orb.color.setHex(it.color);
      orb.emissive.setHex(it.color).multiplyScalar(0.45);
    }
  }
}

const tmpColor = new THREE.Color();
/**
 * Mostra/esconde armadura e capacete. armorColor/helmetColor = cor do item ou null (sem item).
 * Os materiais são exclusivos de cada personagem, então dá pra pintar direto.
 */
export function setGear(c, { armorColor = null, helmetColor = null } = {}) {
  const g = c.gear;
  if (!g) return;
  g.armor.visible = armorColor != null;
  for (const p of g.pads) p.visible = armorColor != null;
  g.helmet.visible = helmetColor != null;
  for (const h of g.hairParts) h.visible = helmetColor == null; // capacete esconde o cabelo
  const paint = (meshes, color, k) => {
    if (color == null) return;
    for (const m of meshes) m.color.copy(tmpColor.setHex(color)).multiplyScalar(k);
  };
  // peitoral/ombreiras/cinto: [chest, belt, padL, padR] | capacete: [cap, sideL, sideR, nape]
  paint(g.main.slice(0, 4), armorColor, 1);
  paint([g.main[1]], armorColor, 0.6); // cinto mais escuro
  paint([g.trim[0]], armorColor, 0.75);
  paint(g.main.slice(4), helmetColor, 1);
  paint(g.trim.slice(1), helmetColor, 0.7);
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
