// Desenha o mapa (three.js) a partir do layout compartilhado em shared/worldData.js:
// superfície com biomas, entrada e interior da mina, interior da casa e baús de tesouro.
import * as THREE from 'three';
import { mulberry32 } from './shared/rng.js';
import {
  WORLD_RADIUS, SAFE_ZONE, SAFE_ZONES, WOODS, ZONES, PATHS, HOUSES, LAKE, BIOMES, biomeBlend, buildLayout, createWorldQueries,
  MINE_DOOR, HOME, HOME_FURNITURE, HOME_EXIT, HOME_DOOR, TREASURES, DUNGEONS, tileCenter, dungeonAt,
  CASTLE, CURSED, TOWER, TOWER_DOOR, WELLS, BOSS_ROOMS,
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
  const groundGeo = new THREE.PlaneGeometry(R * 2, R * 2, 220, 220);
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
  const snowGeo = new THREE.ConeGeometry(1.05, 1.3, 6);
  const trees = [];
  for (const tr of layout.trees) {
    const t = new THREE.Group();
    t.add(mesh(trunkGeo, 0x7a4e2a, 0, 1.5, 0));
    if (tr.pine) {
      t.add(mesh(pineGeo, tr.inForest ? 0x1f5e2a : 0x2e7d32, 0, 4.6, 0));
      if (tr.snow) t.add(mesh(snowGeo, 0xf2f4f5, 0, 6.3, 0));
    }
    else t.add(mesh(leafGeo, tr.leaf, 0, 4.2, 0));
    t.position.set(tr.x, 0, tr.z); t.scale.setScalar(tr.s); t.rotation.y = tr.rot;
    scene.add(t);
    trees.push({ x: tr.x, z: tr.z, group: t, faded: false });
  }
  // Pântano: árvores mortas (tronco escuro e galhos tortos)
  const branchGeo = new THREE.BoxGeometry(0.3, 1.8, 0.3);
  for (const tr of layout.deadTrees) {
    const t = new THREE.Group();
    const bark = tr.cursed ? 0x2b2530 : 0x3b3128;
    t.add(mesh(new THREE.BoxGeometry(0.7, 4.2, 0.7), bark, 0, 2.1, 0));
    for (const [y, rz, ry] of [[3.2, 0.9, 0], [2.6, -0.8, 1.6], [3.8, 0.6, 3.1]]) {
      const b = mesh(branchGeo, bark, 0, y, 0);
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

  // borda da zona segura do castelo
  for (const S of SAFE_ZONES.slice(1)) {
    const ringC = new THREE.Mesh(new THREE.RingGeometry(S.r - 0.35, S.r, 120),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.3, depthWrite: false }));
    ringC.rotation.x = -Math.PI / 2; ringC.position.set(S.x, 0.05, S.z);
    scene.add(ringC);
  }

  buildCastle(scene, layout, animated);
  buildCursed(scene, layout, animated);
  buildTowerOutside(scene, animated);
  const dungeons = DUNGEONS.map((d) => buildDungeon(scene, d, layout.dungeonDeco[d.id], animated));
  const lights = makeLightPool(scene, dungeons);
  const furniture = buildHome(scene);

  // ---------- Baús de tesouro ----------
  const treasures = TREASURES.map((t) => {
    const c = treasureChest(t.tier);
    c.group.position.set(t.x, 0, t.z);
    c.group.rotation.y = Math.atan2(-t.x, -t.z) * (dungeonAt(t.x, t.z) ? 0 : 1); // na superfície olha para a vila
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
    ...q, trees, treasures, furniture, fadeOccluders, dungeons,
    /** abaixa as paredes da dungeon que ficam entre a câmera e o jogador (técnica de "cutaway") */
    cutaway: (cam, player, dt) => {
      const d = dungeonAt(player.x, player.z);
      for (const g of dungeons) if (g.d === d || g.dirty) g.cutaway(g.d === d ? cam : null, player, dt);
    },
    updateLights: (player, t) => lights(player, t),
    update: (t, dt) => animated.forEach((f) => f(t, dt)),
  };
}

// ---------- Dungeons em grade (mina e andares da torre) ----------
const WALL_H = { mine: 3.4, tower: 4.6 };
const LOW_H = 0.35; // altura da parede "abaixada" pelo cutaway

function buildDungeon(scene, d, deco, animated) {
  const T = d.tile, W = d.cols * T, D = d.rows * T;
  const tower = d.style === 'tower';
  const H = WALL_H[d.style];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(tower ? 0x56506a : 0x4a3b2e));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(d.x0 + W / 2, 0.01, d.z0 + D / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // paredes: só os blocos vizinhos ao chão (InstancedMesh = 1 draw call)
  const walls = [];
  for (let z = 0; z < d.rows; z++) {
    for (let x = 0; x < d.cols; x++) {
      if (d.grid[z][x] !== 1) continue;
      let open = false;
      for (let dz = -1; dz <= 1 && !open; dz++) for (let dx = -1; dx <= 1; dx++) if (d.grid[z + dz]?.[x + dx] === 0) { open = true; break; }
      if (open) walls.push({ ...tileCenter(d, x, z) });
    }
  }
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 1, T), mat(0xffffff), walls.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const rnd = mulberry32(d.id.length * 97 + d.x0 + d.z0);
  const heights = new Float32Array(walls.length).fill(H);
  const setWall = (i) => { const w = walls[i]; m4.makeScale(1, heights[i], 1).setPosition(w.x, heights[i] / 2, w.z); wallMesh.setMatrixAt(i, m4); };
  walls.forEach((w, i) => {
    setWall(i);
    wallMesh.setColorAt(i, col.setHex(tower ? 0x6a6380 : 0x5b544b).offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
  });
  wallMesh.castShadow = true; wallMesh.receiveShadow = true;
  scene.add(wallMesh);

  if (tower) { // tapete vermelho e círculo mágico no chão
    const c = tileCenter(d, 10, 10);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 30), mat(0x6b1f2f));
    rug.rotation.x = -Math.PI / 2; rug.position.set(c.x, 0.03, c.z + 18);
    if (d.floor !== 3) scene.add(rug);
    const circle = new THREE.Mesh(new THREE.RingGeometry(5, 5.6, 48), new THREE.MeshBasicMaterial({ color: d.floor === 4 ? 0x5cff7a : 0x9b5cff, transparent: true, opacity: 0.55, depthWrite: false }));
    circle.rotation.x = -Math.PI / 2; circle.position.set(c.x, 0.04, c.z - (d.floor === 4 ? 4 : 0));
    if (d.floor === 4 || d.floor === 2) scene.add(circle);
    animated.push((t) => { circle.rotation.z = t * 0.3; });
  } else { // mina: vigas de madeira em alguns corredores
    for (let z = 1; z < d.rows - 1; z++) {
      for (let x = 1; x < d.cols - 1; x++) {
        if (d.grid[z][x] !== 0) continue;
        const ns = d.grid[z - 1][x] === 1 && d.grid[z + 1][x] === 1;
        const ew = d.grid[z][x - 1] === 1 && d.grid[z][x + 1] === 1;
        if (!(ns || ew) || rnd() > 0.35) continue;
        const c = tileCenter(d, x, z);
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), 0x5a3a1a, -1.8, 1.6, 0));
        g.add(mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), 0x5a3a1a, 1.8, 1.6, 0));
        g.add(mesh(new THREE.BoxGeometry(4, 0.4, 0.4), 0x5a3a1a, 0, 3.1, 0));
        g.position.set(c.x, 0, c.z);
        g.rotation.y = ns ? 0 : Math.PI / 2;
        scene.add(g);
      }
    }
  }

  // tochas (a luz vem do conjunto fixo em makeLightPool) e cristais (mina) / estantes e estandartes (torre)
  const torches = [];
  deco.torches.forEach((t, i) => {
    const x = t.x + t.dx * 0.15, z = t.z + t.dz * 0.15;
    scene.add(mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), 0x5a3a1a, x, 1.9, z));
    const fl = glow(new THREE.ConeGeometry(0.16, 0.42, 5), tower ? 0xb46bff : 0xffa63a, x, 2.45, z);
    scene.add(fl);
    torches.push({ x: x + t.dx * 0.6, z: z + t.dz * 0.6 });
    animated.push((tt) => { fl.scale.y = 1 + Math.sin(tt * 15 + i) * 0.2; });
  });
  for (const c of deco.crystals) {
    if (tower) {
      const along = c.dx ? 0 : Math.PI / 2;
      if (d.floor === 2) { // estante de livros
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(0.5, 2.6, 2.6), 0x5a3a1a, 0, 1.3, 0));
        for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.52, 0.4, 2.3), [0x8a1f2f, 0x2f6ba0, 0x6b8a2f, 0x8a6b2f][k], 0.02, 0.45 + k * 0.6, 0));
        g.position.set(c.x + c.dx * 0.3, 0, c.z + c.dz * 0.3); g.rotation.y = along;
        scene.add(g);
      } else { // estandarte
        const b = mesh(new THREE.BoxGeometry(0.08, 2.2, 1.2), c.color, c.x + c.dx * 0.1, 2.4, c.z + c.dz * 0.1);
        b.rotation.y = along; scene.add(b);
      }
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const o = glow(new THREE.OctahedronGeometry(0.25 + k * 0.07, 0), c.color, c.x + c.dx * 0.1 + (k - 1) * 0.35 * (c.dz ? 1 : 0), 0.7 + k * 0.5, c.z + c.dz * 0.1 + (k - 1) * 0.35 * (c.dx ? 1 : 0));
      o.scale.y = 1.6;
      scene.add(o);
    }
  }

  // escadas e saídas
  for (const [k, tx, tz] of d.marks) {
    if (!['E', 'U', 'D'].includes(k)) continue;
    const c = tileCenter(d, tx, tz);
    const up = k === 'U' || k === 'E';
    const g = new THREE.Group();
    if (k === 'E') { // escada de mão da mina com luz do dia
      for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.15, 5, 0.15), 0x7a4e2a, x, 2.5, -1.6));
      for (let i = 0; i < 8; i++) g.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 0.12), 0x7a4e2a, 0, 0.4 + i * 0.6, -1.6));
      const beamLight = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 6, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      beamLight.position.set(0, 3, -1);
      g.add(beamLight);
    } else { // degraus de pedra (sobe) ou buraco com degraus (desce)
      for (let i = 0; i < 5; i++) {
        const st = mesh(new THREE.BoxGeometry(3, 0.35, 0.7), 0x6d6a78, 0, up ? 0.18 + i * 0.35 : 0.02, (up ? -1 : 1) * (-1.2 + i * 0.6));
        if (!up) { st.material = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x3a3542).offsetHSL(0, 0, -i * 0.05) }); }
        g.add(st);
      }
      if (!up) { const hole = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0x050308 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.015; g.add(hole); }
      g.add(glow(new THREE.OctahedronGeometry(0.2, 0), up ? 0x9fe870 : 0xffd65c, 0, up ? 2.6 : 1.2, 0));
    }
    g.position.set(c.x, 0, c.z);
    scene.add(g);
    const label = k === 'E' ? '⬆ Saída' : tower && k === 'D' && d.floor === 1 ? '🚪 Saída' : up ? `⬆ ${d.floor + 1}º andar` : `⬇ ${d.floor - 1}º andar`;
    const lab = makeLabel(label, '#fff2c4', 0.8);
    lab.position.set(c.x, 4.2, c.z);
    lab.material.depthTest = false; lab.renderOrder = 5;
    scene.add(lab);
  }

  if (!tower) { // sala do chefe da mina: caixas de dinamite
    const boss = BOSS_ROOMS.goblin_boss;
    for (const [dx, dz] of [[-16, -6], [16, -6], [-16, 8], [16, 8]]) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(1.3, 1, 1.3), 0x8a5a2b, 0, 0.5, 0));
      g.add(mesh(new THREE.BoxGeometry(1.32, 0.25, 1.32), 0xc8281e, 0, 0.6, 0));
      g.position.set(boss.x + dx, 0, boss.z + dz);
      scene.add(g);
    }
  }

  /** cutaway: paredes perto da linha câmera→jogador (e do lado da câmera) abaixam suavemente */
  const handle = { d, torches, dirty: false };
  handle.cutaway = (cam, p, dt) => {
    let changed = false;
    const k = Math.min(1, dt * 10);
    let cx = 0, cz = 0, camD = 1;
    if (cam) { cx = cam.x - p.x; cz = cam.z - p.z; camD = Math.hypot(cx, cz) || 1; cx /= camD; cz /= camD; }
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      let target = H;
      if (cam) {
        const wx = w.x - p.x, wz = w.z - p.z;
        if (Math.abs(wx) < 30 && Math.abs(wz) < 30) {
          const along = wx * cx + wz * cz; // >0: do lado da câmera
          const side = Math.abs(wx * cz - wz * cx);
          if (along > -1.5 && along < camD + 4 && side < 3.2 + Math.max(0, along) * 0.45) target = LOW_H;
        }
      }
      const h = heights[i];
      if (Math.abs(h - target) > 0.01) { heights[i] = h + (target - h) * k; setWall(i); changed = true; }
    }
    // continua atualizando (mesmo depois de sair) enquanto houver parede fora da altura normal
    handle.dirty = heights.some((h) => Math.abs(h - H) > 0.01);
    if (changed) wallMesh.instanceMatrix.needsUpdate = true;
  };
  return handle;
}

/** 6 luzes fixas que vão para as tochas mais perto do jogador (nº de luzes nunca muda = sem recompilar shaders) */
function makeLightPool(scene, dungeons) {
  const pool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xff9a3a, 0, 16, 1.6); scene.add(l); return l; });
  return (p, t) => {
    const d = dungeonAt(p.x, p.z);
    const g = d && dungeons.find((x) => x.d === d);
    const list = g ? [...g.torches].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)) : [];
    pool.forEach((l, i) => {
      const tc = list[i];
      if (!tc) { l.intensity = 0; return; }
      l.position.set(tc.x, 2.6, tc.z);
      l.color.setHex(d.style === 'tower' ? 0xb46bff : 0xff9a3a);
      l.intensity = 13 + Math.sin(t * 11 + i) * 2.5;
    });
  };
}

// ---------- Castelo de Pedralta ----------
function buildCastle(scene, layout, animated) {
  const C = CASTLE, H = C.half, K = layout.castle.keep;
  const stone = 0xb9b2a2, dark = 0x8f887a;
  // pátio de pedra
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), mat(0xa9a393));
  yard.rotation.x = -Math.PI / 2; yard.position.set(C.x, 0.025, C.z); yard.receiveShadow = true;
  scene.add(yard);
  // muralhas com ameias
  for (const w of layout.castle.walls) {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1), ang = Math.atan2(w.x2 - w.x1, w.z2 - w.z1);
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.4, 7, len), stone, 0, 3.5, 0));
    for (let i = 0; i < Math.floor(len / 2.5); i++) g.add(mesh(new THREE.BoxGeometry(2.6, 1, 1.2), dark, 0, 7.5, -len / 2 + 1.25 + i * 2.5));
    g.position.set((w.x1 + w.x2) / 2, 0, (w.z1 + w.z2) / 2); g.rotation.y = ang;
    scene.add(g);
  }
  // torres
  for (const t of layout.castle.towers) {
    scene.add(mesh(new THREE.CylinderGeometry(t.r, t.r * 1.1, t.h, 10), stone, t.x, t.h / 2, t.z));
    const roof = mesh(new THREE.ConeGeometry(t.r * 1.25, 5, 10), 0x3b5fb5, t.x, t.h + 2.5, t.z);
    scene.add(roof);
    const flag = mesh(new THREE.BoxGeometry(0.08, 1, 1.6), 0xd9433b, t.x, t.h + 5.6, t.z + 0.8);
    scene.add(flag);
    scene.add(mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), 0x5a3a1a, t.x, t.h + 5, t.z));
    animated.push((tt) => { flag.rotation.y = Math.sin(tt * 2 + t.x) * 0.3; });
  }
  // portão (arco) com grade levantada
  const gate = new THREE.Group();
  gate.add(mesh(new THREE.BoxGeometry(C.gate * 2 + 2, 2, 2.6), stone, 0, 8, 0));
  gate.add(mesh(new THREE.BoxGeometry(C.gate * 2, 0.3, 0.3), 0x3b3b3b, 0, 6.8, 0.9));
  gate.position.set(C.x, 0, C.z + H);
  scene.add(gate);
  // torre de menagem
  const keep = new THREE.Group();
  keep.add(mesh(new THREE.BoxGeometry(K.w, 12, K.d), stone, 0, 6, 0));
  for (let i = 0; i < 8; i++) keep.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), dark, -K.w / 2 + 1 + i * (K.w - 2) / 7, 12.6, K.d / 2 - 0.7));
  keep.add(mesh(new THREE.BoxGeometry(3, 4.5, 0.3), 0x5a3a1a, 0, 2.25, K.d / 2 + 0.1));
  for (const x of [-6, 6]) keep.add(glow(new THREE.BoxGeometry(1.2, 2, 0.2), 0xffe08a, x, 7.5, K.d / 2 + 0.1));
  for (const x of [-3.5, 3.5]) { // estandartes
    keep.add(mesh(new THREE.BoxGeometry(1.6, 4, 0.1), 0x3b5fb5, x, 6.5, K.d / 2 + 0.15));
    keep.add(glow(new THREE.BoxGeometry(0.6, 0.6, 0.12), 0xffd65c, x, 7, K.d / 2 + 0.2));
  }
  keep.position.set(K.x, 0, K.z);
  scene.add(keep);
  // fonte que cura
  const F = WELLS[1];
  const fount = new THREE.Group();
  fount.add(mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.8, 16), 0x9d9788, 0, 0.4, 0));
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.82, 16), new THREE.MeshLambertMaterial({ color: 0x3a8fd9, emissive: 0x0a2a4a }));
  water.position.y = 0.42; fount.add(water);
  fount.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), 0x9d9788, 0, 1.5, 0));
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7 }));
  jet.position.y = 3; fount.add(jet);
  animated.push((t) => { jet.scale.y = 1 + Math.sin(t * 8) * 0.15; });
  fount.position.set(F.x, 0, F.z);
  scene.add(fount);
  const l = makeLabel('🏰 Castelo de Pedralta', '#ffe08a', 1.2);
  l.position.set(C.x, 11, C.z + H + 1); l.material.depthTest = false; l.renderOrder = 5;
  scene.add(l);
}

// ---------- Ruínas Amaldiçoadas ----------
function buildCursed(scene, layout, animated) {
  const R = layout.cursed;
  const fog = new THREE.Mesh(new THREE.CircleGeometry(CURSED.r + 6, 40), new THREE.MeshBasicMaterial({ color: 0x7a5f9a, transparent: true, opacity: 0.22, depthWrite: false }));
  fog.rotation.x = -Math.PI / 2; fog.position.set(CURSED.x, 0.06, CURSED.z);
  scene.add(fog);
  for (const g of R.graves) {
    const grp = new THREE.Group();
    if (g.cross) {
      grp.add(mesh(new THREE.BoxGeometry(0.25, g.h + 0.4, 0.25), 0x6d6a72, 0, (g.h + 0.4) / 2, 0));
      grp.add(mesh(new THREE.BoxGeometry(0.9, 0.22, 0.25), 0x6d6a72, 0, g.h * 0.75, 0));
    } else {
      grp.add(mesh(new THREE.BoxGeometry(0.9, g.h, 0.3), 0x7a7680, 0, g.h / 2, 0));
      grp.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10, 1, false, 0, Math.PI), 0x7a7680, 0, g.h, 0).rotateZ(Math.PI / 2).rotateY(Math.PI / 2));
    }
    grp.add(mesh(new THREE.BoxGeometry(1, 0.15, 1.8), 0x3d3546, 0, 0.07, 0.9));
    grp.position.set(g.x, 0, g.z); grp.rotation.set(g.tilt, g.rot, 0);
    scene.add(grp);
  }
  for (const w of R.walls) {
    const m = mesh(new THREE.BoxGeometry(w.len, w.h, 0.9), 0x5d5566, w.x, w.h / 2, w.z);
    m.rotation.y = w.rot; scene.add(m);
  }
  // cripta
  const c = new THREE.Group();
  c.add(mesh(new THREE.BoxGeometry(7, 4.5, 6), 0x5d5566, 0, 2.25, 0));
  const roof = mesh(new THREE.ConeGeometry(5.4, 3, 4), 0x3a3346, 0, 6, 0); roof.rotation.y = Math.PI / 4; c.add(roof);
  c.add(mesh(new THREE.BoxGeometry(2, 3, 0.3), 0x0a0810, 0, 1.5, 3.05));
  c.add(glow(new THREE.BoxGeometry(0.5, 0.5, 0.2), 0xb46bff, 0, 3.8, 3.1));
  c.position.set(R.crypt.x, 0, R.crypt.z); c.rotation.y = Math.PI; // porta virada para o norte (a Rainha fica na frente)
  scene.add(c);
  // fogos-fátuos
  const wispGeo = new THREE.SphereGeometry(0.22, 8, 6);
  for (const w of R.wisps) {
    const m = glow(wispGeo, 0x9fe0ff, w.x, 1.5, w.z);
    scene.add(m);
    animated.push((t) => { m.position.set(w.x + Math.sin(t * 0.7 + w.ph) * 3, 1.3 + Math.sin(t * 2 + w.ph) * 0.5, w.z + Math.cos(t * 0.5 + w.ph) * 3); });
  }
  const l = makeLabel('☠️ Ruínas Amaldiçoadas', '#d9b3ff', 1.1);
  l.position.set(CURSED.x, 8.5, CURSED.z - 2); l.material.depthTest = false; l.renderOrder = 5;
  scene.add(l);
}

// ---------- Torre do Necromante (por fora) ----------
function buildTowerOutside(scene, animated) {
  const T = TOWER;
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(T.r * 0.85, T.r, 44, 14), 0x3a3346, 0, 22, 0));
  for (let i = 0; i < 14; i++) { // ameias
    const a = (i / 14) * Math.PI * 2;
    g.add(mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), 0x2b2535, Math.cos(a) * T.r * 0.85, 44.8, Math.sin(a) * T.r * 0.85));
  }
  g.add(mesh(new THREE.ConeGeometry(T.r * 0.95, 10, 14), 0x1c1824, 0, 50, 0));
  for (let k = 0; k < 4; k++) { // janelas roxas em espiral (um andar cada)
    const a = k * 1.3 + 0.5;
    g.add(glow(new THREE.BoxGeometry(1.2, 2.2, 0.4), 0xb46bff, Math.cos(a) * T.r * 0.93, 9 + k * 9, Math.sin(a) * T.r * 0.93).rotateY(-a + Math.PI / 2));
  }
  const orb = glow(new THREE.IcosahedronGeometry(1.4, 0), 0x5cff7a, 0, 57, 0);
  g.add(orb);
  animated.push((t) => { orb.rotation.y = t; orb.position.y = 57 + Math.sin(t * 1.5) * 0.6; });
  g.position.set(T.x, 0, T.z);
  scene.add(g);
  // porta virada para a vila
  const door = new THREE.Group();
  door.add(mesh(new THREE.BoxGeometry(3.4, 4.6, 0.6), 0x2b2535, 0, 2.3, 0));
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.8), new THREE.MeshBasicMaterial({ color: 0x050308 }));
  hole.position.set(0, 1.9, 0.31); door.add(hole);
  for (const x of [-2.3, 2.3]) door.add(glow(new THREE.BoxGeometry(0.35, 0.5, 0.35), 0xb46bff, x, 3.2, 0.4));
  const ang = Math.atan2(TOWER_DOOR.x - T.x, TOWER_DOOR.z - T.z);
  door.position.set(T.x + Math.sin(ang) * (T.r - 0.2), 0, T.z + Math.cos(ang) * (T.r - 0.2)); door.rotation.y = ang;
  scene.add(door);
  const l = makeLabel('🗼 Torre do Necromante', '#d9b3ff', 1.2);
  l.position.set(TOWER_DOOR.x, 7, TOWER_DOOR.z); l.material.depthTest = false; l.renderOrder = 5;
  scene.add(l);
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
