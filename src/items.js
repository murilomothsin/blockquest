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
};

export const SHOP = ['potion', 'big_potion', 'wood_sword', 'iron_sword', 'steel_sword', 'rune_blade', 'short_bow', 'long_bow'];

export const CATEGORIES = [['consumable', '🧪 Consumíveis'], ['melee', '⚔️ Espadas'], ['ranged', '🏹 Arcos']];
export const category = (it) => (it.kind === 'consumable' ? 'consumable' : it.style);

export const ATTACK = {
  melee: { cooldown: 0.5, range: 3.2 },
  ranged: { cooldown: 0.75 },
};

export function itemStats(it) {
  if (it.kind === 'consumable') return it.desc;
  const s = it.style === 'ranged'
    ? `Distância · Dano +${it.bonus} · Alcance ${it.range}m`
    : `Corpo a corpo · Dano +${it.bonus}`;
  return it.desc ? `${s} · ${it.desc}` : s;
}

const DROPS = [
  ['potion', 42], ['big_potion', 20],
  ['iron_sword', 8], ['short_bow', 8],
  ['steel_sword', 6], ['long_bow', 6],
  ['rune_blade', 5], ['elven_bow', 5],
];

/** Sorteia o item que cai a cada 5 abates. Chefes sempre deixam uma arma rara. */
export function rollDrop(boss = false) {
  if (boss) return Math.random() < 0.5 ? 'rune_blade' : 'elven_bow';
  const total = DROPS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of DROPS) { if ((r -= w) <= 0) return id; }
  return 'potion';
}
