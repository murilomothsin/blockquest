// Regras de progresso do personagem em dados puros (sem three.js / DOM):
// XP e nível, ouro, inventário, loja, equipamento, poções, missões, baús, dano e morte.
// Offline roda no navegador; online roda SÓ no servidor (o cliente manda pedidos e recebe o resultado).
//
// Cada função recebe o personagem `c` e uma lista `fx` onde empurra efeitos para a interface:
//   {k:'log', text, cls} {k:'sfx', name, at?} {k:'float', text, color, size, at?} {k:'levelUp', level}
//   {k:'loot', lid, item, x, z} {k:'lootGone', lid} {k:'hurt', dmg} {k:'death', by, lost}
//   {k:'respawn', pos} {k:'heal', n, color} {k:'pickup', item} {k:'equip', item} {k:'closeDialog'}
import { ITEMS, SLOTS, rollDrop, damageReduction } from './items.js';
import { QUESTS } from './quests.js';
import { TYPES } from './mobs.js';
import { NPCS, WELL, INTERACT_RANGE, SPAWN_POINT } from './worldData.js';

export const HP_BASE = 100;
export const HP_PER_LEVEL = 15;
export const DROP_EVERY = 5; // a cada 5 abates cai um baú
export const DEATH_GOLD_LOSS = 0.1;
export const LOOT_TTL = 300; // s até o baú sumir
export const LOOT_REACH = 3.5; // distância máxima para pegar (servidor; o cliente encosta a 1.8 m)
export const MAX_LEVEL = 99;

export const xpToNext = (l) => Math.floor(50 * Math.pow(l, 1.5));
export const maxHpFor = (level) => HP_BASE + (level - 1) * HP_PER_LEVEL;
export const weaponOf = (c) => ITEMS[c.equipped] || ITEMS.wood_sword;
export const defenseOf = (c) => (ITEMS[c.armor]?.def || 0) + (ITEMS[c.helmet]?.def || 0);
export const isEquipped = (c, id) => id === c.equipped || id === c.armor || id === c.helmet;

export function rollDamage(c, rand = Math.random) {
  const base = 10 + c.level * 3 + weaponOf(c).bonus;
  const crit = rand() < 0.15;
  return { dmg: Math.round(base * (0.85 + rand() * 0.3) * (crit ? 2 : 1)), crit };
}

export function newCharacter() {
  return {
    level: 1, xp: 0, gold: 10, maxHp: HP_BASE, hp: HP_BASE, kills: 0,
    inv: { potion: 3, wood_sword: 1 }, equipped: 'wood_sword', armor: null, helmet: null,
    quest: { idx: 0, status: 'available', progress: 0 }, pos: [...SPAWN_POINT],
  };
}

const int = (v, min, max, def) => (Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def);
const num = (v, min, max, def) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def);

/** Aceita só campos conhecidos e itens que existem; vida máxima sempre vem do nível. */
export function normalizeCharacter(d) {
  const base = newCharacter();
  if (!d || typeof d !== 'object') return base;
  const inv = {};
  if (d.inv && typeof d.inv === 'object') {
    for (const [k, v] of Object.entries(d.inv).slice(0, 80)) if (ITEMS[k]) { const n = int(v, 0, 9999, 0); if (n > 0) inv[k] = n; }
  }
  const level = int(d.level, 1, MAX_LEVEL, 1);
  const maxHp = maxHpFor(level);
  const q = d.quest && typeof d.quest === 'object' ? d.quest : base.quest;
  const quest = {
    idx: int(q.idx, 0, QUESTS.length, 0),
    status: ['available', 'active', 'complete', 'done'].includes(q.status) ? q.status : 'available',
    progress: int(q.progress, 0, 1000, 0),
  };
  if (quest.idx >= QUESTS.length) quest.status = 'done';
  const c = {
    level, xp: int(d.xp, 0, 1e9, 0), gold: int(d.gold, 0, 1e9, 0), maxHp,
    hp: int(d.hp, 0, maxHp, maxHp), kills: int(d.kills, 0, 1e9, 0), inv,
    equipped: ITEMS[d.equipped]?.kind === 'weapon' && inv[d.equipped] ? d.equipped : 'wood_sword',
    armor: ITEMS[d.armor]?.kind === 'armor' && inv[d.armor] ? d.armor : null,
    helmet: ITEMS[d.helmet]?.kind === 'helmet' && inv[d.helmet] ? d.helmet : null,
    quest,
    pos: Array.isArray(d.pos) ? [num(d.pos[0], -200, 200, 0), 0, num(d.pos[2], -200, 200, 8)] : [...SPAWN_POINT],
  };
  if (c.equipped === 'wood_sword' && !inv.wood_sword) inv.wood_sword = 1; // nunca fica sem arma
  if (c.hp <= 0) c.hp = maxHp; // salvo morto: volta vivo
  return c;
}

/** Só o que vai para o cliente / banco (sem campos de runtime) */
export function publicCharacter(c) {
  const { level, xp, gold, maxHp, hp, kills, inv, equipped, armor, helmet, quest, pos } = c;
  return { level, xp, gold, maxHp, hp: Math.ceil(hp), kills, inv: { ...inv }, equipped, armor, helmet, quest: { ...quest }, pos: [...pos] };
}

const addItem = (c, id, n = 1) => { c.inv[id] = (c.inv[id] || 0) + n; };
const removeItem = (c, id, n = 1) => { c.inv[id] = (c.inv[id] || 0) - n; if (c.inv[id] <= 0) delete c.inv[id]; };
const near = (pos, x, z, r) => pos && Math.hypot(pos.x - x, pos.z - z) <= r;

// ---------- XP / nível ----------
export function gainXp(c, n, fx) {
  c.xp += n;
  fx.push({ k: 'float', text: `+${n} XP`, color: '#6fd0ff', size: 16, h: 3.3 });
  while (c.xp >= xpToNext(c.level) && c.level < MAX_LEVEL) {
    c.xp -= xpToNext(c.level);
    c.level++;
    c.maxHp = maxHpFor(c.level);
    c.hp += HP_PER_LEVEL; // não cura: só ganha a vida máxima nova
    fx.push({ k: 'levelUp', level: c.level });
    fx.push({ k: 'log', text: `Você subiu para o nível ${c.level}! Vida máxima: ${c.maxHp}`, cls: 'good' });
  }
}

/** Define o nível direto (comando de teste) */
export function setLevel(c, level) {
  c.level = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));
  c.xp = 0;
  c.maxHp = maxHpFor(c.level);
  c.hp = Math.min(c.hp, c.maxHp);
}

// ---------- Baús (loot) ----------
/** Baús do jogador. Ficam só na memória (somem ao sair ou depois de LOOT_TTL). */
export class LootBag {
  constructor() { this.next = 1; this.items = new Map(); }
  add(item, x, z, now, fx) {
    const lid = this.next++;
    this.items.set(lid, { lid, item, x, z, t: now });
    fx.push({ k: 'loot', lid, item, x, z });
    return lid;
  }
  expire(now, fx) {
    for (const [lid, l] of this.items) if (now - l.t > LOOT_TTL) { this.items.delete(lid); fx.push({ k: 'lootGone', lid }); }
  }
  list() { return [...this.items.values()]; }
}

// ---------- Abate ----------
/** Monstro morto com crédito para este jogador. at = {x, z} do monstro. */
export function kill(c, type, at, ctx, fx) {
  const def = TYPES[type];
  if (!def) return;
  const rand = ctx.rand || Math.random;
  const g = def.gold[0] + Math.floor(rand() * (def.gold[1] - def.gold[0] + 1));
  c.gold += g;
  c.kills++;
  fx.push({ k: 'sfx', name: 'coin', at });
  fx.push({ k: 'float', text: `+${g} 🪙`, color: '#ffd65c', size: 16, at, h: def.height + 1 });
  fx.push({ k: 'log', text: `${def.name} derrotado! +${g} ouro`, cls: 'gold' });
  if (c.kills % DROP_EVERY === 0) {
    ctx.loot.add(rollDrop(false, rand), at.x, at.z, ctx.now, fx);
    fx.push({ k: 'sfx', name: 'drop', at });
    fx.push({ k: 'log', text: '🎁 Um item caiu! Encoste no baú para pegar.', cls: 'good' });
  }
  if (def.boss) {
    ctx.loot.add(rollDrop(true, rand), at.x + 1.5, at.z, ctx.now, fx);
    fx.push({ k: 'log', text: '🎁 O chefe deixou cair um equipamento raro!', cls: 'good' });
  }
  const q = c.quest, qd = QUESTS[q.idx];
  if (q.status === 'active' && qd?.target === type) {
    q.progress++;
    if (q.progress >= qd.count) {
      q.status = 'complete';
      fx.push({ k: 'sfx', name: 'quest' });
      fx.push({ k: 'log', text: `Missão concluída! Volte ao ${NPCS.elder.name}.`, cls: 'info' });
    }
  }
  gainXp(c, def.xp, fx);
}

// ---------- Dano / morte ----------
/** Dano bruto do monstro → dano real (armadura). Retorna o dano aplicado. */
export function hurt(c, dmg, type, ctx, fx) {
  if (c.dead || ctx.god) return 0;
  const rand = ctx.rand || Math.random;
  const real = Math.max(1, Math.round(dmg * (0.85 + rand() * 0.3) * (1 - damageReduction(defenseOf(c)))));
  c.hp = Math.max(0, c.hp - real);
  fx.push({ k: 'hurt', dmg: real });
  if (c.hp <= 0) {
    c.dead = true;
    const lost = Math.floor(c.gold * DEATH_GOLD_LOSS);
    c.gold -= lost;
    fx.push({ k: 'death', by: TYPES[type]?.name || 'um monstro', lost });
  }
  return real;
}

// ---------- Ações do jogador ----------
const deny = (fx, text) => { fx.push({ k: 'sfx', name: 'deny' }); if (text) fx.push({ k: 'log', text, cls: 'bad' }); return false; };

function equip(c, id, fx) {
  const it = ITEMS[id];
  const slot = it && SLOTS[it.kind];
  if (!c.inv[id] || !slot) return deny(fx);
  c[slot] = id;
  fx.push({ k: 'equip', item: id });
  return true;
}

/**
 * Executa um pedido do jogador. ctx = { pos:{x,z}, now (s), rand, loot: LootBag }.
 * Retorna true se mudou algo.
 */
export function act(c, a, ctx, fx) {
  if (!a || typeof a.a !== 'string') return false;
  if (c.dead && a.a !== 'respawn') return false;
  const it = ITEMS[a.id];
  switch (a.a) {
    case 'buy': {
      if (!it || !it.price) return deny(fx);
      if (!near(ctx.pos, NPCS.merchant.x, NPCS.merchant.z, INTERACT_RANGE.npc)) return deny(fx, 'Vá até a Mercadora Lia para comprar.');
      if (c.gold < it.price) return deny(fx);
      c.gold -= it.price;
      addItem(c, a.id);
      fx.push({ k: 'sfx', name: 'coin' }, { k: 'log', text: `Comprou ${it.icon} ${it.name}.`, cls: 'gold' });
      if (SLOTS[it.kind]) equip(c, a.id, fx);
      return true;
    }
    case 'sell': {
      if (!it || !c.inv[a.id]) return deny(fx);
      if (!near(ctx.pos, NPCS.merchant.x, NPCS.merchant.z, INTERACT_RANGE.npc)) return deny(fx, 'Vá até a Mercadora Lia para vender.');
      if (isEquipped(c, a.id) && c.inv[a.id] <= 1) return deny(fx, 'Não dá para vender o item que você está usando.');
      removeItem(c, a.id);
      c.gold += it.sell;
      fx.push({ k: 'sfx', name: 'coin' }, { k: 'log', text: `Vendeu ${it.icon} ${it.name} por ${it.sell} ouro.`, cls: 'gold' });
      return true;
    }
    case 'equip': return equip(c, a.id, fx);
    case 'unequip': {
      if (a.slot !== 'armor' && a.slot !== 'helmet') return false;
      const was = ITEMS[c[a.slot]];
      c[a.slot] = null;
      if (was) fx.push({ k: 'log', text: `Removeu ${was.icon} ${was.name}.`, cls: 'info' });
      return true;
    }
    case 'use': {
      if (!it || it.kind !== 'consumable') return false;
      if (!c.inv[a.id]) return deny(fx, `Sem ${it.name}! Compre com a Mercadora Lia.`);
      if (c.hp >= c.maxHp) { fx.push({ k: 'sfx', name: 'deny' }, { k: 'log', text: 'Vida já está cheia.', cls: 'info' }); return false; }
      removeItem(c, a.id);
      const heal = Math.round(c.maxHp * it.heal);
      c.hp = Math.min(c.maxHp, c.hp + heal);
      fx.push({ k: 'sfx', name: 'potion' }, { k: 'heal', n: heal, color: '#7dff7d' });
      return true;
    }
    case 'well': {
      if (!near(ctx.pos, WELL.x, WELL.z, INTERACT_RANGE.well)) return deny(fx);
      if (c.hp >= c.maxHp) return deny(fx);
      const healed = Math.round(c.maxHp - c.hp);
      c.hp = c.maxHp;
      fx.push({ k: 'sfx', name: 'potion' }, { k: 'heal', n: healed, color: '#7dd8ff' },
        { k: 'log', text: '💧 Você bebeu a água do poço e recuperou toda a vida.', cls: 'good' });
      return true;
    }
    case 'quest_accept': {
      const q = c.quest, qd = QUESTS[q.idx];
      if (q.status !== 'available' || !qd) return false;
      if (!near(ctx.pos, NPCS.elder.x, NPCS.elder.z, INTERACT_RANGE.npc)) return deny(fx);
      q.status = 'active'; q.progress = 0;
      fx.push({ k: 'sfx', name: 'quest' }, { k: 'log', text: `Missão aceita: ${qd.title}`, cls: 'info' }, { k: 'closeDialog' });
      return true;
    }
    case 'quest_turnin': {
      const q = c.quest, qd = QUESTS[q.idx];
      if (q.status !== 'complete' || !qd) return false;
      if (!near(ctx.pos, NPCS.elder.x, NPCS.elder.z, INTERACT_RANGE.npc)) return deny(fx);
      const r = qd.reward;
      c.gold += r.gold || 0;
      const got = [];
      for (const [id, n] of Object.entries(r.items || {})) { addItem(c, id, n); got.push(`${n}x ${ITEMS[id].name}`); }
      fx.push({ k: 'sfx', name: 'quest' }, { k: 'sfx', name: 'coin' },
        { k: 'log', text: `Recompensa: ${r.gold} ouro${got.length ? `, ${got.join(', ')}` : ''}`, cls: 'gold' });
      // equipa sozinho o que for melhor que o atual
      for (const id of Object.keys(r.items || {})) {
        const ri = ITEMS[id], w = weaponOf(c);
        if (ri.kind === 'weapon' && ri.style === w.style && ri.bonus > w.bonus) equip(c, id, fx);
        if ((ri.kind === 'armor' || ri.kind === 'helmet') && ri.def > (ITEMS[c[ri.kind]]?.def || 0)) equip(c, id, fx);
      }
      q.idx++; q.progress = 0;
      q.status = q.idx < QUESTS.length ? 'available' : 'done';
      fx.push({ k: 'closeDialog' });
      gainXp(c, r.xp, fx);
      return true;
    }
    case 'pickup': {
      const l = ctx.loot.items.get(a.lid);
      if (!l) { fx.push({ k: 'lootGone', lid: a.lid }); return false; }
      if (!near(ctx.pos, l.x, l.z, LOOT_REACH) || ctx.now - l.t < 0.5) return false;
      ctx.loot.items.delete(a.lid);
      addItem(c, l.item);
      fx.push({ k: 'lootGone', lid: a.lid }, { k: 'sfx', name: 'pickup' }, { k: 'pickup', item: l.item });
      return true;
    }
    case 'respawn': {
      if (!c.dead) return false;
      c.dead = false;
      c.hp = c.maxHp;
      fx.push({ k: 'respawn', pos: [...SPAWN_POINT] }); // quem move o jogador é quem chamou (servidor: teleport)
      return true;
    }
    default: return false;
  }
}
