// Layout do mapa em dados puros (sem three.js): usado pelo cliente (para desenhar)
// e pelo servidor (colisão, zonas seguras, "mato", dungeons, casa, portas, baús de tesouro).
import { mulberry32 } from './rng.js';

export const WORLD_RADIUS = 300;
export const WORLD_SEED = 1337;

/** Zonas seguras (vila e pátio do castelo): nada spawna e monstros não entram */
export const SAFE_ZONE = { x: 0, z: 0, r: 32 };
/** "Mato alto": ponto com pelo menos minTrees árvores num raio de `radius` metros */
export const WOODS = { radius: 10, minTrees: 3 };

// ---------- Biomas (anel externo do mapa) ----------
export const BIOMES = {
  grass: { id: 'grass', name: 'Campos', ground: 0x62b04c },
  desert: { id: 'desert', name: 'Deserto Escaldante', ground: 0xdcc48a },
  swamp: { id: 'swamp', name: 'Pântano Sombrio', ground: 0x4f5f36 },
  quarry: { id: 'quarry', name: 'Pedreira', ground: 0x8f8b7c },
  highlands: { id: 'highlands', name: 'Planalto de Pedralta', ground: 0x86a85e },
  cursed: { id: 'cursed', name: 'Terras Amaldiçoadas', ground: 0x4c4459, map: 0x75688c },
};
const BIOME_R = 100; // a partir daqui o anel externo muda de bioma
/** setores em graus (atan2(z, x)) */
const SECTORS = [
  { id: 'desert', from: -40, to: 28 },
  { id: 'cursed', from: 40, to: 105 },
  { id: 'swamp', from: 118, to: 188 },
  { id: 'quarry', from: -172, to: -112 },
  { id: 'highlands', from: -100, to: -52 },
];
const norm = (v) => ((v % 360) + 540) % 360 - 180;
const inSector = (a, s) => { // ângulos podem passar de 180
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
    const d = Math.min(Math.abs(norm(a - s.from)), Math.abs(norm(a - s.to)));
    if (inSector(a, s)) return { id: s.id, k: kr * Math.min(1, d / 8 + 0.35) };
  }
  return { id: 'grass', k: 0 };
}

// ---------- Lugares importantes ----------
/** Castelo de Pedralta (planalto, norte): quadrado de muralhas, portão virado para a vila */
export const CASTLE = { x: 48, z: -205, half: 26, gate: 5 };
/** Ruínas Amaldiçoadas (terras amaldiçoadas, sudeste): cemitério com cripta no meio */
export const CURSED = { x: 60, z: 164, r: 26 };
/** Torre do Necromante (fundo das terras amaldiçoadas) */
export const TOWER = { x: -9, z: 262, r: 9 };
const towardVillage = (p, d) => { const r = Math.hypot(p.x, p.z); return { x: p.x - (p.x / r) * d, z: p.z - (p.z / r) * d }; };
export const TOWER_DOOR = towardVillage(TOWER, TOWER.r + 1.6);

export const ZONES = [
  { id: 'village', name: 'Vila Pedraverde', x: 0, z: 0, r: 22, color: '#e9d28a' },
  { id: 'forest', name: 'Floresta Sombria', x: -35, z: -35, r: 18, color: '#2f7a2f' },
  { id: 'meadow', name: 'Campos do Leste', x: 38, z: 40, r: 15, color: '#6fbf4a' },
  { id: 'goblins', name: 'Acampamento Goblin', x: 65, z: -15, r: 14, color: '#a0522d' },
  { id: 'ruins', name: 'Ruínas Antigas', x: 0, z: -95, r: 16, color: '#888888' },
  { id: 'castle', name: 'Castelo de Pedralta', x: CASTLE.x, z: CASTLE.z, r: 32, color: '#cfc6b0' },
  { id: 'cursed', name: 'Ruínas Amaldiçoadas', x: CURSED.x, z: CURSED.z, r: 28, color: '#7a5f9a' },
  { id: 'tower', name: 'Torre do Necromante', x: TOWER.x, z: TOWER.z, r: 18, color: '#3d3350' },
  { id: 'desert', name: 'Deserto Escaldante', x: 148, z: -18, r: 32, color: '#e0c27a' },
  { id: 'swamp', name: 'Pântano Sombrio', x: -122, z: 78, r: 32, color: '#556b2f' },
  { id: 'quarry', name: 'Pedreira e Mina', x: -122, z: -82, r: 30, color: '#9a968a' },
  { id: 'wolves', name: 'Covil dos Lobos', x: 108, z: -212, r: 22, color: '#8fb36a' },
];
const BIG_AREAS = ['desert', 'swamp', 'quarry', 'wolves'];

export const SAFE_ZONES = [SAFE_ZONE, { x: CASTLE.x, z: CASTLE.z, r: 30 }];

export const MINE_DOOR = { x: -146, z: -96 }; // entrada da mina (na pedreira)
export const PATHS = [ // estradas saindo da vila (segmentos a partir do centro)
  [-35, -35], [65, -15], [38, 40], [0, -95], [MINE_DOOR.x * 0.95, MINE_DOOR.z * 0.95],
  [CASTLE.x, CASTLE.z + CASTLE.half + 2], [CURSED.x * 0.86, CURSED.z * 0.86], [TOWER_DOOR.x, TOWER_DOOR.z],
];

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
/** Lugares que curam toda a vida (E): o poço da vila e a fonte do castelo */
export const WELLS = [
  { id: 'well', name: 'poço da vila', x: 0, z: 0 },
  { id: 'fountain', name: 'fonte do castelo', x: CASTLE.x, z: CASTLE.z + 9 },
];
export const WELL = WELLS[0];
/** NPCs (posição usada também pelo servidor). role: 'quests' dá missões, 'shop' abre a loja */
export const NPCS = {
  elder: { name: 'Ancião Bento', x: 4, z: -5, role: 'quests', title: 'o Ancião Bento', where: 'na vila' },
  merchant: { name: 'Mercadora Lia', x: -6, z: 4, role: 'shop' },
  captain: { name: 'Capitã Helena', x: CASTLE.x - 7, z: CASTLE.z + 2, role: 'quests', title: 'a Capitã Helena', where: 'no Castelo de Pedralta' },
  smith: { name: 'Ferreiro Duarte', x: CASTLE.x + 8, z: CASTLE.z + 4, role: 'shop' },
};
export const INTERACT_RANGE = { npc: 6, well: 4.5, door: 3.2, furniture: 3, chest: 3 };
export const SPAWN_POINT = [0, 0, 8];

// ---------- Casa do jogador (interior privado: cada jogador vê só a si mesmo lá dentro) ----------
export const HOME = { x0: 400, z0: 120, w: 14, d: 12 };
export const HOME_FURNITURE = {
  rack: { name: 'Armário de Armas', icon: '⚔️', x: 401.4, z: 125, desc: 'Guarda armas, armaduras e capacetes.' },
  safe: { name: 'Cofre', icon: '💰', x: 412.6, z: 125, desc: 'Guarda o seu ouro.' },
  chest: { name: 'Baú', icon: '🧰', x: 405, z: 121.2, desc: 'Guarda poções e pergaminhos.' },
  mirror: { name: 'Espelho', icon: '🪞', x: 410, z: 121.2, desc: 'Personalização do personagem (em breve).' },
};
export const HOME_ENTRY = { x: 407, z: 129.5 }; // onde o jogador aparece ao entrar
export const HOME_EXIT = { x: 407, z: 131.3 }; // porta (por dentro)

// ---------- Dungeons em grade (mina e andares da torre) ----------
// Cada dungeon: grade de tiles (1 = parede, 0 = chão) num canto fora do mapa visível.
// Marcadores: E = saída, U = escada para cima, D = escada para baixo, C = baú (tier 2), T = baú do chefe (tier 3),
// e o resto são tipos de monstro.
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
const MINE_MARKS = [
  ['E', 4, 3],
  ['spider', 12, 2], ['spider', 15, 2], ['spider', 13, 4], ['spider', 16, 4], ['C', 16, 1],
  ['skeleton', 3, 11], ['skeleton', 6, 11], ['skeleton', 4, 13], ['C', 7, 14],
  ['cave_goblin', 13, 10], ['cave_goblin', 17, 10], ['cave_goblin', 15, 12], ['cave_goblin', 13, 13], ['C', 18, 13],
  ['zombie', 22, 4], ['zombie', 25, 4], ['zombie', 23, 7], ['zombie', 25, 7], ['C', 26, 3],
  ['skeleton', 22, 14], ['spider', 25, 14], ['spider', 23, 16], ['zombie', 25, 16], ['C', 26, 17],
  ['goblin_boss', 14, 22], ['cave_goblin', 10, 20], ['cave_goblin', 18, 20], ['T', 14, 24],
];
function buildMineGrid() {
  const g = Array.from({ length: MINE.rows }, () => Array(MINE.cols).fill(1));
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

/** Torre do Necromante: 4 andares redondos (21×21 tiles de 4 m). Cada andar tem um desenho próprio. */
const TOWER_N = 21, TC = 10;
function buildTowerGrid(floor) {
  const g = Array.from({ length: TOWER_N }, () => Array(TOWER_N).fill(1));
  for (let z = 0; z < TOWER_N; z++) {
    for (let x = 0; x < TOWER_N; x++) {
      const d = Math.hypot(x - TC, z - TC), a = (Math.atan2(z - TC, x - TC) * 180) / Math.PI;
      let wall = d > 9.3;
      if (floor === 1) { // salão: pilar central e braços em cruz com passagens
        if (Math.abs(x - TC) <= 1 && Math.abs(z - TC) <= 1) wall = true;
        if (x === TC && ((z >= 4 && z <= 7) || (z >= 13 && z <= 14))) wall = true; // braço sul curto: a entrada fica livre
        if (z === TC && ((x >= 3 && x <= 6) || (x >= 14 && x <= 17))) wall = true;
      } else if (floor === 2) { // biblioteca: sala redonda no meio, portas ao norte e ao sul
        if (d >= 4.5 && d <= 5.5 && Math.abs(x - TC) > 1) wall = true;
      } else if (floor === 3) { // câmara das gárgulas: dois anéis com aberturas opostas (espiral até a escada no meio)
        if (d >= 5.5 && d <= 6.5 && Math.abs(a) > 25) wall = true;
        if (d >= 2.5 && d <= 3.5 && Math.abs(norm(a - 180)) > 35) wall = true;
      } else if (floor === 4) { // topo: arena com 4 pilares
        for (const [px, pz] of [[6, 6], [14, 6], [6, 14], [14, 14]]) if (x === px && z === pz) wall = true;
      }
      g[z][x] = wall ? 1 : 0;
    }
  }
  return g;
}
const TOWER_MARKS = {
  1: [['D', 10, 18], ['U', 10, 2], ['skeleton', 4, 7], ['skeleton', 16, 7], ['skeleton', 4, 13], ['cultist', 14, 13], ['cultist', 7, 4], ['cultist', 13, 4], ['C', 15, 15]],
  2: [['D', 10, 18], ['U', 10, 2], ['ghost', 5, 5], ['ghost', 15, 5], ['ghost', 5, 15], ['ghost', 15, 15], ['cultist', 8, 10], ['cultist', 12, 10], ['C', 10, 10]],
  3: [['D', 10, 18], ['U', 10, 10], ['gargoyle', 10, 3], ['gargoyle', 17, 10], ['gargoyle', 3, 10], ['cultist', 10, 14], ['cultist', 6, 10], ['C', 10, 6]],
  4: [['D', 10, 18], ['necromancer', 10, 9], ['cultist', 7, 11], ['cultist', 13, 11], ['T', 10, 4]],
};
export const TOWER_FLOORS = 4;
export const TOWER_NAMES = { 1: 'Salão dos Ossos', 2: 'Biblioteca Proibida', 3: 'Câmara das Gárgulas', 4: 'Topo da Torre' };

/** todas as dungeons em grade */
export const DUNGEONS = [
  { id: 'mine', region: 'mine', name: 'Mina Abandonada', ...MINE, grid: MINE_GRID, marks: MINE_MARKS, style: 'mine' },
  ...[1, 2, 3, 4].map((f) => ({
    id: `tower${f}`, region: 'tower', floor: f, name: `Torre do Necromante — ${f}º andar (${TOWER_NAMES[f]})`,
    x0: 600, z0: -60 + (f - 1) * 110, tile: 4, cols: TOWER_N, rows: TOWER_N, grid: buildTowerGrid(f), marks: TOWER_MARKS[f], style: 'tower',
  })),
];
export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));
export const tileCenter = (d, tx, tz) => ({ x: d.x0 + (tx + 0.5) * d.tile, z: d.z0 + (tz + 0.5) * d.tile });
export const dungeonAt = (x, z) => DUNGEONS.find((d) => x >= d.x0 && x < d.x0 + d.cols * d.tile && z >= d.z0 && z < d.z0 + d.rows * d.tile) || null;
export const gridWall = (d, tx, tz) => tx < 0 || tz < 0 || tx >= d.cols || tz >= d.rows || d.grid[tz][tx] === 1;
const markAt = (d, k) => { const m = d.marks.find((mm) => mm[0] === k); return m ? tileCenter(d, m[1], m[2]) : null; };
export const isDungeonRegion = (r) => r === 'mine' || r === 'tower';

export const mineTileCenter = (tx, tz) => tileCenter(DUNGEONS[0], tx, tz);
export const MINE_EXIT = markAt(DUNGEONS[0], 'E');
export const MINE_ENTRY = { x: MINE_EXIT.x, z: MINE_EXIT.z + 4 }; // aparece um tile à frente da escada
export const MINE_ROOM_CENTERS = MINE_ROOMS.map((r) => ({ id: r.id, ...mineTileCenter(r.x + r.w / 2 - 0.5, r.z + r.h / 2 - 0.5) }));
/** monstros de todas as dungeons */
export const DUNGEON_SPAWNS = DUNGEONS.flatMap((d) => d.marks.filter(([k]) => k.length > 1).map(([type, tx, tz]) => ({ type, dungeon: d.id, ...tileCenter(d, tx, tz) })));
export const MINE_SPAWNS = DUNGEON_SPAWNS.filter((s) => s.dungeon === 'mine');
const towerFloor = (f) => DUNGEON_BY_ID[`tower${f}`];
/** sala do chefe de cada dungeon (para a ★ da missão) */
export const BOSS_ROOMS = { goblin_boss: { ...MINE_ROOM_CENTERS.find((r) => r.id === 'chefe'), dungeon: 'mine' }, necromancer: { ...tileCenter(towerFloor(4), 10, 9), dungeon: 'tower4' } };

// ---------- Portas, escadas e saídas (ação { a:'door', id }) ----------
const outside = (p, d = 3) => towardVillage(p, d);
export const DOORS = [
  { id: 'mine_in', at: MINE_DOOR, r: 4.2, to: MINE_ENTRY, label: '⛏️ Entrar na Mina Abandonada (perigo!)', log: '⛏️ Você entrou na Mina Abandonada. Cuidado com o escuro...' },
  { id: 'mine_out', at: MINE_EXIT, r: 4.2, to: outside(MINE_DOOR), label: '🪜 Subir a escada (sair da mina)' },
  { id: 'home_in', at: HOME_DOOR, r: 2.9, to: HOME_ENTRY, label: '🏠 Entrar na sua casa', log: '🏠 Bem-vindo à sua casa.' },
  { id: 'home_out', at: HOME_EXIT, r: 2.7, to: HOME_DOOR, label: '🚪 Sair de casa' },
  { id: 'tower_in', at: TOWER_DOOR, r: 4, to: { ...markAt(towerFloor(1), 'D'), z: markAt(towerFloor(1), 'D').z - 4 }, label: '🗼 Entrar na Torre do Necromante (perigo!)', log: '🗼 Torre do Necromante — 1º andar. São 4 andares até o topo.' },
  { id: 'tower_out', at: markAt(towerFloor(1), 'D'), r: 3.6, to: outside(TOWER, TOWER.r + 5), label: '🚪 Sair da torre' },
  ...[1, 2, 3].map((f) => {
    const up = markAt(towerFloor(f), 'U'), d2 = markAt(towerFloor(f + 1), 'D');
    return { id: `tower_up${f}`, at: up, r: 3.6, to: { x: d2.x, z: d2.z - 4 }, label: `🪜 Subir para o ${f + 1}º andar`, log: `🗼 ${f + 1}º andar — ${TOWER_NAMES[f + 1]}` };
  }),
  ...[2, 3, 4].map((f) => {
    const dn = markAt(towerFloor(f), 'D'), u = markAt(towerFloor(f - 1), 'U');
    return { id: `tower_down${f}`, at: dn, r: 3.6, to: { x: u.x, z: u.z + 4 }, label: `🪜 Descer para o ${f - 1}º andar`, log: `🗼 ${f - 1}º andar — ${TOWER_NAMES[f - 1]}` };
  }),
];
export const DOOR_BY_ID = Object.fromEntries(DOORS.map((d) => [d.id, d]));

// ---------- Baús de tesouro (cada jogador abre o seu; reabastecem depois de `respawn` s) ----------
const dungeonChests = (d, prefix) => d.marks.filter(([k]) => k === 'C' || k === 'T').map(([k, tx, tz], i) => ({ id: `${prefix}${i + 1}`, ...tileCenter(d, tx, tz), tier: k === 'T' ? 3 : 2 }));
export const TREASURES = [
  { id: 't_floresta', x: -50, z: -46, tier: 1 },
  { id: 't_campos', x: 47, z: 50, tier: 1 },
  { id: 't_ruinas', x: 5, z: -101, tier: 2 },
  { id: 't_deserto', x: 158, z: -30, tier: 2 },
  { id: 't_pantano', x: -132, z: 86, tier: 2 },
  { id: 't_pedreira', x: -112, z: -70, tier: 1 },
  ...dungeonChests(DUNGEONS[0], 't_mina'),
  { id: 't_deserto2', x: 238, z: -62, tier: 2 },
  { id: 't_pantano2', x: -222, z: 104, tier: 2 },
  { id: 't_planalto', x: 112, z: -232, tier: 2 },
  { id: 't_amaldicoadas', x: CURSED.x, z: CURSED.z + 10, tier: 2 },
  ...[1, 2, 3, 4].flatMap((f) => dungeonChests(towerFloor(f), `t_torre${f}_`)),
];
export const TREASURE_RESPAWN = { 1: 600, 2: 1200, 3: 2700 }; // s

// ---------- Regiões ----------
export const inMine = (x, z) => dungeonAt(x, z)?.id === 'mine';
export const inHome = (x, z) => x >= HOME.x0 - 1 && x <= HOME.x0 + HOME.w + 1 && z >= HOME.z0 - 1 && z <= HOME.z0 + HOME.d + 1;
/** 'world' | 'mine' | 'tower' | 'home' */
export const regionAt = (x, z) => { const d = dungeonAt(x, z); return d ? d.region : inHome(x, z) ? 'home' : 'world'; };

export function onPath(x, z, half = 4) {
  return PATHS.some(([ex, ez]) => {
    const len2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, (x * ex + z * ez) / len2));
    return Math.hypot(x - ex * t, z - ez * t) < half;
  });
}

const nearZone = (x, z, pad) => ZONES.some((zn) => !BIG_AREAS.includes(zn.id) && Math.hypot(x - zn.x, z - zn.z) < zn.r * (zn.id === 'forest' ? 0.55 : 1) + pad);
const inCastle = (x, z, pad = 0) => Math.abs(x - CASTLE.x) < CASTLE.half + pad && Math.abs(z - CASTLE.z) < CASTLE.half + pad;

/** Gera tudo que tem posição no mapa. Determinístico (mesma semente = mesmo mapa). */
export function buildLayout(seed = WORLD_SEED) {
  const rand = mulberry32(seed);
  const colliders = []; // {x, z, r}
  for (const h of HOUSES) colliders.push({ x: h.x, z: h.z, r: 4.3 });
  colliders.push({ x: WELL.x, z: WELL.z, r: 1.6 });
  colliders.push({ x: LAKE.x, z: LAKE.z, r: 10.5 });
  const nearTreasure = (x, z, r) => TREASURES.some((t) => Math.hypot(x - t.x, z - t.z) < r);
  const nearDoor = (x, z, r) => Math.hypot(x - MINE_DOOR.x, z - MINE_DOOR.z) < r || Math.hypot(x - TOWER.x, z - TOWER.z) < r + 6;
  const blocked = (x, z, pad) => nearZone(x, z, pad) || onPath(x, z) || inCastle(x, z, 6) || Math.hypot(x - LAKE.x, z - LAKE.z) < 13;

  // ---------- castelo: muralhas (círculos a cada 2,5 m), torres, portão, torre de menagem, fonte ----------
  const C = CASTLE, H = C.half;
  const castle = { walls: [], towers: [], keep: { x: C.x, z: C.z - 13, w: 20, d: 12 }, gateZ: C.z + H };
  const wallSeg = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(len / 2.5);
    castle.walls.push({ x1, z1, x2, z2 });
    for (let i = 0; i <= n; i++) colliders.push({ x: x1 + ((x2 - x1) * i) / n, z: z1 + ((z2 - z1) * i) / n, r: 1.5 });
  };
  wallSeg(C.x - H, C.z - H, C.x + H, C.z - H); // norte
  wallSeg(C.x - H, C.z - H, C.x - H, C.z + H); // oeste
  wallSeg(C.x + H, C.z - H, C.x + H, C.z + H); // leste
  wallSeg(C.x - H, C.z + H, C.x - C.gate - 2, C.z + H); // sul, com portão no meio
  wallSeg(C.x + C.gate + 2, C.z + H, C.x + H, C.z + H);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { castle.towers.push({ x: C.x + sx * H, z: C.z + sz * H, r: 4.5, h: 15 }); colliders.push({ x: C.x + sx * H, z: C.z + sz * H, r: 4.5 }); }
  for (const sx of [-1, 1]) { castle.towers.push({ x: C.x + sx * (C.gate + 2.5), z: C.z + H, r: 3, h: 12 }); colliders.push({ x: C.x + sx * (C.gate + 2.5), z: C.z + H, r: 3 }); }
  const K = castle.keep;
  for (let x = K.x - K.w / 2 + 2; x <= K.x + K.w / 2 - 2; x += 4) for (let z = K.z - K.d / 2 + 2; z <= K.z + K.d / 2 - 2; z += 4) colliders.push({ x, z, r: 3.2 });
  colliders.push({ x: WELLS[1].x, z: WELLS[1].z, r: 2.4 });

  // ---------- ruínas amaldiçoadas: lápides, muros quebrados, cripta, fogos-fátuos ----------
  const cursed = { graves: [], walls: [], wisps: [], crypt: { x: CURSED.x, z: CURSED.z - 2 } };
  colliders.push({ x: cursed.crypt.x, z: cursed.crypt.z, r: 4.2 });
  for (let i = 0; i < 200 && cursed.graves.length < 34; i++) {
    const a = rand() * Math.PI * 2, d = 9 + rand() * (CURSED.r - 10);
    const x = CURSED.x + Math.cos(a) * d, z = CURSED.z + Math.sin(a) * d;
    if (onPath(x, z, 3) || cursed.graves.some((g) => Math.hypot(g.x - x, g.z - z) < 3.2) || nearTreasure(x, z, 3)) continue;
    cursed.graves.push({ x, z, rot: rand() * 0.6 - 0.3, tilt: rand() * 0.3 - 0.15, cross: rand() < 0.35, h: 1.1 + rand() * 0.6 });
    colliders.push({ x, z, r: 0.55 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, d = CURSED.r - 2;
    const x = CURSED.x + Math.cos(a) * d, z = CURSED.z + Math.sin(a) * d;
    if (onPath(x, z, 5)) continue;
    cursed.walls.push({ x, z, rot: a + Math.PI / 2, len: 5 + rand() * 4, h: 1.5 + rand() * 2.5 });
    colliders.push({ x, z, r: 2 });
  }
  for (let i = 0; i < 14; i++) cursed.wisps.push({ x: CURSED.x + (rand() - 0.5) * 50, z: CURSED.z + (rand() - 0.5) * 50, ph: rand() * 6 });
  colliders.push({ x: TOWER.x, z: TOWER.z, r: TOWER.r });

  // ---------- árvores (planalto: pinheiros; pântano e terras amaldiçoadas: árvores mortas; deserto: nenhuma) ----------
  const trees = [];
  const deadTrees = [];
  let placed = 0;
  for (let i = 0; i < 9000 && placed < 640; i++) {
    const a = rand() * Math.PI * 2;
    const d = 24 + Math.sqrt(rand()) * (WORLD_RADIUS - 30);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const biome = biomeAt(x, z);
    const inForest = Math.hypot(x + 35, z + 35) < 30;
    if (!inForest && rand() < 0.45) continue;
    if (biome === 'desert' || (biome === 'quarry' && rand() < 0.85)) continue;
    if (blocked(x, z, 2) || nearTreasure(x, z, 4) || nearDoor(x, z, 14)) continue;
    const s = 0.8 + rand() * 0.7;
    if (biome === 'swamp' || biome === 'cursed') {
      deadTrees.push({ x, z, s, rot: rand() * 6, cursed: biome === 'cursed' });
      colliders.push({ x, z, r: 0.5 * s });
      placed++;
      continue;
    }
    const pine = inForest || biome === 'quarry' || biome === 'highlands' || rand() < 0.4;
    const leaf = pine ? null : [0x3fa34d, 0x56b84a, 0x2f8f3f][Math.floor(rand() * 3)];
    trees.push({ x, z, s, pine, inForest, leaf, rot: rand() * 6, snow: biome === 'highlands' && rand() < 0.5 });
    colliders.push({ x, z, r: 0.7 * s });
    placed++;
  }

  const rocks = [];
  for (let i = 0; i < 230; i++) {
    const a = rand() * Math.PI * 2, d = 25 + rand() * (WORLD_RADIUS - 28);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const biome = biomeAt(x, z);
    if (blocked(x, z, 1) || nearTreasure(x, z, 3) || nearDoor(x, z, 10)) continue;
    if (biome === 'grass' && rand() < 0.4) continue;
    const big = biome === 'quarry' || biome === 'highlands';
    const s = (big ? 1.2 : 0.6) + rand() * (big ? 2.2 : 1.4);
    const color = { desert: 0xc9a873, quarry: 0x7b7a74, cursed: 0x5d5566, highlands: 0x8a8d86 }[biome] || 0x8d8d8d;
    rocks.push({ x, z, s, rx: rand(), ry: rand(), rz: rand(), color, ore: biome === 'quarry' && rand() < 0.3 });
    colliders.push({ x, z, r: s * 0.9 });
  }

  // deserto: cactos e ossadas
  const cacti = [], bones = [];
  for (let i = 0; i < 900 && cacti.length < 85; i++) {
    const a = rand() * Math.PI * 2, d = BIOME_R + 8 + rand() * (WORLD_RADIUS - BIOME_R - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (biomeAt(x, z) !== 'desert' || onPath(x, z) || nearTreasure(x, z, 4)) continue;
    const h = 2 + rand() * 2.5;
    cacti.push({ x, z, h, arms: Math.floor(rand() * 3), rot: rand() * 6 });
    colliders.push({ x, z, r: 0.6 });
  }
  for (let i = 0; i < 600 && bones.length < 30; i++) {
    const a = rand() * Math.PI * 2, d = BIOME_R + 8 + rand() * (WORLD_RADIUS - BIOME_R - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const b = biomeAt(x, z);
    if (b === 'desert' || (b === 'cursed' && rand() < 0.5)) bones.push({ x, z, rot: rand() * 6, s: 0.8 + rand() * 0.8 });
  }

  // pântano: poças escuras e juncos (sem colisão: dá pra atravessar)
  const ponds = [], reeds = [];
  for (let i = 0; i < 600 && ponds.length < 22; i++) {
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

  for (const t of TREASURES) if (!dungeonAt(t.x, t.z)) colliders.push({ x: t.x, z: t.z, r: 0.8 });

  const mountains = [];
  const MN = 140;
  for (let i = 0; i < MN; i++) {
    const a = (i / MN) * Math.PI * 2 + rand() * 0.03;
    const d = WORLD_RADIUS + 14 + rand() * 18;
    const h = 18 + rand() * 30, rad = 12 + rand() * 10;
    const sides = 5 + Math.floor(rand() * 3);
    const b = biomeAt(Math.cos(a) * (WORLD_RADIUS - 5), Math.sin(a) * (WORLD_RADIUS - 5));
    const palette = {
      desert: [0xc8a46a, 0xb98f57, 0xd2b07a], swamp: [0x4d5a3a, 0x56603f, 0x485536], quarry: [0x7a7870, 0x87847a, 0x6d6b64],
      cursed: [0x453d52, 0x3a3346, 0x524a5e], highlands: [0x7d8578, 0x8a9184, 0x6f776b],
    }[b] || [0x6f8a5e, 0x7d8a74, 0x667a58];
    mountains.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h, rad, sides, rot: rand() * Math.PI, color: palette[i % 3], snow: b !== 'desert' && b !== 'swamp' && b !== 'cursed' });
  }
  const edgeRocks = [];
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const s = 1.4 + rand() * 1.6;
    edgeRocks.push({ x: Math.cos(a) * (WORLD_RADIUS + 2.5), z: Math.sin(a) * (WORLD_RADIUS + 2.5), s, rx: rand(), ry: rand(), rz: rand() });
  }

  // decoração das dungeons: tochas e cristais (mina) / estandartes e estantes (torre) nas paredes vizinhas ao chão
  const dungeonDeco = {};
  for (const d of DUNGEONS) {
    const torches = [], crystals = [];
    for (let tz = 1; tz < d.rows - 1; tz++) {
      for (let tx = 1; tx < d.cols - 1; tx++) {
        if (d.grid[tz][tx] !== 1) continue;
        const floorN = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => d.grid[tz + dz]?.[tx + dx] === 0);
        if (!floorN.length) continue;
        const r = rand();
        const [dx, dz] = floorN[0];
        const c = tileCenter(d, tx, tz);
        const face = { x: c.x + dx * d.tile * 0.5, z: c.z + dz * d.tile * 0.5, dx, dz };
        if (r < (d.style === 'tower' ? 0.1 : 0.07)) torches.push(face);
        else if (r < 0.16) crystals.push({ ...face, color: d.style === 'tower' ? [0x6b2fa0, 0x2f6ba0, 0x8a1f2f][Math.floor(rand() * 3)] : [0x6fe3ff, 0xb46bff, 0x7dff9a, 0xffd65c][Math.floor(rand() * 4)] });
      }
    }
    dungeonDeco[d.id] = { torches, crystals };
  }

  return {
    colliders, trees, deadTrees, rocks, cacti, bones, ponds, reeds, tents, campfire, pillars, altar,
    mountains, edgeRocks, mineHill, castle, cursed, dungeonDeco,
    mineTorches: dungeonDeco.mine.torches, mineCrystals: dungeonDeco.mine.crystals,
  };
}

/** Consultas sobre o mapa (colisão, zona segura, estrada, mato, linha de visão). `pos` pode ser qualquer objeto com x/z. */
export function createWorldQueries(layout) {
  const { colliders, trees } = layout;
  // grade espacial dos colisores (células de 16 m): o servidor resolve dezenas de monstros por tick
  const CELL = 16, buckets = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  for (const c of colliders) {
    for (let cx = Math.floor((c.x - c.r) / CELL); cx <= Math.floor((c.x + c.r) / CELL); cx++) {
      for (let cz = Math.floor((c.z - c.r) / CELL); cz <= Math.floor((c.z + c.r) / CELL); cz++) {
        const k = key(cx, cz);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
  }
  const near = (x, z) => buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];

  function resolveGrid(d, pos, radius) {
    const T = d.tile;
    const tx = Math.floor((pos.x - d.x0) / T), tz = Math.floor((pos.z - d.z0) / T);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, z = tz + dz;
        if (!gridWall(d, x, z)) continue;
        const x0 = d.x0 + x * T, z0 = d.z0 + z * T;
        const cx = Math.max(x0, Math.min(pos.x, x0 + T)), cz = Math.max(z0, Math.min(pos.z, z0 + T));
        const ddx = pos.x - cx, ddz = pos.z - cz;
        const dd = Math.hypot(ddx, ddz);
        if (dd < 1e-6) { // centro dentro da parede: empurra para o lado aberto mais próximo
          const opts = [[pos.x - x0, -1, 0], [x0 + T - pos.x, 1, 0], [pos.z - z0, 0, -1], [z0 + T - pos.z, 0, 1]].sort((a, b) => a[0] - b[0]);
          const [dist, ox, oz] = opts[0];
          pos.x += ox * (dist + radius); pos.z += oz * (dist + radius);
          continue;
        }
        if (dd < radius) { pos.x = cx + (ddx / dd) * radius; pos.z = cz + (ddz / dd) * radius; }
      }
    }
  }

  function resolve(pos, radius) {
    const d = dungeonAt(pos.x, pos.z);
    if (d) return resolveGrid(d, pos, radius);
    if (inHome(pos.x, pos.z)) {
      pos.x = Math.max(HOME.x0 + radius, Math.min(HOME.x0 + HOME.w - radius, pos.x));
      pos.z = Math.max(HOME.z0 + radius, Math.min(HOME.z0 + HOME.d - radius, pos.z));
      return;
    }
    for (const c of near(pos.x, pos.z)) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const dd = Math.sqrt(d2);
        pos.x = c.x + (dx / dd) * min;
        pos.z = c.z + (dz / dd) * min;
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > WORLD_RADIUS) { pos.x *= WORLD_RADIUS / r; pos.z *= WORLD_RADIUS / r; }
  }

  const zoneAt = (x, z) => {
    const d = dungeonAt(x, z);
    if (d) return { id: d.id, name: d.name };
    if (inHome(x, z)) return { id: 'home', name: 'Sua Casa' };
    return ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 4) || null;
  };
  const isSafe = (x, z) => inHome(x, z) || SAFE_ZONES.some((s) => Math.hypot(x - s.x, z - s.z) < s.r);
  const isRoad = (x, z) => onPath(x, z, 5.5);
  const treesNear = (x, z, r) => {
    let n = 0;
    for (const t of trees) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r) n++;
    return n;
  };
  /** "mato alto": área com árvores, fora da zona segura e da estrada (nunca em dungeon/casa) */
  const isWooded = (x, z) => regionAt(x, z) === 'world' && !isSafe(x, z) && !isRoad(x, z) && treesNear(x, z, WOODS.radius) >= WOODS.minTrees;
  const isBlocked = (x, z, r = 1) => {
    const d = dungeonAt(x, z);
    if (d) return gridWall(d, Math.floor((x - d.x0) / d.tile), Math.floor((z - d.z0) / d.tile));
    const hit = near(x, z).some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r);
    return inHome(x, z) ? hit : hit || Math.hypot(x, z) > WORLD_RADIUS - 2; // a casa fica fora do raio do mapa
  };
  /** linha de visão: nas dungeons as paredes bloqueiam; regiões/andares diferentes nunca se veem */
  const los = (x1, z1, x2, z2) => {
    const a = dungeonAt(x1, z1), b = dungeonAt(x2, z2);
    if (a !== b) return false;
    if (!a) return regionAt(x1, z1) === regionAt(x2, z2);
    const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 1.5);
    for (let i = 1; i < n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
      if (gridWall(a, Math.floor((x - a.x0) / a.tile), Math.floor((z - a.z0) / a.tile))) return false;
    }
    return true;
  };

  return { colliders, resolve, zoneAt, isSafe, isRoad, isWooded, isBlocked, los, biomeAt, regionAt, dungeonAt };
}
