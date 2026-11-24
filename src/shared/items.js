export const ITEMS = {
  potion: { name: 'Poção de Vida', icon: '🧪', kind: 'consumable', heal: 0.5, price: 15, sell: 6, desc: 'Recupera 50% da vida.' },
  big_potion: { name: 'Poção Grande', icon: '⚗️', kind: 'consumable', heal: 1, price: 40, sell: 15, desc: 'Recupera 100% da vida.' },

  wood_sword: { name: 'Espada de Madeira', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 0, color: 0xa0703a, price: 10, sell: 2 },
  iron_sword: { name: 'Espada de Ferro', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 8, color: 0xcfd6de, price: 120, sell: 50 },
  steel_sword: { name: 'Espada de Aço', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 18, color: 0x8fb3d9, price: 260, sell: 110 },
  rune_blade: { name: 'Lâmina Rúnica', icon: '🗡️', kind: 'weapon', style: 'melee', bonus: 32, color: 0x9b6bff, price: 480, sell: 200 },

  short_bow: { name: 'Arco Curto', icon: '🏹', kind: 'weapon', style: 'ranged', bonus: 8, range: 22, color: 0x9a6a3a, price: 140, sell: 55 },
  long_bow: { name: 'Arco Longo', icon: '🏹', kind: 'weapon', style: 'ranged', bonus: 18, range: 28, color: 0x5a3a1a, price: 300, sell: 120 },
  elven_bow: { name: 'Arco Élfico', icon: '🏹', kind: 'weapon', style: 'ranged', bonus: 32, range: 32, color: 0x5fd6a0, price: null, sell: 220, desc: 'Só cai de monstros.' },

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

export const SHOP = [
  'potion', 'big_potion',
  'wood_sword', 'iron_sword', 'steel_sword', 'rune_blade',
  'short_bow', 'long_bow',
  'leather_armor', 'iron_armor', 'steel_armor', 'rune_armor',
  'leather_helmet', 'iron_helmet', 'steel_helmet', 'rune_helmet',
];

/** Espaços de equipamento: tipo do item → campo no jogador */
export const SLOTS = { weapon: 'equipped', armor: 'armor', helmet: 'helmet' };

export const CATEGORIES = [
  ['consumable', '🧪 Consumíveis'], ['melee', '⚔️ Espadas'], ['ranged', '🏹 Arcos'],
  ['armor', '🛡️ Armaduras'], ['helmet', '⛑️ Capacetes'],
];
export const category = (it) => (it.kind === 'weapon' ? it.style : it.kind);

export const ATTACK = {
  melee: { cooldown: 0.5, range: 3.2 },
  ranged: { cooldown: 0.75 },
};

/** Defesa vira % de redução de dano com retorno decrescente: def/(def+25). Conjunto rúnico (27) ≈ 52%. */
export const damageReduction = (def) => def / (def + 25);

export function itemStats(it) {
  if (it.kind === 'consumable') return it.desc;
  let s;
  if (it.kind === 'armor' || it.kind === 'helmet') s = `Defesa +${it.def}`;
  else if (it.style === 'ranged') s = `Distância · Dano +${it.bonus} · Alcance ${it.range}m`;
  else s = `Corpo a corpo · Dano +${it.bonus}`;
  return it.desc ? `${s} · ${it.desc}` : s;
}

const DROPS = [
  ['potion', 38], ['big_potion', 18],
  ['iron_sword', 6], ['short_bow', 6], ['leather_armor', 6], ['leather_helmet', 6],
  ['steel_sword', 4], ['long_bow', 4], ['iron_armor', 4], ['iron_helmet', 4],
  ['steel_armor', 2.5], ['steel_helmet', 2.5],
  ['rune_blade', 2], ['elven_bow', 2], ['elven_armor', 1.5], ['elven_helmet', 1.5],
];

const BOSS_DROPS = ['rune_blade', 'elven_bow', 'rune_armor', 'elven_armor', 'rune_helmet', 'elven_helmet'];

/** Sorteia o item que cai a cada 5 abates. Chefes sempre deixam um equipamento raro. */
export function rollDrop(boss = false) {
  if (boss) return BOSS_DROPS[Math.floor(Math.random() * BOSS_DROPS.length)];
  const total = DROPS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of DROPS) { if ((r -= w) <= 0) return id; }
  return 'potion';
}
