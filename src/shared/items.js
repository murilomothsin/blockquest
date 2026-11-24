export const ITEMS = {
  potion: { name: 'Poção de Vida', icon: '🧪', kind: 'consumable', heal: 0.5, price: 15, sell: 6, desc: 'Recupera 50% da vida.' },
  big_potion: { name: 'Poção Grande', icon: '⚗️', kind: 'consumable', heal: 1, price: 40, sell: 15, desc: 'Recupera 100% da vida.' },

  // Pergaminhos mágicos: uso único. tp = teleporte; buff = efeito por tempo (ver BUFFS em classes.js)
  scroll_return: { name: 'Pergaminho de Retorno', icon: '📜', kind: 'consumable', sub: 'scroll', tp: 'village', color: 0xe8d9a8, price: 45, sell: 15, desc: 'Uso único: teleporta você para o centro da vila (sai de qualquer dungeon).' },
  scroll_shield: { name: 'Pergaminho de Proteção', icon: '🔰', kind: 'consumable', sub: 'scroll', buff: 'shield', color: 0x6fb3ff, price: 60, sell: 20, desc: 'Uso único: +15 de defesa por 60 s.' },
  scroll_haste: { name: 'Pergaminho de Pressa', icon: '💨', kind: 'consumable', sub: 'scroll', buff: 'haste', color: 0x9fe870, price: 50, sell: 18, desc: 'Uso único: +30% de velocidade por 45 s.' },
  scroll_fury: { name: 'Pergaminho de Fúria', icon: '🔥', kind: 'consumable', sub: 'scroll', buff: 'fury', color: 0xff7a3a, price: 80, sell: 28, desc: 'Uso único: +25% de dano por 30 s.' },

  wood_sword: { name: 'Espada de Madeira', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 0, color: 0xa0703a, price: 10, sell: 2 },
  iron_sword: { name: 'Espada de Ferro', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 8, color: 0xcfd6de, price: 120, sell: 50 },
  steel_sword: { name: 'Espada de Aço', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 18, color: 0x8fb3d9, price: 260, sell: 110 },
  rune_blade: { name: 'Lâmina Rúnica', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 32, color: 0x9b6bff, price: 480, sell: 200 },

  // Adagas: corpo a corpo, menos dano por golpe mas golpes bem mais rápidos (cdMul). Combinam com o Ladino.
  iron_dagger: { name: 'Adaga de Ferro', icon: '🔪', kind: 'weapon', style: 'melee', sub: 'dagger', bonus: 3, cdMul: 0.75, color: 0xcfd6de, price: 110, sell: 45 },
  steel_dagger: { name: 'Adaga de Aço', icon: '🔪', kind: 'weapon', style: 'melee', sub: 'dagger', bonus: 10, cdMul: 0.75, color: 0x8fb3d9, price: 250, sell: 100 },
  shadow_dagger: { name: 'Adaga Sombria', icon: '🔪', kind: 'weapon', style: 'melee', sub: 'dagger', bonus: 20, cdMul: 0.75, color: 0x3d2a5c, price: null, sell: 210, desc: 'Só cai de monstros.' },

  short_bow: { name: 'Arco Curto', icon: '🏹', kind: 'weapon', style: 'ranged', bonus: 8, range: 22, color: 0x9a6a3a, price: 140, sell: 55 },
  long_bow: { name: 'Arco Longo', icon: '🏹', kind: 'weapon', style: 'ranged', bonus: 18, range: 28, color: 0x5a3a1a, price: 300, sell: 120 },
  elven_bow: { name: 'Arco Élfico', icon: '🏹', kind: 'weapon', style: 'ranged', bonus: 32, range: 32, color: 0x5fd6a0, price: null, sell: 220, desc: 'Só cai de monstros.' },

  // Cajados: magia à distância que explode em área (splash). Combinam com o Arcanista.
  apprentice_staff: { name: 'Cajado de Aprendiz', icon: '🪄', kind: 'weapon', style: 'magic', bonus: 5, range: 20, color: 0x7fd0ff, price: 130, sell: 50 },
  crystal_staff: { name: 'Cajado de Cristal', icon: '🪄', kind: 'weapon', style: 'magic', bonus: 15, range: 24, color: 0x6fe3d8, price: 290, sell: 115 },
  rune_staff: { name: 'Cajado Rúnico', icon: '🪄', kind: 'weapon', style: 'magic', bonus: 28, range: 26, color: 0x9b6bff, price: 520, sell: 210 },
  ancient_staff: { name: 'Cajado Ancestral', icon: '🪄', kind: 'weapon', style: 'magic', bonus: 32, range: 28, color: 0xffb347, price: null, sell: 230, desc: 'Só cai de monstros.' },

  // Armaduras: mesmas cores/tiers das armas (couro ≈ madeira, ferro, aço, rúnica, élfica)
  leather_armor: { name: 'Armadura de Couro', icon: '🦺', kind: 'armor', def: 3, color: 0x9a6a3a, price: 60, sell: 20 },
  iron_armor: { name: 'Armadura de Ferro', icon: '🛡️', kind: 'armor', def: 7, color: 0xcfd6de, price: 160, sell: 65 },
  steel_armor: { name: 'Armadura de Aço', icon: '🛡️', kind: 'armor', def: 12, color: 0x8fb3d9, price: 320, sell: 130 },
  rune_armor: { name: 'Armadura Rúnica', icon: '🛡️', kind: 'armor', def: 18, color: 0x9b6bff, price: 560, sell: 230 },
  elven_armor: { name: 'Armadura Élfica', icon: '🛡️', kind: 'armor', def: 18, color: 0x5fd6a0, price: null, sell: 240, desc: 'Só cai de monstros.' },

  leather_helmet: { name: 'Capuz de Couro', icon: '⛑️', kind: 'helmet', def: 1, color: 0x9a6a3a, price: 35, sell: 12 },
  iron_helmet: { name: 'Elmo de Ferro', icon: '⛑️', kind: 'helmet', def: 3, color: 0xcfd6de, price: 100, sell: 40 },
  steel_helmet: { name: 'Elmo de Aço', icon: '⛑️', kind: 'helmet', def: 6, color: 0x8fb3d9, price: 200, sell: 80 },
  rune_helmet: { name: 'Elmo Rúnico', icon: '⛑️', kind: 'helmet', def: 9, color: 0x9b6bff, price: 360, sell: 150 },
  elven_helmet: { name: 'Elmo Élfico', icon: '⛑️', kind: 'helmet', def: 9, color: 0x5fd6a0, price: null, sell: 160, desc: 'Só cai de monstros.' },
};

/**
 * Lojas: cada vendedor tem o seu catálogo.
 *  basic  = Mercadora Lia (vila): o básico do começo do jogo (até ~nível 4)
 *  smith  = Ferreiro Duarte (castelo): armas e armaduras de todos os níveis
 *  arcane = magos / mercadores arcanos: pergaminhos e cajados (itens mágicos)
 */
export const SHOP_LISTS = {
  basic: ['potion', 'big_potion', 'wood_sword', 'iron_sword', 'iron_dagger', 'short_bow', 'leather_armor', 'leather_helmet'],
  smith: [
    'potion', 'big_potion',
    'wood_sword', 'iron_sword', 'steel_sword', 'rune_blade',
    'iron_dagger', 'steel_dagger',
    'short_bow', 'long_bow',
    'leather_armor', 'iron_armor', 'steel_armor', 'rune_armor',
    'leather_helmet', 'iron_helmet', 'steel_helmet', 'rune_helmet',
  ],
  arcane: ['scroll_return', 'scroll_shield', 'scroll_haste', 'scroll_fury', 'apprentice_staff', 'crystal_staff', 'rune_staff', 'potion', 'big_potion'],
};
/** tudo o que é vendido em alguma loja */
export const SHOP = [...new Set(Object.values(SHOP_LISTS).flat())];

/** Espaços de equipamento: tipo do item → campo no jogador */
export const SLOTS = { weapon: 'equipped', armor: 'armor', helmet: 'helmet' };

export const CATEGORIES = [
  ['consumable', '🧪 Poções'], ['scroll', '📜 Pergaminhos'], ['melee', '⚔️ Espadas'], ['dagger', '🔪 Adagas'], ['ranged', '🏹 Arcos'],
  ['magic', '🪄 Cajados'], ['armor', '🛡️ Armaduras'], ['helmet', '⛑️ Capacetes'],
];
export const category = (it) => (it.sub === 'scroll' ? 'scroll' : it.kind === 'weapon' ? (it.sub || it.style) : it.kind);

/** Tempo entre golpes por estilo (adagas multiplicam por cdMul). range = alcance do corpo a corpo. */
export const ATTACK = {
  melee: { cooldown: 0.5, range: 3.2 },
  ranged: { cooldown: 0.75 },
  magic: { cooldown: 0.8 },
};
/** Explosão básica de todo cajado: raio e % do dano nos monstros em volta do alvo */
export const MAGIC_SPLASH = { r: 1.8, pct: 0.5 };

/** Defesa vira % de redução de dano com retorno decrescente: def/(def+25). Conjunto rúnico (27) ≈ 52%. */
export const damageReduction = (def) => def / (def + 25);

export function itemStats(it) {
  if (it.kind === 'consumable') return it.desc;
  let s;
  if (it.kind === 'armor' || it.kind === 'helmet') s = `Defesa +${it.def}`;
  else if (it.style === 'ranged') s = `Distância · Dano +${it.bonus} · Alcance ${it.range}m`;
  else if (it.style === 'magic') s = `Magia em área · Dano +${it.bonus} · Alcance ${it.range}m`;
  else if (it.sub === 'dagger') s = `Corpo a corpo rápido · Dano +${it.bonus} · ${Math.round(1 / it.cdMul * 100 - 100)}% mais golpes`;
  else s = `Corpo a corpo · Dano +${it.bonus}`;
  return it.desc ? `${s} · ${it.desc}` : s;
}

const DROPS = [
  ['potion', 38], ['big_potion', 18], ['scroll_return', 9], ['scroll_shield', 4], ['scroll_haste', 4], ['scroll_fury', 3],
  ['iron_sword', 5], ['short_bow', 5], ['iron_dagger', 4], ['apprentice_staff', 4], ['leather_armor', 6], ['leather_helmet', 6],
  ['steel_sword', 3], ['long_bow', 3], ['steel_dagger', 2.5], ['crystal_staff', 2.5], ['iron_armor', 4], ['iron_helmet', 4],
  ['steel_armor', 2.5], ['steel_helmet', 2.5],
  ['rune_blade', 1.5], ['elven_bow', 1.5], ['shadow_dagger', 1.5], ['ancient_staff', 1.5], ['elven_armor', 1.5], ['elven_helmet', 1.5],
];

/** monstro que você já matou e renasceu (farm): menos chance e só coisa básica */
export const FARM = { window: 30 * 60e3, dropChance: 0.35, bossDropChance: 0.3 };
const BASIC_DROPS = [['potion', 60], ['big_potion', 10], ['leather_armor', 8], ['leather_helmet', 8], ['wood_sword', 6], ['iron_dagger', 4], ['iron_sword', 4]];

const BOSS_DROPS = ['rune_blade', 'elven_bow', 'shadow_dagger', 'ancient_staff', 'rune_armor', 'elven_armor', 'rune_helmet', 'elven_helmet'];

const pickWeighted = (list, rand) => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [id, w] of list) { if ((r -= w) <= 0) return id; }
  return list[0][0];
};

/** Sorteia o item que cai a cada 5 abates. Chefes sempre deixam um equipamento raro. */
export function rollDrop(boss = false, rand = Math.random, basic = false) {
  if (basic) return pickWeighted(BASIC_DROPS, rand);
  if (boss) return BOSS_DROPS[Math.floor(rand() * BOSS_DROPS.length)];
  return pickWeighted(DROPS, rand);
}

/**
 * Baús de tesouro: moedas + vários itens. tier 1 (superfície), 2 (biomas/mina), 3 (sala do chefe).
 * Tiers maiores tiram as poções comuns da lista e pesam mais os itens raros.
 */
export const TREASURE_LOOT = {
  1: { gold: [15, 40], items: [1, 2], rareBoost: 1 },
  2: { gold: [45, 100], items: [2, 3], rareBoost: 2.5 },
  3: { gold: [150, 280], items: [3, 4], rareBoost: 5, guaranteedRare: true },
};
export function rollTreasure(tier, rand = Math.random) {
  const t = TREASURE_LOOT[tier] || TREASURE_LOOT[1];
  const gold = t.gold[0] + Math.floor(rand() * (t.gold[1] - t.gold[0] + 1));
  const table = DROPS.map(([id, w]) => [id, ITEMS[id].kind === 'consumable' ? w : w * t.rareBoost]);
  const n = t.items[0] + Math.floor(rand() * (t.items[1] - t.items[0] + 1));
  const items = [];
  for (let i = 0; i < n; i++) items.push(pickWeighted(table, rand));
  if (t.guaranteedRare) items.push(rollDrop(true, rand));
  return { gold, items };
}
