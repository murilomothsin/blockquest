// Layout do mapa em dados puros (sem three.js): usado pelo cliente (para desenhar)
// e pelo servidor (colisão, zona segura, "mato", mina, casa, baús de tesouro).
import { mulberry32 } from './rng.js';

export const WORLD_RADIUS = 190;
export const WORLD_SEED = 1337;

/** Zona segura em volta da vila: nada spawna e monstros não entram */
export const SAFE_ZONE = { x: 0, z: 0, r: 32 };
/** "Mato alto": ponto com pelo menos minTrees árvores num raio de `radius` metros */
export const WOODS = { radius: 10, minTrees: 3 };

// ---------- Biomas (anel externo do mapa) ----------
export const BIOMES = {
  grass: { name: 'Campos', ground: 0x62b04c },
  desert: { name: 'Deserto Escaldante', ground: 0xdcc48a },
  swamp: { name: 'Pântano Sombrio', ground: 0x4f5f36 },
  quarry: { name: 'Pedreira', ground: 0x8f8b7c },
};
const BIOME_R = 100; // a partir daqui o anel externo muda de bioma
/** setores em graus (atan2(z, x)) */
const SECTORS = [
  { id: 'desert', from: -40, to: 28 },
  { id: 'swamp', from: 118, to: 188 },
  { id: 'quarry', from: -172, to: -112 },
];
const inSector = (a, s) => { // ângulos podem passar de 180
  const norm = (v) => ((v % 360) + 540) % 360 - 180;
  const from = norm(s.from), to = norm(s.to);
  return from <= to ? a >= from && a <= to : a >= from || a <= to;
};
/** bioma no ponto (para jogo e cores do chão) */
export function biomeAt(x, z) {
  if (Math.hypot(x, z) < BIOME_R) return 'grass';
  const a = (Math.atan2(z, x) * 180) / Math.PI;
  for (const s of SECTORS) if (inSector(a, s)) return s.id;
  return 'grass';
}
/** 0..1: quanto o ponto está "dentro" do bioma (borda suave para pintar o chão) */
export function biomeBlend(x, z) {
  const r = Math.hypot(x, z);
  const kr = Math.max(0, Math.min(1, (r - BIOME_R + 6) / 18));
  const a = (Math.atan2(z, x) * 180) / Math.PI;
  for (const s of SECTORS) {
    const norm = (v) => ((v % 360) + 540) % 360 - 180;
    const d = Math.min(Math.abs(norm(a - s.from)), Math.abs(norm(a - s.to)));
    if (inSector(a, s)) return { id: s.id, k: kr * Math.min(1, d / 8 + 0.35) };
  }
  return { id: 'grass', k: 0 };
}

export const ZONES = [
  { id: 'village', name: 'Vila Pedraverde', x: 0, z: 0, r: 22, color: '#e9d28a' },
  { id: 'forest', name: 'Floresta Sombria', x: -35, z: -35, r: 18, color: '#2f7a2f' },
  { id: 'meadow', name: 'Campos do Leste', x: 38, z: 40, r: 15, color: '#6fbf4a' },
  { id: 'goblins', name: 'Acampamento Goblin', x: 65, z: -15, r: 14, color: '#a0522d' },
  { id: 'ruins', name: 'Ruínas Antigas', x: 0, z: -95, r: 16, color: '#888888' },
  { id: 'desert', name: 'Deserto Escaldante', x: 148, z: -18, r: 32, color: '#e0c27a' },
  { id: 'swamp', name: 'Pântano Sombrio', x: -122, z: 78, r: 32, color: '#556b2f' },
  { id: 'quarry', name: 'Pedreira e Mina', x: -122, z: -82, r: 30, color: '#9a968a' },
];

export const MINE_DOOR = { x: -146, z: -96 }; // entrada da mina (na pedreira)
export const PATHS = [[-35, -35], [65, -15], [38, 40], [0, -95], [MINE_DOOR.x * 0.95, MINE_DOOR.z * 0.95]]; // estradas saindo da vila

export const HOUSES = [
  { x: -12, z: -10, rot: Math.PI / 4, wall: 0xf1e3c6, roof: 0xb5402f, mine: true }, // casa do jogador
  { x: 12, z: -12, rot: -Math.PI / 4, wall: 0xe8d3a9, roof: 0x3b5fb5 },
  { x: -14, z: 10, rot: (3 * Math.PI) / 4, wall: 0xf3efe6, roof: 0x2f8a4a },
  { x: 14, z: 11, rot: (-3 * Math.PI) / 4, wall: 0xe6c9a8, roof: 0x8a3fb5 },
];
/** ponto de interação da porta da casa do jogador (do lado de fora) */
export const HOME_DOOR = (() => {
  const h = HOUSES[0];
  return { x: h.x + Math.sin(h.rot) * 5, z: h.z + Math.cos(h.rot) * 5 };
})();
export const LAKE = { x: -45, z: 30, r: 11 };
export const WELL = { x: 0, z: 0 };
/** NPCs (posição usada também pelo servidor para checar se o jogador está perto da loja/ancião/poço) */
export const NPCS = {
  elder: { name: 'Ancião Bento', x: 4, z: -5 },
  merchant: { name: 'Mercadora Lia', x: -6, z: 4 },
};
export const INTERACT_RANGE = { npc: 6, well: 4.5, door: 3.2, furniture: 3, chest: 3 };
export const SPAWN_POINT = [0, 0, 8];

// ---------- Casa do jogador (interior privado: cada jogador vê só a si mesmo lá dentro) ----------
export const HOME = { x0: 400, z0: 120, w: 14, d: 12 };
export const HOME_FURNITURE = {
  rack: { name: 'Armário de Armas', icon: '⚔️', x: 401.4, z: 125, desc: 'Guarda armas, armaduras e capacetes.' },
  safe: { name: 'Cofre', icon: '💰', x: 412.6, z: 125, desc: 'Guarda o seu ouro.' },
  chest: { name: 'Baú', icon: '🧰', x: 405, z: 121.2, desc: 'Guarda as poções.' },
  mirror: { name: 'Espelho', icon: '🪞', x: 410, z: 121.2, desc: 'Personalização do personagem (em breve).' },
};
export const HOME_ENTRY = { x: 407, z: 129.5 }; // onde o jogador aparece ao entrar
export const HOME_EXIT = { x: 407, z: 131.3 }; // porta (por dentro)

// ---------- Mina (dungeon): salas + corredores em grade de 4 m ----------
export const MINE = { x0: 400, z0: -60, tile: 4, cols: 30, rows: 26 };
const MINE_ROOMS = [
  { id: 'entrada', x: 2, z: 2, w: 5, h: 4 },
  { id: 'aranhas', x: 11, z: 1, w: 6, h: 4 },
  { id: 'ossos', x: 2, z: 10, w: 6, h: 5 },
  { id: 'goblins', x: 12, z: 9, w: 7, h: 5 },
  { id: 'cripta', x: 21, z: 3, w: 6, h: 6 },
  { id: 'salao', x: 21, z: 13, w: 6, h: 5 },
  { id: 'chefe', x: 8, z: 18, w: 12, h: 7 },
];
const MINE_LINKS = [[0, 1], [0, 2], [1, 4], [2, 3], [3, 5], [4, 5], [3, 6]];
/** marcadores: E = escada de saída, C = baú (tier 2), T = baú do chefe (tier 3), letras = monstros */
const MINE_MARKS = [
  ['E', 4, 3],
  // aranhas
  ['spider', 12, 2], ['spider', 15, 2], ['spider', 13, 4], ['spider', 16, 4], ['C', 16, 1],
  // esqueletos
  ['skeleton', 3, 11], ['skeleton', 6, 11], ['skeleton', 4, 13], ['C', 7, 14],
  // goblins das cavernas
  ['cave_goblin', 13, 10], ['cave_goblin', 17, 10], ['cave_goblin', 15, 12], ['cave_goblin', 13, 13], ['C', 18, 13],
  // cripta: mortos-vivos
  ['zombie', 22, 4], ['zombie', 25, 4], ['zombie', 23, 7], ['zombie', 25, 7], ['C', 26, 3],
  // salão: misto
  ['skeleton', 22, 14], ['spider', 25, 14], ['spider', 23, 16], ['zombie', 25, 16], ['C', 26, 17],
  // chefe
  ['goblin_boss', 14, 22], ['cave_goblin', 10, 20], ['cave_goblin', 18, 20], ['T', 14, 24],
];
export const mineTileCenter = (tx, tz) => ({ x: MINE.x0 + (tx + 0.5) * MINE.tile, z: MINE.z0 + (tz + 0.5) * MINE.tile });

function buildMineGrid() {
  const g = Array.from({ length: MINE.rows }, () => Array(MINE.cols).fill(1)); // 1 = parede
  const dig = (x, z) => { if (z >= 1 && z < MINE.rows - 1 && x >= 1 && x < MINE.cols - 1) g[z][x] = 0; };
  for (const r of MINE_ROOMS) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) dig(x, z);
  const center = (r) => [Math.floor(r.x + r.w / 2), Math.floor(r.z + r.h / 2)];
  for (const [a, b] of MINE_LINKS) { // corredor em L
    const [ax, az] = center(MINE_ROOMS[a]), [bx, bz] = center(MINE_ROOMS[b]);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) dig(x, az);
    for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) dig(bx, z);
  }
  return g;
}
export const MINE_GRID = buildMineGrid();
export const MINE_EXIT = mineTileCenter(...MINE_MARKS.find((m) => m[0] === 'E').slice(1));
export const MINE_ENTRY = { x: MINE_EXIT.x, z: MINE_EXIT.z + 4 }; // aparece um tile à frente da escada
export const MINE_SPAWNS = MINE_MARKS.filter(([k]) => k.length > 1).map(([type, tx, tz]) => ({ type, ...mineTileCenter(tx, tz) }));
export const MINE_ROOM_CENTERS = MINE_ROOMS.map((r) => ({ id: r.id, ...mineTileCenter(r.x + r.w / 2 - 0.5, r.z + r.h / 2 - 0.5) }));

// ---------- Baús de tesouro (cada jogador abre o seu; reabastecem depois de `respawn` s) ----------
export const TREASURES = [
  { id: 't_floresta', x: -50, z: -46, tier: 1 },
  { id: 't_campos', x: 47, z: 50, tier: 1 },
  { id: 't_ruinas', x: 5, z: -101, tier: 2 },
  { id: 't_deserto', x: 158, z: -30, tier: 2 },
  { id: 't_pantano', x: -132, z: 86, tier: 2 },
  { id: 't_pedreira', x: -112, z: -70, tier: 1 },
  ...MINE_MARKS.filter(([k]) => k === 'C' || k === 'T').map(([k, tx, tz], i) => ({ id: `t_mina${i + 1}`, ...mineTileCenter(tx, tz), tier: k === 'T' ? 3 : 2 })),
];
export const TREASURE_RESPAWN = { 1: 600, 2: 1200, 3: 2700 }; // s

// ---------- Regiões ----------
export const inMine = (x, z) => x >= MINE.x0 && x < MINE.x0 + MINE.cols * MINE.tile && z >= MINE.z0 && z < MINE.z0 + MINE.rows * MINE.tile;
export const inHome = (x, z) => x >= HOME.x0 - 1 && x <= HOME.x0 + HOME.w + 1 && z >= HOME.z0 - 1 && z <= HOME.z0 + HOME.d + 1;
export const regionAt = (x, z) => (inMine(x, z) ? 'mine' : inHome(x, z) ? 'home' : 'world');
const mineWall = (tx, tz) => tx < 0 || tz < 0 || tx >= MINE.cols || tz >= MINE.rows || MINE_GRID[tz][tx] === 1;

export function onPath(x, z, half = 4) {
  return PATHS.some(([ex, ez]) => {
    const len2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, (x * ex + z * ez) / len2));
    return Math.hypot(x - ex * t, z - ez * t) < half;
  });
}

const nearZone = (x, z, pad) => ZONES.some((zn) => !['desert', 'swamp', 'quarry'].includes(zn.id) && Math.hypot(x - zn.x, z - zn.z) < zn.r * (zn.id === 'forest' ? 0.55 : 1) + pad);

/** Gera tudo que tem posição no mapa. Determinístico (mesma semente = mesmo mapa). */
export function buildLayout(seed = WORLD_SEED) {
  const rand = mulberry32(seed);
  const colliders = []; // {x, z, r}
  for (const h of HOUSES) colliders.push({ x: h.x, z: h.z, r: 4.3 });
  colliders.push({ x: WELL.x, z: WELL.z, r: 1.6 });
  colliders.push({ x: LAKE.x, z: LAKE.z, r: 10.5 });
  const nearTreasure = (x, z, r) => TREASURES.some((t) => Math.hypot(x - t.x, z - t.z) < r);
  const nearDoor = (x, z, r) => Math.hypot(x - MINE_DOOR.x, z - MINE_DOOR.z) < r;

  // árvores normais (não nascem no deserto nem na pedreira; no pântano viram árvores mortas)
  const trees = [];
  const deadTrees = [];
  let placed = 0;
  for (let i = 0; i < 5000 && placed < 380; i++) {
    const a = rand() * Math.PI * 2;
    const d = 24 + Math.sqrt(rand()) * (WORLD_RADIUS - 30);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const biome = biomeAt(x, z);
    const inForest = Math.hypot(x + 35, z + 35) < 30;
    if (!inForest && rand() < 0.45) continue;
    if (biome === 'desert' || (biome === 'quarry' && rand() < 0.85)) continue;
    if (nearZone(x, z, 2) || onPath(x, z) || Math.hypot(x - LAKE.x, z - LAKE.z) < 13 || nearTreasure(x, z, 4) || nearDoor(x, z, 14)) continue;
    const s = 0.8 + rand() * 0.7;
    if (biome === 'swamp') {
      deadTrees.push({ x, z, s, rot: rand() * 6 });
      colliders.push({ x, z, r: 0.5 * s });
      placed++;
      continue;
    }
    const pine = inForest || biome === 'quarry' || rand() < 0.4;
    const leaf = pine ? null : [0x3fa34d, 0x56b84a, 0x2f8f3f][Math.floor(rand() * 3)];
    trees.push({ x, z, s, pine, inForest, leaf, rot: rand() * 6 });
    colliders.push({ x, z, r: 0.7 * s });
    placed++;
  }

  const rocks = [];
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2, d = 25 + rand() * (WORLD_RADIUS - 28);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const biome = biomeAt(x, z);
    if (onPath(x, z) || nearZone(x, z, 1) || nearTreasure(x, z, 3) || nearDoor(x, z, 10)) continue;
    if (biome === 'grass' && rand() < 0.4) continue;
    const s = (biome === 'quarry' ? 1.2 : 0.6) + rand() * (biome === 'quarry' ? 2.2 : 1.4);
    const color = biome === 'desert' ? 0xc9a873 : biome === 'quarry' ? 0x7b7a74 : 0x8d8d8d;
    rocks.push({ x, z, s, rx: rand(), ry: rand(), rz: rand(), color, ore: biome === 'quarry' && rand() < 0.3 });
    colliders.push({ x, z, r: s * 0.9 });
  }

  // deserto: cactos e ossadas
  const cacti = [], bones = [];
  for (let i = 0; i < 400 && cacti.length < 45; i++) {
    const a = rand() * Math.PI * 2, d = BIOME_R + 8 + rand() * (WORLD_RADIUS - BIOME_R - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (biomeAt(x, z) !== 'desert' || onPath(x, z) || nearTreasure(x, z, 4)) continue;
    const h = 2 + rand() * 2.5;
    cacti.push({ x, z, h, arms: Math.floor(rand() * 3), rot: rand() * 6 });
    colliders.push({ x, z, r: 0.6 });
  }
  for (let i = 0; i < 300 && bones.length < 14; i++) {
    const a = rand() * Math.PI * 2, d = BIOME_R + 8 + rand() * (WORLD_RADIUS - BIOME_R - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (biomeAt(x, z) === 'desert') bones.push({ x, z, rot: rand() * 6, s: 0.8 + rand() * 0.8 });
  }

  // pântano: poças escuras e juncos (sem colisão: dá pra atravessar)
  const ponds = [], reeds = [];
  for (let i = 0; i < 300 && ponds.length < 12; i++) {
    const a = rand() * Math.PI * 2, d = BIOME_R + 10 + rand() * (WORLD_RADIUS - BIOME_R - 16);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (biomeAt(x, z) !== 'swamp' || nearTreasure(x, z, 6)) continue;
    ponds.push({ x, z, r: 3 + rand() * 5 });
    for (let k = 0; k < 6; k++) { const b = rand() * 6.28, rr = 3 + rand() * 6; reeds.push({ x: x + Math.cos(b) * rr, z: z + Math.sin(b) * rr, h: 0.8 + rand() }); }
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

  // entrada da mina: morro de pedra atrás da porta, virado para a vila
  const out = Math.hypot(MINE_DOOR.x, MINE_DOOR.z);
  const ux = MINE_DOOR.x / out, uz = MINE_DOOR.z / out; // para fora do mapa
  const mineHill = { x: MINE_DOOR.x + ux * 8, z: MINE_DOOR.z + uz * 8, r: 9, rot: Math.atan2(-ux, -uz) };
  colliders.push({ x: mineHill.x, z: mineHill.z, r: 7.5 });

  for (const t of TREASURES) if (!inMine(t.x, t.z)) colliders.push({ x: t.x, z: t.z, r: 0.8 });

  const mountains = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + rand() * 0.04;
    const d = WORLD_RADIUS + 14 + rand() * 18;
    const h = 16 + rand() * 28, rad = 12 + rand() * 10;
    const sides = 5 + Math.floor(rand() * 3);
    const b = biomeAt(Math.cos(a) * (WORLD_RADIUS - 5), Math.sin(a) * (WORLD_RADIUS - 5));
    const palette = { desert: [0xc8a46a, 0xb98f57, 0xd2b07a], swamp: [0x4d5a3a, 0x56603f, 0x485536], quarry: [0x7a7870, 0x87847a, 0x6d6b64] }[b] || [0x6f8a5e, 0x7d8a74, 0x667a58];
    mountains.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h, rad, sides, rot: rand() * Math.PI, color: palette[i % 3], snow: b !== 'desert' && b !== 'swamp' });
  }
  const edgeRocks = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const s = 1.4 + rand() * 1.6;
    edgeRocks.push({ x: Math.cos(a) * (WORLD_RADIUS + 2.5), z: Math.sin(a) * (WORLD_RADIUS + 2.5), s, rx: rand(), ry: rand(), rz: rand() });
  }

  // decoração da mina: tochas e cristais nas paredes vizinhas ao chão
  const mineTorches = [], mineCrystals = [];
  for (let tz = 1; tz < MINE.rows - 1; tz++) {
    for (let tx = 1; tx < MINE.cols - 1; tx++) {
      if (MINE_GRID[tz][tx] !== 1) continue;
      const floorN = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => MINE_GRID[tz + dz]?.[tx + dx] === 0);
      if (!floorN.length) continue;
      const r = rand();
      const [dx, dz] = floorN[0];
      const c = mineTileCenter(tx, tz);
      const face = { x: c.x + dx * MINE.tile * 0.5, z: c.z + dz * MINE.tile * 0.5, dx, dz };
      if (r < 0.07) mineTorches.push(face);
      else if (r < 0.16) mineCrystals.push({ ...face, color: [0x6fe3ff, 0xb46bff, 0x7dff9a, 0xffd65c][Math.floor(rand() * 4)] });
    }
  }

  return {
    colliders, trees, deadTrees, rocks, cacti, bones, ponds, reeds, tents, campfire, pillars, altar,
    mountains, edgeRocks, mineHill, mineTorches, mineCrystals,
  };
}

/** Consultas sobre o mapa (colisão, zona segura, estrada, mato, linha de visão). `pos` pode ser qualquer objeto com x/z. */
export function createWorldQueries(layout) {
  const { colliders, trees } = layout;
  const T = MINE.tile;

  function resolveMine(pos, radius) {
    const tx = Math.floor((pos.x - MINE.x0) / T), tz = Math.floor((pos.z - MINE.z0) / T);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, z = tz + dz;
        if (!mineWall(x, z)) continue;
        const x0 = MINE.x0 + x * T, z0 = MINE.z0 + z * T;
        const cx = Math.max(x0, Math.min(pos.x, x0 + T)), cz = Math.max(z0, Math.min(pos.z, z0 + T));
        let ddx = pos.x - cx, ddz = pos.z - cz;
        let d = Math.hypot(ddx, ddz);
        if (d < 1e-6) { // centro dentro da parede: empurra para o lado aberto mais próximo
          const opts = [[pos.x - x0, -1, 0], [x0 + T - pos.x, 1, 0], [pos.z - z0, 0, -1], [z0 + T - pos.z, 0, 1]].sort((a, b) => a[0] - b[0]);
          const [dist, ox, oz] = opts[0];
          pos.x += ox * (dist + radius); pos.z += oz * (dist + radius);
          continue;
        }
        if (d < radius) { pos.x = cx + (ddx / d) * radius; pos.z = cz + (ddz / d) * radius; }
      }
    }
  }

  function resolve(pos, radius) {
    if (inMine(pos.x, pos.z)) return resolveMine(pos, radius);
    if (inHome(pos.x, pos.z)) {
      pos.x = Math.max(HOME.x0 + radius, Math.min(HOME.x0 + HOME.w - radius, pos.x));
      pos.z = Math.max(HOME.z0 + radius, Math.min(HOME.z0 + HOME.d - radius, pos.z));
      return;
    }
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

  const zoneAt = (x, z) => {
    if (inMine(x, z)) return { id: 'mine', name: 'Mina Abandonada' };
    if (inHome(x, z)) return { id: 'home', name: 'Sua Casa' };
    return ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 4) || null;
  };
  const isSafe = (x, z) => inHome(x, z) || Math.hypot(x - SAFE_ZONE.x, z - SAFE_ZONE.z) < SAFE_ZONE.r;
  const isRoad = (x, z) => onPath(x, z, 5.5);
  const treesNear = (x, z, r) => {
    let n = 0;
    for (const t of trees) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r) n++;
    return n;
  };
  /** "mato alto": área com árvores, fora da zona segura e da estrada (nunca na mina/casa) */
  const isWooded = (x, z) => regionAt(x, z) === 'world' && !isSafe(x, z) && !isRoad(x, z) && treesNear(x, z, WOODS.radius) >= WOODS.minTrees;
  const isBlocked = (x, z, r = 1) => {
    if (inMine(x, z)) return mineWall(Math.floor((x - MINE.x0) / T), Math.floor((z - MINE.z0) / T));
    return colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r) || Math.hypot(x, z) > WORLD_RADIUS - 2;
  };
  /** linha de visão (só importa na mina: paredes bloqueiam) */
  const los = (x1, z1, x2, z2) => {
    if (!inMine(x1, z1) || !inMine(x2, z2)) return regionAt(x1, z1) === regionAt(x2, z2);
    const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 1.5);
    for (let i = 1; i < n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
      if (mineWall(Math.floor((x - MINE.x0) / T), Math.floor((z - MINE.z0) / T))) return false;
    }
    return true;
  };

  return { colliders, resolve, zoneAt, isSafe, isRoad, isWooded, isBlocked, los, biomeAt, regionAt };
}
