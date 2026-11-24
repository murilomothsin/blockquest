// Visual do jogo editável pelo painel admin: texturas do mundo, ícones dos itens, efeitos (partículas) e vegetação.
// Os arquivos ficam em public/packs/<categoria>/<pacote>/<arquivo>.png e são referenciados como
// "<categoria>/<pacote>/<arquivo>.png" (ex.: "textures/kenney-voxel/grass_top.png").
// O servidor guarda a configuração e manda para todos; quem não tem nada configurado vê o visual original (cores).

/** Categorias de textura do mundo. Cada objeto do mapa cai numa delas (pela cor/tipo). */
export const TEXTURE_SLOTS = [
  { id: 'chao', label: 'Chão (grama e biomas)', hint: 'No modo "detalhe" a cor de cada bioma continua (deserto amarelo, neve branca...)' },
  { id: 'caminho', label: 'Caminhos e praças', hint: 'estradas de terra e círculos das zonas' },
  { id: 'pedra', label: 'Pedra', hint: 'rochas, castelo, ruínas, montanhas, poço' },
  { id: 'madeira', label: 'Madeira', hint: 'troncos, vigas, portas, cercas, móveis' },
  { id: 'folhas', label: 'Folhas e plantas', hint: 'copas das árvores, pinheiros, cactos, arbustos' },
  { id: 'parede', label: 'Paredes claras', hint: 'reboco das casas, tendas claras' },
  { id: 'telhado', label: 'Telhados e tecidos', hint: 'telhados vermelhos/laranja, estandartes, tapetes' },
  { id: 'areia', label: 'Areia e ossos' },
  { id: 'neve', label: 'Neve' },
  { id: 'agua', label: 'Água', hint: 'lago e poças do pântano' },
  { id: 'parede_dungeon', label: 'Paredes das dungeons', hint: 'mina e torre' },
  { id: 'piso_dungeon', label: 'Piso das dungeons' },
  { id: 'outros', label: 'Outros', hint: 'metais, janelas e cores fortes (normalmente sem textura)' },
];
export const SLOT_IDS = TEXTURE_SLOTS.map((s) => s.id);

/** Efeitos de partícula (sprites) */
export const EFFECTS = [
  { id: 'golpe', label: 'Golpe acertando o monstro' },
  { id: 'critico', label: 'Golpe crítico' },
  { id: 'magia', label: 'Explosão de magia (cajado)' },
  { id: 'morte', label: 'Monstro derrotado' },
  { id: 'cura', label: 'Cura (poção, poço)' },
  { id: 'nivel', label: 'Subiu de nível' },
];
export const EFFECT_IDS = EFFECTS.map((e) => e.id);

export const PACK_CATEGORIES = { textures: 'Texturas', icons: 'Ícones', particles: 'Partículas', foliage: 'Vegetação' };
export const PACK_PATH_RE = /^(textures|icons|particles|foliage)\/[a-z0-9_-]{1,40}\/[A-Za-z0-9_.()-]{1,80}\.png$/;
export const PACK_ID_RE = /^[a-z0-9_-]{1,40}$/;

const slotDefault = () => ({ tex: null, modo: 'detalhe', escala: 2, forca: 1 });
const effectDefault = (id) => ({ ativo: false, tex: null, cor: { cura: '#7dff9a', nivel: '#ffd65c', magia: '#9fd8ff', critico: '#ffb347', morte: '#cfcfcf' }[id] || '#ffffff', tamanho: 1, qtd: 6 });

export const DEFAULT_ASSETS = {
  filtro: 'pixel', // 'pixel' (nítido, bom para pixel art) | 'suave'
  texturas: Object.fromEntries(SLOT_IDS.map((id) => [id, slotDefault()])),
  icones: { pack: null, map: {} }, // map: itemId → caminho do ícone
  efeitos: Object.fromEntries(EFFECT_IDS.map((id) => [id, effectDefault(id)])),
  vegetacao: { ativo: false, densidade: 1, tamanho: 1, sprites: [] }, // sprites brancos, pintados com a cor do bioma
};

const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d);
const path = (p, cat) => (typeof p === 'string' && PACK_PATH_RE.test(p) && (!cat || p.startsWith(`${cat}/`)) ? p : null);
const color = (c, d) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : d);

/** aceita só campos conhecidos e caminhos válidos (o servidor sempre passa a config por aqui) */
export function sanitizeAssets(a) {
  const out = structuredClone(DEFAULT_ASSETS);
  if (!a || typeof a !== 'object') return out;
  out.filtro = a.filtro === 'suave' ? 'suave' : 'pixel';
  for (const id of SLOT_IDS) {
    const s = a.texturas?.[id];
    if (!s || typeof s !== 'object') continue;
    out.texturas[id] = {
      tex: path(s.tex, 'textures'),
      modo: s.modo === 'original' ? 'original' : 'detalhe',
      escala: clamp(s.escala, 0.25, 16, 2),
      forca: clamp(s.forca, 0, 2, 1),
    };
  }
  if (a.icones && typeof a.icones === 'object') {
    out.icones.pack = typeof a.icones.pack === 'string' && PACK_ID_RE.test(a.icones.pack) ? a.icones.pack : null;
    if (a.icones.map && typeof a.icones.map === 'object') {
      for (const [k, v] of Object.entries(a.icones.map).slice(0, 200)) if (/^[a-z0-9_]{1,40}$/.test(k) && path(v, 'icons')) out.icones.map[k] = v;
    }
  }
  for (const id of EFFECT_IDS) {
    const e = a.efeitos?.[id];
    if (!e || typeof e !== 'object') continue;
    out.efeitos[id] = {
      ativo: !!e.ativo, tex: path(e.tex, 'particles'), cor: color(e.cor, out.efeitos[id].cor),
      tamanho: clamp(e.tamanho, 0.2, 5, 1), qtd: Math.round(clamp(e.qtd, 1, 30, 6)),
    };
  }
  const v = a.vegetacao;
  if (v && typeof v === 'object') {
    out.vegetacao = {
      ativo: !!v.ativo, densidade: clamp(v.densidade, 0.1, 4, 1), tamanho: clamp(v.tamanho, 0.3, 3, 1),
      sprites: Array.isArray(v.sprites) ? [...new Set(v.sprites.map((p) => path(p, 'foliage')).filter(Boolean))].slice(0, 12) : [],
    };
  }
  return out;
}

// ---------- Predefinições (o admin aplica com um clique e depois ajusta) ----------
const T = (pack, files, escala = 2) => {
  const t = {};
  for (const [slot, f] of Object.entries(files)) {
    const [file, modo = 'detalhe', esc = escala] = Array.isArray(f) ? f : [f];
    t[slot] = { tex: file.includes('/') ? `textures/${file}.png` : `textures/${pack}/${file}.png`, modo, escala: esc, forca: 1 };
  }
  return t;
};
const KP = (f) => `particles/kenney/${f}.png`;
const FX_KENNEY = {
  golpe: { ativo: true, tex: KP('star_07'), cor: '#ffffff', tamanho: 1, qtd: 5 },
  critico: { ativo: true, tex: KP('star_09'), cor: '#ffb347', tamanho: 1.5, qtd: 8 },
  magia: { ativo: true, tex: KP('magic_04'), cor: '#9fd8ff', tamanho: 1.4, qtd: 10 },
  morte: { ativo: true, tex: KP('smoke_05'), cor: '#bfbfbf', tamanho: 1.6, qtd: 8 },
  cura: { ativo: true, tex: KP('symbol_01'), cor: '#7dff9a', tamanho: 0.8, qtd: 8 },
  nivel: { ativo: true, tex: KP('star_08'), cor: '#ffd65c', tamanho: 1.6, qtd: 14 },
};
const FOLIAGE = (pack, nums) => nums.map((n) => `foliage/${pack}/sprite_${String(n).padStart(4, '0')}.png`);

export const PRESETS = [
  { id: 'original', label: 'Original (só cores)', assets: DEFAULT_ASSETS },
  {
    id: 'blocos16', label: 'Blocos 16×16 (estilo Minecraft)',
    assets: {
      filtro: 'pixel',
      texturas: T('blocos-16', {
        chao: ['grass_top', 'detalhe', 2], caminho: 'dirt', pedra: 'cobblestone', madeira: 'oak_log_side', folhas: 'oak_leaves',
        parede: 'limestone_bricks', telhado: 'slate_tiles', areia: 'sand_ugly', neve: 'snow', agua: ['kenney-voxel/water', 'original', 4],
        parede_dungeon: ['stone_generic', 'detalhe', 1], piso_dungeon: 'cobblestone_mossy',
      }, 1),
      icones: { pack: 'rpg-496', map: {} }, efeitos: FX_KENNEY,
      vegetacao: { ativo: true, densidade: 1, tamanho: 1, sprites: FOLIAGE('kenney-plano', [1, 2, 3, 4, 11, 12, 15, 18]) },
    },
  },
  {
    id: 'kenney', label: 'Kenney (traço limpo)',
    assets: {
      filtro: 'suave',
      texturas: T('kenney-voxel', {
        chao: 'grass_top', caminho: 'dirt', pedra: 'greystone', madeira: 'trunk_side', folhas: 'leaves', parede: 'brick_grey',
        telhado: 'brick_red', areia: 'sand', neve: 'snow', agua: ['water', 'original', 4], parede_dungeon: 'stone', piso_dungeon: 'gravel_stone',
      }),
      icones: { pack: 'rpg-496', map: {} }, efeitos: FX_KENNEY,
      vegetacao: { ativo: true, densidade: 1, tamanho: 1, sprites: FOLIAGE('kenney-sombreado', [1, 2, 3, 4, 11, 12, 15, 18]) },
    },
  },
  {
    id: 'natureza32', label: 'Natureza 32×32 (pixel art)',
    assets: {
      filtro: 'pixel',
      texturas: T('natureza-32', {
        chao: 'grass', caminho: 'path', pedra: 'cobblestone', madeira: 'treetrunk', folhas: 'treeleaves', areia: 'sand', neve: 'snow',
        parede_dungeon: 'stone', piso_dungeon: 'cobblestone', telhado: 'blocos-16/slate_tiles', parede: 'blocos-16/limestone_bricks',
      }),
      icones: { pack: 'rpg-496', map: {} }, efeitos: FX_KENNEY,
      vegetacao: { ativo: true, densidade: 1.5, tamanho: 1, sprites: FOLIAGE('kenney-plano', [1, 2, 3, 5, 13, 16, 24]) },
    },
  },
];

/** ícone padrão de cada item no pacote rpg-496 (o admin pode trocar um por um) */
export const ICON_DEFAULTS = {
  'rpg-496': {
    potion: 'P_Red02', big_potion: 'P_Red07',
    scroll_return: 'I_Scroll', scroll_shield: 'S_Buff10', scroll_haste: 'S_Wind01', scroll_fury: 'S_Fire03',
    wood_sword: 'W_Sword001', iron_sword: 'W_Sword008', steel_sword: 'W_Sword017', rune_blade: 'W_Sword019',
    iron_dagger: 'W_Dagger004', steel_dagger: 'W_Dagger017', shadow_dagger: 'W_Dagger019',
    short_bow: 'W_Bow03', long_bow: 'W_Bow06', elven_bow: 'W_Bow15',
    apprentice_staff: 'W_Staff04', crystal_staff: 'W_Staff06', rune_staff: 'W_Staff02', ancient_staff: 'W_Staff03',
    leather_armor: 'A_Armour01', iron_armor: 'A_Armour02', steel_armor: 'A_Armor04', rune_armor: 'A_Armor05', elven_armor: 'A_Armour03',
    leather_helmet: 'C_Elm01', iron_helmet: 'C_Elm03', steel_helmet: 'C_Elm04', rune_helmet: 'C_Hat01', elven_helmet: 'C_Hat02',
    gold: 'I_GoldCoin',
  },
};

/** caminho do ícone de um item (mapa do admin → padrão do pacote → null = emoji) */
export function iconPath(assets, id) {
  const ic = assets?.icones;
  if (!ic) return null;
  if (ic.map?.[id]) return ic.map[id];
  const d = ic.pack && ICON_DEFAULTS[ic.pack]?.[id];
  return d ? `icons/${ic.pack}/${d}.png` : null;
}
