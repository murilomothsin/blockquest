// Desenha o mapa (three.js) a partir do layout compartilhado em shared/worldData.js
import * as THREE from 'three';
import { mulberry32 } from './shared/rng.js';
import {
  WORLD_RADIUS, SAFE_ZONE, WOODS, ZONES, PATHS, HOUSES, LAKE, buildLayout, createWorldQueries,
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
  const layout = buildLayout();
  const q = createWorldQueries(layout);
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

  // Casas da vila
  for (const h of HOUSES) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(6, 4, 6), h.wall, 0, 2, 0));
    const r = mesh(new THREE.ConeGeometry(5.2, 3, 4), h.roof, 0, 5.5, 0);
    r.rotation.y = Math.PI / 4;
    g.add(r);
    g.add(mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), 0x6b4423, 0, 1.2, 3.05));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), 0x9fd8ff, -1.9, 2.4, 3.02));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), 0x9fd8ff, 1.9, 2.4, 3.02));
    g.position.set(h.x, 0, h.z); g.rotation.y = h.rot;
    scene.add(g);
  }

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

  // Pedras
  for (const r of layout.rocks) {
    const m = mesh(new THREE.DodecahedronGeometry(r.s, 0), 0x8d8d8d, r.x, r.s * 0.5, r.z);
    m.rotation.set(r.rx, r.ry, r.rz);
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
  for (const mt of layout.mountains) {
    const m = mesh(new THREE.ConeGeometry(mt.rad, mt.h, mt.sides), mt.color, mt.x, mt.h / 2 - 0.5, mt.z);
    m.rotation.y = mt.rot; m.castShadow = false;
    scene.add(m);
    if (mt.h > 30) { // pico nevado
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
  for (let i = 0; i < 25; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(8 + crand() * 10, 2, 5 + crand() * 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    c.position.set((crand() - 0.5) * 300, 40 + crand() * 15, (crand() - 0.5) * 300);
    scene.add(c);
    const sp = 1 + crand() * 2;
    animated.push((t, dt) => { c.position.x += sp * dt; if (c.position.x > 160) c.position.x = -160; });
  }

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
    ...q, trees, fadeOccluders,
    update: (t, dt) => animated.forEach((f) => f(t, dt)),
  };
}
