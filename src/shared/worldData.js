// Layout do mapa em dados puros (sem three.js): usado pelo cliente (para desenhar)
// e pelo servidor (colisão, zona segura, "mato" para encontros selvagens).
import { mulberry32 } from './rng.js';

export const WORLD_RADIUS = 140;
export const WORLD_SEED = 1337;

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

export const PATHS = [[-35, -35], [65, -15], [38, 40], [0, -95]]; // estradas saindo da vila (0,0)

export const HOUSES = [
  { x: -12, z: -10, rot: Math.PI / 4, wall: 0xf1e3c6, roof: 0xb5402f },
  { x: 12, z: -12, rot: -Math.PI / 4, wall: 0xe8d3a9, roof: 0x3b5fb5 },
  { x: -14, z: 10, rot: (3 * Math.PI) / 4, wall: 0xf3efe6, roof: 0x2f8a4a },
  { x: 14, z: 11, rot: (-3 * Math.PI) / 4, wall: 0xe6c9a8, roof: 0x8a3fb5 },
];
export const LAKE = { x: -45, z: 30, r: 11 };
export const WELL = { x: 0, z: 0 };

export function onPath(x, z, half = 4) {
  return PATHS.some(([ex, ez]) => {
    const len2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, (x * ex + z * ez) / len2));
    return Math.hypot(x - ex * t, z - ez * t) < half;
  });
}

const nearZone = (x, z, pad) => ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r * (zn.id === 'forest' ? 0.55 : 1) + pad);

/** Gera tudo que tem posição no mapa. Determinístico (mesma semente = mesmo mapa). */
export function buildLayout(seed = WORLD_SEED) {
  const rand = mulberry32(seed);
  const colliders = []; // {x, z, r}
  for (const h of HOUSES) colliders.push({ x: h.x, z: h.z, r: 4.3 });
  colliders.push({ x: WELL.x, z: WELL.z, r: 1.6 });
  colliders.push({ x: LAKE.x, z: LAKE.z, r: 10.5 });

  const trees = [];
  let placed = 0;
  for (let i = 0; i < 2000 && placed < 260; i++) {
    const a = rand() * Math.PI * 2;
    const d = 24 + Math.sqrt(rand()) * (WORLD_RADIUS - 20);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const inForest = Math.hypot(x + 35, z + 35) < 30;
    if (!inForest && rand() < 0.45) continue;
    if (nearZone(x, z, 2) || onPath(x, z) || Math.hypot(x - LAKE.x, z - LAKE.z) < 13) continue;
    const s = 0.8 + rand() * 0.7;
    const pine = inForest || rand() < 0.4;
    const leaf = pine ? null : [0x3fa34d, 0x56b84a, 0x2f8f3f][Math.floor(rand() * 3)];
    const rot = rand() * 6;
    trees.push({ x, z, s, pine, inForest, leaf, rot });
    colliders.push({ x, z, r: 0.7 * s });
    placed++;
  }

  const rocks = [];
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2, d = 25 + rand() * (WORLD_RADIUS - 25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (onPath(x, z) || nearZone(x, z, 1)) continue;
    const s = 0.6 + rand() * 1.4;
    rocks.push({ x, z, s, rx: rand(), ry: rand(), rz: rand() });
    colliders.push({ x, z, r: s * 0.9 });
  }

  const gc = ZONES.find((z) => z.id === 'goblins');
  const tents = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const x = gc.x + Math.cos(a) * 9, z = gc.z + Math.sin(a) * 9;
    tents.push({ x, z, color: [0x8b5a2b, 0x6b8e23][i % 2] });
    colliders.push({ x, z, r: 2.2 });
  }
  const campfire = { x: gc.x, z: gc.z };
  colliders.push({ x: gc.x, z: gc.z, r: 1 });

  const rz = ZONES.find((z) => z.id === 'ruins');
  const pillars = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = rz.x + Math.cos(a) * 14, z = rz.z + Math.sin(a) * 14;
    const h = i % 3 === 0 ? 2 : 6 + rand() * 3;
    pillars.push({ x, z, h });
    colliders.push({ x, z, r: 1.4 });
  }
  const altar = { x: rz.x, z: rz.z - 6 };

  const mountains = [];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rand() * 0.04;
    const d = WORLD_RADIUS + 14 + rand() * 18;
    const h = 16 + rand() * 28, rad = 12 + rand() * 10;
    const sides = 5 + Math.floor(rand() * 3);
    mountains.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h, rad, sides, rot: rand() * Math.PI, color: [0x6f8a5e, 0x7d8a74, 0x667a58][i % 3] });
  }
  const edgeRocks = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const s = 1.4 + rand() * 1.6;
    edgeRocks.push({ x: Math.cos(a) * (WORLD_RADIUS + 2.5), z: Math.sin(a) * (WORLD_RADIUS + 2.5), s, rx: rand(), ry: rand(), rz: rand() });
  }

  return { colliders, trees, rocks, tents, campfire, pillars, altar, mountains, edgeRocks };
}

/** Consultas sobre o mapa (colisão, zona segura, estrada, mato). `pos` pode ser qualquer objeto com x/z. */
export function createWorldQueries(layout) {
  const { colliders, trees } = layout;

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

  const zoneAt = (x, z) => ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 4) || null;
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

  return { colliders, resolve, zoneAt, isSafe, isRoad, isWooded, isBlocked };
}
