import * as THREE from 'three';

export const WORLD_RADIUS = 140;

/** Zona segura em volta da vila: nada spawna e monstros não entram */
export const SAFE_ZONE = { x: 0, z: 0, r: 32 };
/** "Mato alto": ponto com pelo menos minTrees árvores num raio de `radius` metros */
export const WOODS = { radius: 10, minTrees: 3 };

export const ZONES = [
  { id: 'village', name: 'Vila Pedraverde', x: 0, z: 0, r: 22, color: '#e9d28a' },
  { id: 'forest', name: 'Floresta Sombria', x: -35, z: -35, r: 18, color: '#2f7a2f' },
  { id: 'meadow', name: 'Campos do Leste', x: 38, z: 40, r: 15, color: '#6fbf4a' },
  { id: 'goblins', name: 'Acampamento Goblin', x: 65, z: -15, r: 14, color: '#a0522d' },
  { id: 'ruins', name: 'Ruínas Antigas', x: 0, z: -95, r: 16, color: '#888888' },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (color) => new THREE.MeshLambertMaterial({ color });
function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function makeLabel(text, color = '#ffffff', size = 1) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(text, 256, 64);
  g.fillStyle = color;
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(4 * size, 1 * size, 1);
  s.userData.canvas = c;
  return s;
}

export function buildWorld(scene) {
  const colliders = []; // {x, z, r}
  const rand = mulberry32(1337);
  const animated = [];

  // Chão
  const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD_RADIUS + 60, 64), mat(0x62b04c));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Zonas pintadas no chão
  for (const z of ZONES) {
    if (z.id === 'meadow') continue;
    const col = { village: 0xd9c07a, forest: 0x3f8a36, goblins: 0x9c7a4f, ruins: 0x9a9a8a }[z.id];
    const d = new THREE.Mesh(new THREE.CircleGeometry(z.r, 40), mat(col));
    d.rotation.x = -Math.PI / 2; d.position.set(z.x, 0.02, z.z); d.receiveShadow = true;
    scene.add(d);
  }

  // Caminhos de terra
  const path = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4, len), mat(0xc9a86a));
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
    p.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2);
    p.receiveShadow = true;
    scene.add(p);
  };
  path(0, 0, -35, -35); path(0, 0, 65, -15); path(0, 0, 38, 40); path(0, 0, 0, -95);

  // Casas da vila
  const house = (x, z, rot, wall, roof) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(6, 4, 6), wall, 0, 2, 0));
    const r = mesh(new THREE.ConeGeometry(5.2, 3, 4), roof, 0, 5.5, 0);
    r.rotation.y = Math.PI / 4;
    g.add(r);
    g.add(mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), 0x6b4423, 0, 1.2, 3.05));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), 0x9fd8ff, -1.9, 2.4, 3.02));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), 0x9fd8ff, 1.9, 2.4, 3.02));
    g.position.set(x, 0, z); g.rotation.y = rot;
    scene.add(g);
    colliders.push({ x, z, r: 4.3 });
  };
  house(-12, -10, Math.PI / 4, 0xf1e3c6, 0xb5402f);
  house(12, -12, -Math.PI / 4, 0xe8d3a9, 0x3b5fb5);
  house(-14, 10, (3 * Math.PI) / 4, 0xf3efe6, 0x2f8a4a);
  house(14, 11, (-3 * Math.PI) / 4, 0xe6c9a8, 0x8a3fb5);

  // Poço central
  const well = new THREE.Group();
  well.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 12), 0x8a8a8a, 0, 0.5, 0));
  well.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.02, 12), 0x2a5fa0, 0, 0.52, 0));
  well.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), 0x6b4423, -1.2, 1.2, 0));
  well.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), 0x6b4423, 1.2, 1.2, 0));
  const wr = mesh(new THREE.ConeGeometry(2, 1, 4), 0xb5402f, 0, 2.8, 0); wr.rotation.y = Math.PI / 4;
  well.add(wr);
  scene.add(well);
  colliders.push({ x: 0, z: 0, r: 1.6 });

  // Lago
  const lake = new THREE.Mesh(new THREE.CircleGeometry(11, 32), new THREE.MeshLambertMaterial({ color: 0x3a8fd9, transparent: true, opacity: 0.85 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(-45, 0.05, 30);
  scene.add(lake);
  colliders.push({ x: -45, z: 30, r: 10.5 });

  // Árvores
  const trunkGeo = new THREE.BoxGeometry(0.8, 3, 0.8);
  const leafGeo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  const pineGeo = new THREE.ConeGeometry(2, 4.5, 6);
  const nearZone = (x, z, pad) => ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * (zn.id === 'forest' ? 0.55 : 1) + pad);
  const onPath = (x, z, half = 4) => {
    const segs = [[-35, -35], [65, -15], [38, 40], [0, -95]];
    return segs.some(([ex, ez]) => {
      const len2 = ex * ex + ez * ez;
      const t = Math.max(0, Math.min(1, (x * ex + z * ez) / len2));
      return Math.hypot(x - ex * t, z - ez * t) < half;
    });
  };
  const trees = [];
  let placed = 0;
  for (let i = 0; i < 2000 && placed < 260; i++) {
    const a = rand() * Math.PI * 2;
    const d = 24 + Math.sqrt(rand()) * (WORLD_RADIUS - 20);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const inForest = Math.hypot(x + 35, z + 35) < 30;
    if (!inForest && rand() < 0.45) continue;
    if (nearZone(x, z, 2) || onPath(x, z) || Math.hypot(x + 45, z - 30) < 13) continue;
    const t = new THREE.Group();
    const sc = 0.8 + rand() * 0.7;
    t.add(mesh(trunkGeo, 0x7a4e2a, 0, 1.5, 0));
    if (inForest || rand() < 0.4) {
      const p = mesh(pineGeo, inForest ? 0x1f5e2a : 0x2e7d32, 0, 4.6, 0);
      t.add(p);
    } else {
      t.add(mesh(leafGeo, [0x3fa34d, 0x56b84a, 0x2f8f3f][Math.floor(rand() * 3)], 0, 4.2, 0));
    }
    t.position.set(x, 0, z); t.scale.setScalar(sc); t.rotation.y = rand() * 6;
    scene.add(t);
    colliders.push({ x, z, r: 0.7 * sc });
    trees.push({ x, z, group: t, faded: false });
    placed++;
  }

  // Pedras
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2, d = 25 + rand() * (WORLD_RADIUS - 25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (onPath(x, z) || nearZone(x, z, 1)) continue;
    const s = 0.6 + rand() * 1.4;
    const r = mesh(new THREE.DodecahedronGeometry(s, 0), 0x8d8d8d, x, s * 0.5, z);
    r.rotation.set(rand(), rand(), rand());
    scene.add(r);
    colliders.push({ x, z, r: s * 0.9 });
  }

  // Acampamento goblin
  const gc = ZONES.find((z) => z.id === 'goblins');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const x = gc.x + Math.cos(a) * 9, z = gc.z + Math.sin(a) * 9;
    const tent = mesh(new THREE.ConeGeometry(2.6, 3.5, 4), [0x8b5a2b, 0x6b8e23][i % 2], x, 1.75, z);
    scene.add(tent);
    colliders.push({ x, z, r: 2.2 });
  }
  const fire = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const l = mesh(new THREE.BoxGeometry(1.6, 0.3, 0.3), 0x5a3a1a, 0, 0.15, 0);
    l.rotation.y = (i / 5) * Math.PI; fire.add(l);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
  flame.position.y = 0.9; fire.add(flame);
  const fireLight = new THREE.PointLight(0xff8c1a, 30, 18);
  fireLight.position.y = 2; fire.add(fireLight);
  fire.position.set(gc.x, 0, gc.z);
  scene.add(fire);
  colliders.push({ x: gc.x, z: gc.z, r: 1 });
  animated.push((t) => { flame.scale.set(1 + Math.sin(t * 13) * 0.15, 1 + Math.sin(t * 17) * 0.25, 1); fireLight.intensity = 26 + Math.sin(t * 20) * 6; });

  // Ruínas
  const rz = ZONES.find((z) => z.id === 'ruins');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = rz.x + Math.cos(a) * 14, z = rz.z + Math.sin(a) * 14;
    const h = i % 3 === 0 ? 2 : 6 + rand() * 3;
    scene.add(mesh(new THREE.BoxGeometry(1.8, h, 1.8), 0xa7a397, x, h / 2, z));
    colliders.push({ x, z, r: 1.4 });
  }
  const altar = mesh(new THREE.BoxGeometry(4, 0.6, 4), 0x6d6a60, rz.x, 0.3, rz.z - 6);
  scene.add(altar);

  // Placas indicativas
  const sign = (x, z, text) => {
    scene.add(mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), 0x6b4423, x, 1.1, z));
    const l = makeLabel(text, '#ffe9a8', 0.8);
    l.position.set(x, 2.7, z);
    scene.add(l);
  };
  sign(-20, -17, '↖ Floresta Sombria');
  sign(22, -6, '→ Acampamento Goblin');
  sign(19, 22, '↘ Campos do Leste');
  sign(3, -24, '↓ Ruínas Antigas');

  // Limite do mapa: anel de montanhas (o jogador é travado em WORLD_RADIUS)
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rand() * 0.04;
    const d = WORLD_RADIUS + 14 + rand() * 18;
    const h = 16 + rand() * 28, rad = 12 + rand() * 10;
    const sides = 5 + Math.floor(rand() * 3);
    const m = mesh(new THREE.ConeGeometry(rad, h, sides), [0x6f8a5e, 0x7d8a74, 0x667a58][i % 3], Math.cos(a) * d, h / 2 - 0.5, Math.sin(a) * d);
    m.rotation.y = rand() * Math.PI;
    m.castShadow = false;
    scene.add(m);
    if (h > 30) { // pico nevado
      const capH = h * 0.28;
      const cap = mesh(new THREE.ConeGeometry(rad * 0.28 + 0.3, capH, sides), 0xf2f4f5, m.position.x, h - capH / 2 - 0.4, m.position.z);
      cap.rotation.y = m.rotation.y; cap.castShadow = false;
      scene.add(cap);
    }
  }
  // rochas baixas marcando a borda caminhável
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const s = 1.4 + rand() * 1.6;
    const r = mesh(new THREE.DodecahedronGeometry(s, 0), 0x8d8d8d, Math.cos(a) * (WORLD_RADIUS + 2.5), s * 0.4, Math.sin(a) * (WORLD_RADIUS + 2.5));
    r.rotation.set(rand(), rand(), rand());
    scene.add(r);
  }

  // Nuvens
  for (let i = 0; i < 25; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(8 + rand() * 10, 2, 5 + rand() * 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    c.position.set((rand() - 0.5) * 300, 40 + rand() * 15, (rand() - 0.5) * 300);
    scene.add(c);
    const sp = 1 + rand() * 2;
    animated.push((t, dt) => { c.position.x += sp * dt; if (c.position.x > 160) c.position.x = -160; });
  }

  function resolve(pos, radius) {
    for (const c of colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > WORLD_RADIUS) { pos.x *= WORLD_RADIUS / r; pos.z *= WORLD_RADIUS / r; }
  }

  function zoneAt(x, z) {
    return ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 4) || null;
  }

  // ---------- Áreas para encontros selvagens ----------
  const isSafe = (x, z) => Math.hypot(x - SAFE_ZONE.x, z - SAFE_ZONE.z) < SAFE_ZONE.r;
  const isRoad = (x, z) => onPath(x, z, 5.5);
  const treesNear = (x, z, r) => {
    let n = 0;
    for (const t of trees) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r) n++;
    return n;
  };
  /** "mato alto": área com árvores, fora da zona segura e da estrada */
  const isWooded = (x, z) => !isSafe(x, z) && !isRoad(x, z) && treesNear(x, z, WOODS.radius) >= WOODS.minTrees;
  const isBlocked = (x, z, r = 1) => colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r) || Math.hypot(x, z) > WORLD_RADIUS - 2;

  // borda da zona segura desenhada no chão
  const safeRing = new THREE.Mesh(new THREE.RingGeometry(SAFE_ZONE.r - 0.35, SAFE_ZONE.r, 120),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.35, depthWrite: false }));
  safeRing.rotation.x = -Math.PI / 2;
  safeRing.position.set(SAFE_ZONE.x, 0.04, SAFE_ZONE.z);
  scene.add(safeRing);

  /** Deixa semitransparentes as árvores entre a câmera e o jogador (senão a copa tampa a visão) */
  function fadeOccluders(cam, target) {
    const sx = target.x - cam.x, sz = target.z - cam.z;
    const len2 = sx * sx + sz * sz || 1;
    for (const t of trees) {
      if (Math.abs(t.x - target.x) > 35 || Math.abs(t.z - target.z) > 35) { if (t.faded) setFade(t, false); continue; }
      const k = Math.max(0, Math.min(1, ((t.x - cam.x) * sx + (t.z - cam.z) * sz) / len2));
      const d = Math.hypot(cam.x + sx * k - t.x, cam.z + sz * k - t.z);
      const block = d < 2.6 * t.group.scale.x && k < 0.97;
      if (block !== t.faded) setFade(t, block);
    }
  }
  function setFade(t, on) {
    t.faded = on;
    t.group.traverse((o) => {
      if (!o.isMesh) return;
      o.material.transparent = on;
      o.material.opacity = on ? 0.22 : 1;
      o.material.depthWrite = !on;
    });
  }

  return {
    colliders, trees, resolve, zoneAt, isSafe, isRoad, isWooded, isBlocked, fadeOccluders,
    update: (t, dt) => animated.forEach((f) => f(t, dt)),
  };
}
