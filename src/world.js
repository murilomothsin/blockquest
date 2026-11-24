// Desenha o mapa (three.js) a partir do layout compartilhado em shared/worldData.js:
// superfície com biomas, entrada e interior da mina, interior da casa e baús de tesouro.
import * as THREE from 'three';
import { mulberry32 } from './shared/rng.js';
import {
  WORLD_RADIUS, SAFE_ZONE, WOODS, ZONES, PATHS, HOUSES, LAKE, BIOMES, biomeBlend, buildLayout, createWorldQueries,
  MINE, MINE_GRID, mineTileCenter, MINE_DOOR, MINE_EXIT, HOME, HOME_FURNITURE, HOME_EXIT, HOME_DOOR, TREASURES, inMine,
} from './shared/worldData.js';

export { WORLD_RADIUS, SAFE_ZONE, WOODS, ZONES };

const mat = (color) => new THREE.MeshLambertMaterial({ color });
function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const glow = (geo, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  return m;
};

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

/** Baú de tesouro com tampa que abre (pivô na traseira). tier 3 = dourado. */
function treasureChest(tier) {
  const g = new THREE.Group();
  const wood = tier === 3 ? 0x6b2f1a : 0x7a4a22;
  const metal = tier === 3 ? 0xffd23a : tier === 2 ? 0xc0c6cc : 0x8a6a3a;
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.85, 1), wood, 0, 0.43, 0));
  for (const x of [-0.55, 0.55]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.9, 1.04), metal, x, 0.45, 0));
  const lid = new THREE.Group();
  lid.position.set(0, 0.86, -0.5);
  const top = mesh(new THREE.BoxGeometry(1.52, 0.35, 1.02), wood, 0, 0.17, 0.5);
  const band = mesh(new THREE.BoxGeometry(0.2, 0.37, 1.04), metal, 0, 0.17, 0.5);
  const lock = mesh(new THREE.BoxGeometry(0.25, 0.3, 0.08), metal, 0, -0.05, 1.03);
  lid.add(top, band, lock);
  g.add(lid);
  const shine = glow(new THREE.OctahedronGeometry(0.12, 0), 0xfff2a8, 0, 1.5, 0);
  g.add(shine);
  return { group: g, lid, shine };
}

export function buildWorld(scene) {
  const layout = buildLayout();
  const q = createWorldQueries(layout);
  const animated = [];
  const R = WORLD_RADIUS + 80;

  // ---------- Chão com as cores dos biomas (vértices coloridos) ----------
  const groundGeo = new THREE.PlaneGeometry(R * 2, R * 2, 170, 170);
  groundGeo.rotateX(-Math.PI / 2);
  const colors = [];
  const base = new THREE.Color(BIOMES.grass.ground), c2 = new THREE.Color(), out = new THREE.Color();
  const noise = mulberry32(7);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const b = biomeBlend(x, z);
    out.copy(base);
    if (b.k > 0) out.lerp(c2.setHex(BIOMES[b.id].ground), b.k);
    out.offsetHSL(0, 0, (noise() - 0.5) * 0.04);
    colors.push(out.r, out.g, out.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Zonas pintadas no chão
  for (const z of ZONES) {
    const col = { village: 0xd9c07a, forest: 0x3f8a36, goblins: 0x9c7a4f, ruins: 0x9a9a8a }[z.id];
    if (!col) continue;
    const d = new THREE.Mesh(new THREE.CircleGeometry(z.r, 40), mat(col));
    d.rotation.x = -Math.PI / 2; d.position.set(z.x, 0.02, z.z); d.receiveShadow = true;
    scene.add(d);
  }

  // Caminhos de terra (da vila até cada área)
  for (const [x2, z2] of PATHS) {
    const len = Math.hypot(x2, z2);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4, len), mat(0xc9a86a));
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = -Math.atan2(x2, z2);
    p.position.set(x2 / 2, 0.03, z2 / 2);
    p.receiveShadow = true;
    scene.add(p);
  }

  // Casas da vila (a primeira é a do jogador)
  for (const h of HOUSES) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(6, 4, 6), h.wall, 0, 2, 0));
    const r = mesh(new THREE.ConeGeometry(5.2, 3, 4), h.roof, 0, 5.5, 0);
    r.rotation.y = Math.PI / 4;
    g.add(r);
    g.add(mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), h.mine ? 0x8a5a2b : 0x6b4423, 0, 1.2, 3.05));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), 0x9fd8ff, -1.9, 2.4, 3.02));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), 0x9fd8ff, 1.9, 2.4, 3.02));
    if (h.mine) {
      g.add(glow(new THREE.BoxGeometry(0.2, 0.2, 0.1), 0xffd65c, 0.5, 1.2, 3.17)); // maçaneta dourada
      const lamp = glow(new THREE.BoxGeometry(0.3, 0.4, 0.3), 0xffe08a, 0, 2.75, 3.25);
      g.add(lamp);
    }
    g.position.set(h.x, 0, h.z); g.rotation.y = h.rot;
    scene.add(g);
  }
  const homeLabel = makeLabel('🏠 Sua Casa', '#ffe08a', 0.9);
  homeLabel.position.set(HOME_DOOR.x, 4.2, HOME_DOOR.z);
  scene.add(homeLabel);

  // Poço central
  const well = new THREE.Group();
  well.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 12), 0x8a8a8a, 0, 0.5, 0));
  well.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.02, 12), 0x2a5fa0, 0, 0.52, 0));
  well.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), 0x6b4423, -1.2, 1.2, 0));
  well.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), 0x6b4423, 1.2, 1.2, 0));
  const wr = mesh(new THREE.ConeGeometry(2, 1, 4), 0xb5402f, 0, 2.8, 0); wr.rotation.y = Math.PI / 4;
  well.add(wr);
  scene.add(well);

  // Lago
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 32), new THREE.MeshLambertMaterial({ color: 0x3a8fd9, transparent: true, opacity: 0.85 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, 0.05, LAKE.z);
  scene.add(lake);

  // Árvores
  const trunkGeo = new THREE.BoxGeometry(0.8, 3, 0.8);
  const leafGeo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  const pineGeo = new THREE.ConeGeometry(2, 4.5, 6);
  const trees = [];
  for (const tr of layout.trees) {
    const t = new THREE.Group();
    t.add(mesh(trunkGeo, 0x7a4e2a, 0, 1.5, 0));
    if (tr.pine) t.add(mesh(pineGeo, tr.inForest ? 0x1f5e2a : 0x2e7d32, 0, 4.6, 0));
    else t.add(mesh(leafGeo, tr.leaf, 0, 4.2, 0));
    t.position.set(tr.x, 0, tr.z); t.scale.setScalar(tr.s); t.rotation.y = tr.rot;
    scene.add(t);
    trees.push({ x: tr.x, z: tr.z, group: t, faded: false });
  }
  // Pântano: árvores mortas (tronco escuro e galhos tortos)
  const branchGeo = new THREE.BoxGeometry(0.3, 1.8, 0.3);
  for (const tr of layout.deadTrees) {
    const t = new THREE.Group();
    t.add(mesh(new THREE.BoxGeometry(0.7, 4.2, 0.7), 0x3b3128, 0, 2.1, 0));
    for (const [y, rz, ry] of [[3.2, 0.9, 0], [2.6, -0.8, 1.6], [3.8, 0.6, 3.1]]) {
      const b = mesh(branchGeo, 0x3b3128, 0, y, 0);
      b.rotation.set(0, ry, rz); b.position.x = Math.cos(ry) * 0.6; b.position.z = -Math.sin(ry) * 0.6;
      t.add(b);
    }
    t.position.set(tr.x, 0, tr.z); t.scale.setScalar(tr.s); t.rotation.y = tr.rot;
    scene.add(t);
    trees.push({ x: tr.x, z: tr.z, group: t, faded: false });
  }

  // Pedras (cor do bioma; na pedreira algumas têm minério brilhando)
  for (const r of layout.rocks) {
    const m = mesh(new THREE.DodecahedronGeometry(r.s, 0), r.color, r.x, r.s * 0.5, r.z);
    m.rotation.set(r.rx, r.ry, r.rz);
    scene.add(m);
    if (r.ore) for (let k = 0; k < 3; k++) {
      const o = glow(new THREE.OctahedronGeometry(0.22 * r.s, 0), [0xffd65c, 0x6fe3ff, 0xb46bff][k], r.x + Math.cos(k * 2.1) * r.s * 0.7, r.s * (0.6 + k * 0.15), r.z + Math.sin(k * 2.1) * r.s * 0.7);
      scene.add(o);
    }
  }

  // Deserto: cactos e ossadas
  for (const c of layout.cacti) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.7, c.h, 0.7), 0x3f8f4a, 0, c.h / 2, 0));
    for (let i = 0; i < c.arms; i++) {
      const s = i ? -1 : 1;
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.45, 0.45), 0x3f8f4a, s * 0.75, c.h * 0.5, 0));
      g.add(mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), 0x3f8f4a, s * 1.0, c.h * 0.5 + 0.6, 0));
    }
    g.position.set(c.x, 0, c.z); g.rotation.y = c.rot;
    scene.add(g);
  }
  for (const b of layout.bones) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.25, 0.25), 0xeee6cf, 0, 0.15, 0));
    for (let i = 0; i < 3; i++) { const r = mesh(new THREE.BoxGeometry(0.15, 0.15, 0.9), 0xeee6cf, -0.5 + i * 0.5, 0.25, 0); r.rotation.x = 0.4; g.add(r); }
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), 0xf2ecd9, 1.0, 0.25, 0));
    g.position.set(b.x, 0, b.z); g.rotation.y = b.rot; g.scale.setScalar(b.s);
    scene.add(g);
  }

  // Pântano: poças escuras e juncos
  for (const p of layout.ponds) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(p.r, 20), new THREE.MeshLambertMaterial({ color: 0x2f3d24, transparent: true, opacity: 0.9 }));
    d.rotation.x = -Math.PI / 2; d.position.set(p.x, 0.04, p.z);
    scene.add(d);
  }
  const reedGeo = new THREE.BoxGeometry(0.08, 1, 0.08);
  for (const r of layout.reeds) {
    const m = mesh(reedGeo, 0x6b7a3a, r.x, r.h / 2, r.z);
    m.scale.y = r.h; m.castShadow = false;
    scene.add(m);
  }

  // Acampamento goblin
  for (const tn of layout.tents) scene.add(mesh(new THREE.ConeGeometry(2.6, 3.5, 4), tn.color, tn.x, 1.75, tn.z));
  const fire = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const l = mesh(new THREE.BoxGeometry(1.6, 0.3, 0.3), 0x5a3a1a, 0, 0.15, 0);
    l.rotation.y = (i / 5) * Math.PI; fire.add(l);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
  flame.position.y = 0.9; fire.add(flame);
  const fireLight = new THREE.PointLight(0xff8c1a, 30, 18);
  fireLight.position.y = 2; fire.add(fireLight);
  fire.position.set(layout.campfire.x, 0, layout.campfire.z);
  scene.add(fire);
  animated.push((t) => { flame.scale.set(1 + Math.sin(t * 13) * 0.15, 1 + Math.sin(t * 17) * 0.25, 1); fireLight.intensity = 26 + Math.sin(t * 20) * 6; });

  // Ruínas
  for (const p of layout.pillars) scene.add(mesh(new THREE.BoxGeometry(1.8, p.h, 1.8), 0xa7a397, p.x, p.h / 2, p.z));
  scene.add(mesh(new THREE.BoxGeometry(4, 0.6, 4), 0x6d6a60, layout.altar.x, 0.3, layout.altar.z));

  // ---------- Entrada da mina (pedreira) ----------
  {
    const h = layout.mineHill;
    const hill = mesh(new THREE.DodecahedronGeometry(h.r, 0), 0x77736a, h.x, h.r * 0.35, h.z);
    hill.scale.y = 0.75;
    scene.add(hill);
    const g = new THREE.Group();
    const beam = 0x5a3a1a;
    g.add(mesh(new THREE.BoxGeometry(0.5, 4, 0.5), beam, -1.9, 2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 4, 0.5), beam, 1.9, 2, 0));
    g.add(mesh(new THREE.BoxGeometry(4.6, 0.6, 0.6), beam, 0, 4.1, 0));
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.8), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    hole.position.set(0, 1.9, -0.2);
    g.add(hole);
    for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 9), 0x6a6a6a, x, 0.06, 4.2)); // trilhos
    for (let i = 0; i < 9; i++) g.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.3), 0x5a3a1a, 0, 0.03, 0.4 + i));
    const cart = new THREE.Group(); // carrinho de minério
    cart.add(mesh(new THREE.BoxGeometry(1.4, 0.8, 1.8), 0x6b6f76, 0, 0.75, 0));
    for (let k = 0; k < 4; k++) cart.add(glow(new THREE.OctahedronGeometry(0.22, 0), [0xffd65c, 0x6fe3ff, 0xffd65c, 0xb46bff][k], -0.3 + (k % 2) * 0.6, 1.25, -0.4 + Math.floor(k / 2) * 0.8));
    cart.position.set(0, 0, 6.5);
    g.add(cart);
    for (const x of [-2.5, 2.5]) { g.add(mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), beam, x, 1.2, 0.6)); g.add(glow(new THREE.BoxGeometry(0.35, 0.45, 0.35), 0xffc24a, x, 2.5, 0.6)); }
    g.position.set(MINE_DOOR.x, 0, MINE_DOOR.z);
    g.rotation.y = h.rot;
    scene.add(g);
    const l = makeLabel('⛏️ Mina Abandonada', '#ffd65c', 1);
    l.position.set(MINE_DOOR.x, 5.4, MINE_DOOR.z);
    l.material.depthTest = false; l.renderOrder = 5; // o morro não esconde o letreiro
    scene.add(l);
  }

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
  sign(-26, -11, '← Mina (Pedreira)');
  sign(98, -12, '→ Deserto');
  sign(-84, 52, '↙ Pântano');

  // Limite do mapa: anel de montanhas (o jogador é travado em WORLD_RADIUS)
  for (const mt of layout.mountains) {
    const m = mesh(new THREE.ConeGeometry(mt.rad, mt.h, mt.sides), mt.color, mt.x, mt.h / 2 - 0.5, mt.z);
    m.rotation.y = mt.rot; m.castShadow = false;
    scene.add(m);
    if (mt.h > 30 && mt.snow) { // pico nevado
      const capH = mt.h * 0.28;
      const cap = mesh(new THREE.ConeGeometry(mt.rad * 0.28 + 0.3, capH, mt.sides), 0xf2f4f5, mt.x, mt.h - capH / 2 - 0.4, mt.z);
      cap.rotation.y = mt.rot; cap.castShadow = false;
      scene.add(cap);
    }
  }
  for (const r of layout.edgeRocks) {
    const m = mesh(new THREE.DodecahedronGeometry(r.s, 0), 0x8d8d8d, r.x, r.s * 0.4, r.z);
    m.rotation.set(r.rx, r.ry, r.rz);
    scene.add(m);
  }

  // Nuvens (só visual)
  const crand = mulberry32(99);
  for (let i = 0; i < 30; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(8 + crand() * 10, 2, 5 + crand() * 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    c.position.set((crand() - 0.5) * 380, 40 + crand() * 15, (crand() - 0.5) * 380);
    scene.add(c);
    const sp = 1 + crand() * 2;
    animated.push((t, dt) => { c.position.x += sp * dt; if (c.position.x > 200) c.position.x = -200; });
  }

  // borda da zona segura desenhada no chão
  const safeRing = new THREE.Mesh(new THREE.RingGeometry(SAFE_ZONE.r - 0.35, SAFE_ZONE.r, 120),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.35, depthWrite: false }));
  safeRing.rotation.x = -Math.PI / 2;
  safeRing.position.set(SAFE_ZONE.x, 0.04, SAFE_ZONE.z);
  scene.add(safeRing);

  buildMine(scene, layout, animated);
  const furniture = buildHome(scene);

  // ---------- Baús de tesouro ----------
  const treasures = TREASURES.map((t) => {
    const c = treasureChest(t.tier);
    c.group.position.set(t.x, 0, t.z);
    c.group.rotation.y = Math.atan2(-t.x, -t.z) * (inMine(t.x, t.z) ? 0 : 1); // na superfície olha para a vila
    scene.add(c.group);
    return { ...t, ...c, open: false, k: 0 };
  });
  animated.push((t, dt) => {
    for (const tc of treasures) {
      tc.k += ((tc.open ? 1 : 0) - tc.k) * Math.min(1, dt * 6);
      tc.lid.rotation.x = -tc.k * 1.9;
      tc.shine.visible = !tc.open;
      tc.shine.position.y = 1.5 + Math.sin(t * 3 + tc.x) * 0.15;
      tc.shine.rotation.y += dt * 2;
    }
  });

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
    ...q, trees, treasures, furniture, fadeOccluders,
    update: (t, dt) => animated.forEach((f) => f(t, dt)),
  };
}

// ---------- Interior da mina ----------
function buildMine(scene, layout, animated) {
  const T = MINE.tile, W = MINE.cols * T, D = MINE.rows * T;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0x4a3b2e));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(MINE.x0 + W / 2, 0.01, MINE.z0 + D / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // paredes: só os blocos vizinhos ao chão (InstancedMesh = 1 draw call)
  const walls = [];
  for (let z = 0; z < MINE.rows; z++) {
    for (let x = 0; x < MINE.cols; x++) {
      if (MINE_GRID[z][x] !== 1) continue;
      let open = false;
      for (let dz = -1; dz <= 1 && !open; dz++) for (let dx = -1; dx <= 1; dx++) if (MINE_GRID[z + dz]?.[x + dx] === 0) { open = true; break; }
      if (open) walls.push([x, z]);
    }
  }
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 3.4, T), mat(0xffffff), walls.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const rnd = mulberry32(42);
  walls.forEach(([x, z], i) => {
    const c = mineTileCenter(x, z);
    m4.makeTranslation(c.x, 1.7, c.z);
    wallMesh.setMatrixAt(i, m4);
    wallMesh.setColorAt(i, col.setHex(0x5b544b).offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
  });
  wallMesh.castShadow = true; wallMesh.receiveShadow = true;
  scene.add(wallMesh);

  // vigas de madeira em alguns corredores
  for (let z = 1; z < MINE.rows - 1; z++) {
    for (let x = 1; x < MINE.cols - 1; x++) {
      if (MINE_GRID[z][x] !== 0) continue;
      const ns = MINE_GRID[z - 1][x] === 1 && MINE_GRID[z + 1][x] === 1;
      const ew = MINE_GRID[z][x - 1] === 1 && MINE_GRID[z][x + 1] === 1;
      if (!(ns || ew) || rnd() > 0.35) continue;
      const c = mineTileCenter(x, z);
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), 0x5a3a1a, -1.8, 1.6, 0));
      g.add(mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), 0x5a3a1a, 1.8, 1.6, 0));
      g.add(mesh(new THREE.BoxGeometry(4, 0.4, 0.4), 0x5a3a1a, 0, 3.1, 0));
      g.position.set(c.x, 0, c.z);
      g.rotation.y = ns ? 0 : Math.PI / 2;
      scene.add(g);
    }
  }

  // tochas (algumas com luz de verdade) e cristais
  layout.mineTorches.forEach((t, i) => {
    const x = t.x + t.dx * 0.15, z = t.z + t.dz * 0.15;
    scene.add(mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), 0x5a3a1a, x, 1.9, z));
    const fl = glow(new THREE.ConeGeometry(0.16, 0.42, 5), 0xffa63a, x, 2.45, z);
    scene.add(fl);
    if (i % 2 === 0) {
      const l = new THREE.PointLight(0xff9a3a, 14, 16, 1.6);
      l.position.set(x + t.dx * 0.6, 2.6, z + t.dz * 0.6);
      scene.add(l);
      animated.push((tt) => { l.intensity = 12 + Math.sin(tt * 11 + i) * 2.5; fl.scale.y = 1 + Math.sin(tt * 15 + i) * 0.2; });
    }
  });
  for (const c of layout.mineCrystals) {
    for (let k = 0; k < 3; k++) {
      const o = glow(new THREE.OctahedronGeometry(0.25 + k * 0.07, 0), c.color, c.x + c.dx * 0.1 + (k - 1) * 0.35 * (c.dz ? 1 : 0), 0.7 + k * 0.5, c.z + c.dz * 0.1 + (k - 1) * 0.35 * (c.dx ? 1 : 0));
      o.scale.y = 1.6;
      scene.add(o);
    }
  }

  // escada de saída com feixe de luz do dia
  const ex = MINE_EXIT;
  const ladder = new THREE.Group();
  for (const x of [-0.6, 0.6]) ladder.add(mesh(new THREE.BoxGeometry(0.15, 5, 0.15), 0x7a4e2a, x, 2.5, 0));
  for (let i = 0; i < 8; i++) ladder.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 0.12), 0x7a4e2a, 0, 0.4 + i * 0.6, 0));
  ladder.position.set(ex.x, 0, ex.z - 1.6);
  scene.add(ladder);
  const beamLight = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 6, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  beamLight.position.set(ex.x, 3, ex.z - 1);
  scene.add(beamLight);
  const day = new THREE.PointLight(0xfff2c4, 20, 14, 1.4);
  day.position.set(ex.x, 4, ex.z - 1);
  scene.add(day);
  const lab = makeLabel('⬆ Saída', '#fff2c4', 0.8);
  lab.position.set(ex.x, 4.4, ex.z);
  scene.add(lab);

  // sala do chefe: caixas de dinamite e pilhas de minério
  const boss = mineTileCenter(14, 21);
  for (const [dx, dz] of [[-16, -6], [16, -6], [-16, 8], [16, 8]]) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.3, 1, 1.3), 0x8a5a2b, 0, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(1.32, 0.25, 1.32), 0xc8281e, 0, 0.6, 0));
    g.position.set(boss.x + dx, 0, boss.z + dz);
    scene.add(g);
  }
}

// ---------- Interior da casa do jogador ----------
function buildHome(scene) {
  const { x0, z0, w, d } = HOME;
  const cx = x0 + w / 2, cz = z0 + d / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xb98a5a));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.01, cz); floor.receiveShadow = true;
  scene.add(floor);
  for (let i = 0; i < 7; i++) scene.add(mesh(new THREE.BoxGeometry(w, 0.02, 0.06), 0x8a6238, cx, 0.02, z0 + 1.7 * (i + 0.5))); // tábuas
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5), mat(0xb5402f));
  rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.03, cz + 0.5);
  scene.add(rug);
  const wallC = 0xf1e3c6, H = 3.2;
  scene.add(mesh(new THREE.BoxGeometry(w + 0.6, H, 0.3), wallC, cx, H / 2, z0 - 0.15));
  scene.add(mesh(new THREE.BoxGeometry(0.3, H, d), wallC, x0 - 0.15, H / 2, cz));
  scene.add(mesh(new THREE.BoxGeometry(0.3, H, d), wallC, x0 + w + 0.15, H / 2, cz));
  // parede da porta (sul) com abertura
  scene.add(mesh(new THREE.BoxGeometry(w / 2 - 0.9, H, 0.3), wallC, x0 + (w / 2 - 0.9) / 2, H / 2, z0 + d + 0.15));
  scene.add(mesh(new THREE.BoxGeometry(w / 2 - 0.9, H, 0.3), wallC, x0 + w - (w / 2 - 0.9) / 2, H / 2, z0 + d + 0.15));
  scene.add(mesh(new THREE.BoxGeometry(1.8, 2.4, 0.2), 0x8a5a2b, HOME_EXIT.x, 1.2, z0 + d + 0.2));
  const exitLabel = makeLabel('🚪 Sair', '#ffe9a8', 0.6);
  exitLabel.position.set(HOME_EXIT.x, 2.9, z0 + d - 0.3);
  scene.add(exitLabel);
  const lamp = new THREE.PointLight(0xffd9a0, 30, 22, 1.2);
  lamp.position.set(cx, 3, cz);
  scene.add(lamp);
  scene.add(glow(new THREE.BoxGeometry(0.6, 0.3, 0.6), 0xffe8b0, cx, 3.05, cz));

  const F = HOME_FURNITURE;
  // armário de armas: moldura com espadas penduradas
  const rack = new THREE.Group();
  rack.add(mesh(new THREE.BoxGeometry(0.6, 2.6, 3), 0x6b4423, 0, 1.3, 0));
  for (let i = 0; i < 3; i++) {
    rack.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.12), [0xcfd6de, 0x8fb3d9, 0x9b6bff][i], 0.36, 1.4, -0.9 + i * 0.9));
    rack.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.45), 0xc9a227, 0.36, 0.6, -0.9 + i * 0.9));
  }
  rack.position.set(F.rack.x - 0.9, 0, F.rack.z);
  scene.add(rack);
  // cofre
  const safe = new THREE.Group();
  safe.add(mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), 0x5d646d, 0, 0.75, 0));
  safe.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), 0xffd23a, -0.72, 0.9, 0).rotateZ(Math.PI / 2));
  safe.position.set(F.safe.x + 0.6, 0, F.safe.z);
  scene.add(safe);
  // baú de poções
  const ch = treasureChest(1);
  ch.shine.visible = false;
  ch.group.position.set(F.chest.x, 0, F.chest.z - 0.6);
  scene.add(ch.group);
  // espelho
  const mirror = new THREE.Group();
  mirror.add(mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), 0xc9a227, 0, 1.4, 0));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.05), new THREE.MeshLambertMaterial({ color: 0xbfe6ff, emissive: 0x1a3a4a }));
  glass.position.set(0, 1.4, 0.12);
  mirror.add(glass);
  mirror.position.set(F.mirror.x, 0, F.mirror.z - 0.6);
  scene.add(mirror);
  // cama e mesa (decoração)
  scene.add(mesh(new THREE.BoxGeometry(2, 0.6, 3.2), 0x6b4423, x0 + w - 1.4, 0.3, z0 + d - 2.4));
  scene.add(mesh(new THREE.BoxGeometry(1.8, 0.3, 2.2), 0x3b5fb5, x0 + w - 1.4, 0.7, z0 + d - 2));
  scene.add(mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), 0xf3efe6, x0 + w - 1.4, 0.75, z0 + d - 3.5));
  scene.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 1), 0x8a5a2b, x0 + 2, 0.45, z0 + d - 2));
  for (const [k, f] of Object.entries(F)) {
    const l = makeLabel(`${f.icon} ${f.name}`, '#ffe9a8', 0.6);
    l.position.set(f.x + (k === 'rack' ? -0.6 : k === 'safe' ? 0.6 : 0), 2.9, f.z - (k === 'chest' || k === 'mirror' ? 0.6 : 0));
    scene.add(l);
  }
  return F;
}
