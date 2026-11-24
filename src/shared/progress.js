// Regras de progresso do personagem em dados puros (sem three.js / DOM):
// XP e nível, classe e árvore, ouro, inventário, loja, equipamento, poções, missões, baús (drop e tesouro),
// casa (armário, cofre, baú), portas (mina/casa), dano e morte.
// Offline roda no navegador; online roda SÓ no servidor (o cliente manda pedidos e recebe o resultado).
//
// Cada função recebe o personagem `c` e uma lista `fx` onde empurra efeitos para a interface:
//   {k:'log', text, cls} {k:'sfx', name, at?} {k:'float', text, color, size, at?, h?} {k:'levelUp', level}
//   {k:'loot', lid, item, n?, x, z} {k:'lootGone', lid} {k:'hurt', dmg} {k:'death', by, lost, pct, items, resetAt}
//   {k:'respawn', pos} {k:'heal', n, color} {k:'pickup', item, n?} {k:'equip', item} {k:'closeDialog'}
//   {k:'teleport', x, z, region} {k:'chest', id} {k:'classChosen', cls} {k:'skillUp', node} {k:'buff', id, until}
import { ITEMS, SLOTS, SHOP_LISTS, FARM, rollDrop, rollTreasure, damageReduction } from './items.js';
import { QUESTS } from './quests.js';
import { TYPES } from './mobs.js';
import {
  NPCS, WELLS, INTERACT_RANGE, SPAWN_POINT, TREASURES, TREASURE_RESPAWN, HOME_FURNITURE, DOOR_BY_ID, inHome,
} from './worldData.js';
import {
  CLASSES, CLASS_LEVEL, TREES, RESPEC_COST, BUFFS, statsOf, canRaise, nodeOf, skillPointsFree,
} from './classes.js';

/** quem dá cada missão (NPC) */
export const questGiver = (qd) => NPCS[qd?.giver || 'elder'];
const SHOPS = Object.values(NPCS).filter((n) => n.role === 'shop');
/** quem vende este item (para a mensagem de "procure fulano") */
export const sellersOf = (id) => SHOPS.filter((n) => SHOP_LISTS[n.sells]?.includes(id));

export const HP_BASE = 100;
export const HP_PER_LEVEL = 15;
export const DROP_EVERY = 5; // a cada 5 abates cai um baú
export const DEATH_STEP = 0.1; // cada morte no período tira +10% do ouro (10%, 20%, 30%...)
export const DEATH_PERIOD_MS = 2 * 86400_000; // zera a cada 2 dias, à meia-noite UTC
export const NOVICE_MAX_LEVEL = 3; // proteção de novato: até este nível, morrer não tira os itens
export const LOOT_TTL = 300; // s até o baú sumir
export const LOOT_REACH = 3.5; // distância máxima para pegar (servidor; o cliente encosta a 1.8 m)
export const MAX_LEVEL = 99;

export const xpToNext = (l) => Math.floor(50 * Math.pow(l, 1.5));
export const maxHpFor = (level) => HP_BASE + (level - 1) * HP_PER_LEVEL;
export const maxHpOf = (c) => Math.round(maxHpFor(c.level) * statsOf(c).hpMul);
export const weaponOf = (c) => ITEMS[c.equipped] || ITEMS.wood_sword;
export const defenseOf = (c) => (ITEMS[c.armor]?.def || 0) + (ITEMS[c.helmet]?.def || 0) + statsOf(c).def;
export const isEquipped = (c, id) => id === c.equipped || id === c.armor || id === c.helmet;
export const deathPeriod = (ms) => Math.floor(ms / DEATH_PERIOD_MS);
/** % de ouro que a PRÓXIMA morte vai tirar */
export const nextDeathPct = (c, ms = Date.now()) => Math.min(100, Math.round(((c.deaths?.period === deathPeriod(ms) ? c.deaths.n : 0) + 1) * DEATH_STEP * 100));
export const treasureLeft = (c, t, ms = Date.now()) => Math.max(0, (c.chests?.[t.id] || 0) + TREASURE_RESPAWN[t.tier] * 1000 - ms);

export function newCharacter() {
  return {
    level: 1, xp: 0, gold: 10, maxHp: HP_BASE, hp: HP_BASE, kills: 0,
    inv: { potion: 3, wood_sword: 1 }, equipped: 'wood_sword', armor: null, helmet: null,
    quest: { idx: 0, status: 'available', progress: 0 }, pos: [...SPAWN_POINT],
    cls: null, skills: {}, chests: {}, home: { rack: {}, chest: {}, safe: 0 }, deaths: { period: 0, n: 0 }, buffs: {}, farm: {},
  };
}

const int = (v, min, max, def) => (Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def);
const num = (v, min, max, def) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def);
const cleanBag = (o, ok = () => true) => {
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o).slice(0, 80)) if (ITEMS[k] && ok(ITEMS[k])) { const n = int(v, 0, 9999, 0); if (n > 0) out[k] = n; }
  return out;
};
const gearOk = (it) => it.kind !== 'consumable';
const potionOk = (it) => it.kind === 'consumable';

/** Aceita só campos conhecidos e itens que existem; vida máxima sempre vem do nível + classe. */
export function normalizeCharacter(d) {
  const base = newCharacter();
  if (!d || typeof d !== 'object') return base;
  const inv = cleanBag(d.inv);
  const level = int(d.level, 1, MAX_LEVEL, 1);
  const q = d.quest && typeof d.quest === 'object' ? d.quest : base.quest;
  const quest = {
    idx: int(q.idx, 0, QUESTS.length, 0),
    status: ['available', 'active', 'complete', 'done'].includes(q.status) ? q.status : 'available',
    progress: int(q.progress, 0, 1000, 0),
  };
  if (quest.idx >= QUESTS.length) quest.status = 'done';
  else if (quest.status === 'done') quest.status = 'available'; // missões novas depois de terminar todas
  const cls = CLASSES[d.cls] && level >= CLASS_LEVEL ? d.cls : null;
  const skills = {};
  if (cls && d.skills && typeof d.skills === 'object') {
    for (const n of TREES[cls]) { const v = int(d.skills[n.id], 0, n.max, 0); if (v) skills[n.id] = v; }
  }
  const chests = {};
  const now = Date.now();
  if (d.chests && typeof d.chests === 'object') {
    for (const t of TREASURES) { const v = d.chests[t.id]; if (Number.isFinite(v) && now - v < TREASURE_RESPAWN[t.tier] * 1000) chests[t.id] = v; }
  }
  const h = d.home && typeof d.home === 'object' ? d.home : {};
  const c = {
    level, xp: int(d.xp, 0, 1e9, 0), gold: int(d.gold, 0, 1e9, 0), maxHp: 0, hp: 0,
    kills: int(d.kills, 0, 1e9, 0), inv,
    equipped: ITEMS[d.equipped]?.kind === 'weapon' && inv[d.equipped] ? d.equipped : 'wood_sword',
    armor: ITEMS[d.armor]?.kind === 'armor' && inv[d.armor] ? d.armor : null,
    helmet: ITEMS[d.helmet]?.kind === 'helmet' && inv[d.helmet] ? d.helmet : null,
    quest,
    pos: Array.isArray(d.pos) ? [num(d.pos[0], -1000, 1000, 0), 0, num(d.pos[2], -1000, 1000, 8)] : [...SPAWN_POINT],
    cls, skills, chests,
    home: { rack: cleanBag(h.rack, gearOk), chest: cleanBag(h.chest, potionOk), safe: int(h.safe, 0, 1e9, 0) },
    deaths: { period: int(d.deaths?.period, 0, 1e7, 0), n: int(d.deaths?.n, 0, 1000, 0) },
    buffs: {}, farm: {},
  };
  if (d.farm && typeof d.farm === 'object') { // monstros abatidos há pouco (anti-farm), no máximo 300
    for (const [k, t] of Object.entries(d.farm).slice(0, 300)) if (typeof k === 'string' && k.length < 40 && Number.isFinite(t) && now - t < FARM.window) c.farm[k] = t;
  }
  if (d.buffs && typeof d.buffs === 'object') { // pergaminhos ainda valendo
    for (const [id, until] of Object.entries(d.buffs)) if (BUFFS[id] && Number.isFinite(until) && until > now && until < now + 600e3) c.buffs[id] = until;
  }
  // pontos gastos a mais que o nível permite (ex.: nível alterado por teste): zera a árvore
  if (skillPointsFree(c) < 0) c.skills = {};
  c.maxHp = maxHpOf(c);
  c.hp = int(d.hp, 0, c.maxHp, c.maxHp);
  if (c.equipped === 'wood_sword' && !inv.wood_sword) inv.wood_sword = 1; // nunca fica sem arma
  if (c.hp <= 0) c.hp = c.maxHp; // salvo morto: volta vivo
  return c;
}

/** Só o que vai para o cliente / banco (sem campos de runtime) */
export function publicCharacter(c) {
  const { level, xp, gold, maxHp, hp, kills, inv, equipped, armor, helmet, quest, pos, cls, skills, chests, home, deaths, buffs, farm } = c;
  return {
    level, xp, gold, maxHp, hp: Math.ceil(hp), kills, inv: { ...inv }, equipped, armor, helmet, quest: { ...quest }, pos: [...pos],
    cls: cls || null, skills: { ...skills }, chests: { ...chests },
    home: { rack: { ...home.rack }, chest: { ...home.chest }, safe: home.safe }, deaths: { ...deaths }, buffs: { ...(buffs || {}) }, farm: { ...(farm || {}) },
  };
}

const addItem = (bag, id, n = 1) => { bag[id] = (bag[id] || 0) + n; };
const removeItem = (bag, id, n = 1) => { bag[id] = (bag[id] || 0) - n; if (bag[id] <= 0) delete bag[id]; };
const near = (pos, x, z, r) => pos && Math.hypot(pos.x - x, pos.z - z) <= r;
const nearShop = (pos) => SHOPS.some((n) => near(pos, n.x, n.z, INTERACT_RANGE.npc));

/** vida máxima mudou (nível, classe, árvore): ganha a diferença, nunca cura além disso */
function recalcHp(c) {
  const old = c.maxHp;
  c.maxHp = maxHpOf(c);
  c.hp = Math.max(1, Math.min(c.maxHp, c.hp + Math.max(0, c.maxHp - old)));
}

// ---------- XP / nível ----------
export function gainXp(c, n, fx) {
  c.xp += n;
  fx.push({ k: 'float', text: `+${n} XP`, color: '#6fd0ff', size: 16, h: 3.3 });
  while (c.xp >= xpToNext(c.level) && c.level < MAX_LEVEL) {
    c.xp -= xpToNext(c.level);
    c.level++;
    recalcHp(c);
    fx.push({ k: 'levelUp', level: c.level });
    fx.push({ k: 'log', text: `Você subiu para o nível ${c.level}! Vida máxima: ${c.maxHp}`, cls: 'good' });
    if (c.level === CLASS_LEVEL && !c.cls) fx.push({ k: 'log', text: '⭐ Você já pode escolher sua classe! Aperte K.', cls: 'good' }, { k: 'chooseClass' });
    else if (c.cls) fx.push({ k: 'log', text: '⭐ +1 ponto de habilidade (K para abrir a árvore).', cls: 'good' });
    if (c.level === NOVICE_MAX_LEVEL + 1) {
      fx.push({ k: 'log', text: '⚠️ Fim da proteção de novato: agora, ao morrer, você perde tudo o que carrega. Guarde um equipamento reserva no armário da sua casa!', cls: 'bad' });
    }
  }
}

/** Define o nível direto (comando de teste) */
export function setLevel(c, level) {
  c.level = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));
  c.xp = 0;
  if (c.level < CLASS_LEVEL) { c.cls = null; c.skills = {}; }
  if (skillPointsFree(c) < 0) c.skills = {};
  c.maxHp = maxHpOf(c);
  c.hp = Math.min(c.hp, c.maxHp);
}

// ---------- Baús (loot no chão) ----------
/** Itens e moedas no chão, de cada jogador. Ficam só na memória (somem ao sair ou depois de LOOT_TTL). */
export class LootBag {
  constructor() { this.next = 1; this.items = new Map(); }
  /** item = id do item ou 'gold' (n = quantidade de moedas) */
  add(item, x, z, now, fx, n = 1) {
    const lid = this.next++;
    this.items.set(lid, { lid, item, n, x, z, t: now });
    fx.push({ k: 'loot', lid, item, n, x, z });
    return lid;
  }
  expire(now, fx) {
    for (const [lid, l] of this.items) if (now - l.t > LOOT_TTL) { this.items.delete(lid); fx.push({ k: 'lootGone', lid }); }
  }
  list() { return [...this.items.values()]; }
}

// ---------- Abate ----------
/** Monstro morto com crédito para este jogador. at = {x, z} do monstro. */
export function kill(c, type, at, ctx, fx, key = null) {
  const def = TYPES[type];
  if (!def) return;
  const rand = ctx.rand || Math.random;
  // anti-farm: se VOCÊ matou este mesmo monstro (mesmo ponto de nascimento) há menos de 30 min, ele é "de respawn"
  const clock = ctx.clock ?? Date.now();
  c.farm = c.farm || {};
  const farmed = !!key && clock - (c.farm[key] || -Infinity) < FARM.window;
  if (key) {
    c.farm[key] = clock;
    const keys = Object.keys(c.farm);
    if (keys.length > 300) for (const k of keys) if (clock - c.farm[k] >= FARM.window) delete c.farm[k];
  }
  const g = def.gold[0] + Math.floor(rand() * (def.gold[1] - def.gold[0] + 1));
  c.gold += g;
  c.kills++;
  fx.push({ k: 'sfx', name: 'coin', at });
  fx.push({ k: 'float', text: `+${g} 🪙`, color: '#ffd65c', size: 16, at, h: def.height + 1 });
  fx.push({ k: 'log', text: `${def.name} derrotado! +${g} 🪙`, cls: 'gold' });
  if (c.kills % DROP_EVERY === 0 && (!farmed || rand() < FARM.dropChance)) {
    ctx.loot.add(rollDrop(false, rand, farmed), at.x, at.z, ctx.now, fx);
    fx.push({ k: 'sfx', name: 'drop', at });
    fx.push({ k: 'log', text: '🎁 Um item caiu! Encoste nele para pegar.', cls: 'good' });
  }
  if (def.boss) {
    if (!farmed) {
      ctx.loot.add(rollDrop(true, rand), at.x + 1.5, at.z, ctx.now, fx);
      fx.push({ k: 'log', text: '🎁 O chefe deixou cair um equipamento raro!', cls: 'good' });
    } else if (rand() < FARM.bossDropChance) {
      ctx.loot.add(rollDrop(false, rand, true), at.x + 1.5, at.z, ctx.now, fx);
      fx.push({ k: 'log', text: 'O chefe renasceu fraco: só deixou um item comum. (Equipamento raro: 1 vez a cada 30 min por chefe)', cls: 'info' });
    } else fx.push({ k: 'log', text: 'O chefe renasceu fraco e não deixou equipamento. (Equipamento raro: 1 vez a cada 30 min por chefe)', cls: 'info' });
  }
  const q = c.quest, qd = QUESTS[q.idx];
  if (q.status === 'active' && qd?.target === type) {
    q.progress++;
    if (q.progress >= qd.count) {
      q.status = 'complete';
      fx.push({ k: 'sfx', name: 'quest' });
      const giver = questGiver(qd);
      fx.push({ k: 'log', text: `Missão concluída! Volte para ${giver.title} ${giver.where}.`, cls: 'info' });
    }
  }
  gainXp(c, def.xp, fx);
}

// ---------- Dano / morte ----------
/**
 * Dano bruto do monstro → dano real (armadura). Retorna o dano aplicado.
 * Morte: perde TODOS os itens que carrega (o que está guardado em casa fica a salvo) e uma % do ouro
 * que cresce 10% a cada morte (10%, 20%, 30%...), zerando a cada 2 dias à meia-noite UTC.
 * Volta com uma Espada de Madeira para não ficar desarmado.
 */
export function hurt(c, dmg, type, ctx, fx) {
  if (c.dead || ctx.god) return 0;
  const rand = ctx.rand || Math.random;
  if (rand() < statsOf(c).dodge) { // esquiva (Ladino)
    fx.push({ k: 'float', text: 'Esquivou!', color: '#ffe08a', size: 18 }, { k: 'sfx', name: 'jump' });
    return 0;
  }
  const real = Math.max(1, Math.round(dmg * (0.85 + rand() * 0.3) * (1 - damageReduction(defenseOf(c)))));
  c.hp = Math.max(0, c.hp - real);
  fx.push({ k: 'hurt', dmg: real });
  if (c.hp <= 0) {
    c.dead = true;
    const ms = ctx.clock ?? Date.now();
    const period = deathPeriod(ms);
    if (c.deaths.period !== period) c.deaths = { period, n: 0 };
    c.deaths.n++;
    const pct = Math.min(100, Math.round(c.deaths.n * DEATH_STEP * 100));
    const lost = Math.floor((c.gold * pct) / 100);
    c.gold -= lost;
    const novice = c.level <= NOVICE_MAX_LEVEL;
    let items = 0;
    if (!novice) { // perde tudo o que carrega
      items = Object.values(c.inv).reduce((s, n) => s + n, 0) - (c.inv.wood_sword && c.equipped === 'wood_sword' ? 1 : 0);
      c.inv = { wood_sword: 1 };
      c.buffs = {};
      c.equipped = 'wood_sword'; c.armor = null; c.helmet = null;
    }
    fx.push({ k: 'death', by: TYPES[type]?.name || 'um monstro', lost, pct, items: Math.max(0, items), novice, resetAt: (period + 1) * DEATH_PERIOD_MS });
  }
  return real;
}

// ---------- Ações do jogador ----------
const deny = (fx, text) => { fx.push({ k: 'sfx', name: 'deny' }); if (text) fx.push({ k: 'log', text, cls: 'bad' }); return false; };
const fmtMin = (ms) => (ms >= 60_000 ? `${Math.ceil(ms / 60_000)} min` : `${Math.ceil(ms / 1000)} s`);

function equip(c, id, fx) {
  const it = ITEMS[id];
  const slot = it && SLOTS[it.kind];
  if (!c.inv[id] || !slot) return deny(fx);
  c[slot] = id;
  fx.push({ k: 'equip', item: id });
  return true;
}

/** Item/moedas espalhados em volta de um ponto (baú de tesouro) */
function scatter(ctx, fx, x, z, list) {
  list.forEach(([item, n], i) => {
    const a = (i / list.length) * Math.PI * 2 + 0.3;
    ctx.loot.add(item, x + Math.cos(a) * 1.3, z + Math.sin(a) * 1.3, ctx.now, fx, n);
  });
}

/**
 * Executa um pedido do jogador. ctx = { pos:{x,z}, now (s), clock (ms), rand, loot: LootBag }.
 * Retorna true se mudou algo.
 */
export function act(c, a, ctx, fx) {
  if (!a || typeof a.a !== 'string') return false;
  if (c.dead && a.a !== 'respawn') return false;
  const it = ITEMS[a.id];
  const clock = ctx.clock ?? Date.now();
  const qty = (have) => (a.n === -1 ? have : Math.max(1, Math.min(have, Math.trunc(Number(a.n) || 1))));
  switch (a.a) {
    case 'buy': {
      if (!it || !it.price) return deny(fx);
      const here = SHOPS.filter((n) => near(ctx.pos, n.x, n.z, INTERACT_RANGE.npc));
      if (!here.length) return deny(fx, 'Vá até uma loja para comprar.');
      if (!here.some((n) => SHOP_LISTS[n.sells]?.includes(a.id))) {
        const who = sellersOf(a.id).map((n) => `${n.name} (${n.where})`).join(' ou ');
        return deny(fx, `${here[0].name} não vende ${it.name}.${who ? ` Procure ${who}.` : ''}`);
      }
      if (c.gold < it.price) return deny(fx);
      c.gold -= it.price;
      addItem(c.inv, a.id);
      fx.push({ k: 'sfx', name: 'coin' }, { k: 'log', text: `Comprou ${it.icon} ${it.name}.`, cls: 'gold' });
      if (SLOTS[it.kind]) equip(c, a.id, fx);
      return true;
    }
    case 'sell': {
      if (!it || !c.inv[a.id]) return deny(fx);
      if (!nearShop(ctx.pos)) return deny(fx, 'Vá até uma loja para vender.');
      if (isEquipped(c, a.id) && c.inv[a.id] <= 1) return deny(fx, 'Não dá para vender o item que você está usando.');
      removeItem(c.inv, a.id);
      c.gold += it.sell;
      fx.push({ k: 'sfx', name: 'coin' }, { k: 'log', text: `Vendeu ${it.icon} ${it.name} por ${it.sell} 🪙.`, cls: 'gold' });
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
      if (!c.inv[a.id]) return deny(fx, `Sem ${it.name}! Compre numa loja.`);
      if (it.sub === 'scroll') { // pergaminho: uso único
        removeItem(c.inv, a.id);
        if (it.tp === 'village') {
          fx.push({ k: 'sfx', name: 'levelUp' }, { k: 'teleport', x: SPAWN_POINT[0], z: SPAWN_POINT[2], region: 'world' },
            { k: 'log', text: `${it.icon} O pergaminho se desfaz em luz... você está de volta à Vila Pedraverde.`, cls: 'good' });
        } else if (BUFFS[it.buff]) {
          const B = BUFFS[it.buff];
          c.buffs = c.buffs || {};
          c.buffs[it.buff] = clock + B.secs * 1000;
          fx.push({ k: 'sfx', name: 'quest' }, { k: 'buff', id: it.buff, until: c.buffs[it.buff] },
            { k: 'float', text: `${B.icon} ${B.name}!`, color: '#ffe08a', size: 20 },
            { k: 'log', text: `${it.icon} ${B.name} por ${B.secs} s.`, cls: 'good' });
        }
        return true;
      }
      if (c.hp >= c.maxHp) { fx.push({ k: 'sfx', name: 'deny' }, { k: 'log', text: 'Vida já está cheia.', cls: 'info' }); return false; }
      removeItem(c.inv, a.id);
      const heal = Math.round(c.maxHp * it.heal);
      c.hp = Math.min(c.maxHp, c.hp + heal);
      fx.push({ k: 'sfx', name: 'potion' }, { k: 'heal', n: heal, color: '#7dff7d' });
      return true;
    }
    case 'well': {
      const w = WELLS.find((ww) => near(ctx.pos, ww.x, ww.z, INTERACT_RANGE.well));
      if (!w) return deny(fx);
      if (c.hp >= c.maxHp) return deny(fx);
      const healed = Math.round(c.maxHp - c.hp);
      c.hp = c.maxHp;
      fx.push({ k: 'sfx', name: 'potion' }, { k: 'heal', n: healed, color: '#7dd8ff' },
        { k: 'log', text: `💧 Você bebeu a água da ${w.name} e recuperou toda a vida.`, cls: 'good' });
      return true;
    }
    case 'quest_accept': {
      const q = c.quest, qd = QUESTS[q.idx];
      if (q.status !== 'available' || !qd) return false;
      const g = questGiver(qd);
      if (!near(ctx.pos, g.x, g.z, INTERACT_RANGE.npc)) return deny(fx);
      q.status = 'active'; q.progress = 0;
      fx.push({ k: 'sfx', name: 'quest' }, { k: 'log', text: `Missão aceita: ${qd.title}`, cls: 'info' }, { k: 'closeDialog' });
      return true;
    }
    case 'quest_turnin': {
      const q = c.quest, qd = QUESTS[q.idx];
      if (q.status !== 'complete' || !qd) return false;
      const g = questGiver(qd);
      if (!near(ctx.pos, g.x, g.z, INTERACT_RANGE.npc)) return deny(fx);
      const r = qd.reward;
      c.gold += r.gold || 0;
      const got = [];
      for (const [id, n] of Object.entries(r.items || {})) { addItem(c.inv, id, n); got.push(`${n}x ${ITEMS[id].name}`); }
      fx.push({ k: 'sfx', name: 'quest' }, { k: 'sfx', name: 'coin' },
        { k: 'log', text: `Recompensa: ${r.gold} 🪙${got.length ? `, ${got.join(', ')}` : ''}`, cls: 'gold' });
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
      if (l.item === 'gold') {
        c.gold += l.n;
        fx.push({ k: 'lootGone', lid: a.lid }, { k: 'sfx', name: 'coin' }, { k: 'pickup', item: 'gold', n: l.n });
      } else {
        addItem(c.inv, l.item);
        fx.push({ k: 'lootGone', lid: a.lid }, { k: 'sfx', name: 'pickup' }, { k: 'pickup', item: l.item });
      }
      return true;
    }
    case 'respawn': {
      if (!c.dead) return false;
      c.dead = false;
      c.hp = c.maxHp;
      fx.push({ k: 'respawn', pos: [...SPAWN_POINT] }); // quem move o jogador é quem chamou (servidor: teleport)
      return true;
    }

    // ---------- baús de tesouro ----------
    case 'open_chest': {
      const t = TREASURES.find((tt) => tt.id === a.id);
      if (!t) return false;
      if (!near(ctx.pos, t.x, t.z, INTERACT_RANGE.chest)) return deny(fx);
      const left = treasureLeft(c, t, clock);
      if (left > 0) return deny(fx, `Este baú está vazio. Volte em ${fmtMin(left)}.`);
      const loot = rollTreasure(t.tier, ctx.rand || Math.random);
      c.chests[t.id] = clock;
      scatter(ctx, fx, t.x, t.z, [['gold', loot.gold], ...loot.items.map((id) => [id, 1])]);
      fx.push({ k: 'chest', id: t.id }, { k: 'sfx', name: 'drop', at: t },
        { k: 'log', text: `💎 Baú do tesouro aberto: ${loot.gold} 🪙 e ${loot.items.length} item(ns)!`, cls: 'gold' });
      return true;
    }

    // ---------- portas, escadas e saídas (tabela DOORS em worldData) ----------
    case 'enter_mine': case 'leave_mine': case 'enter_home': case 'leave_home': // nomes antigos
      return act(c, { a: 'door', id: { enter_mine: 'mine_in', leave_mine: 'mine_out', enter_home: 'home_in', leave_home: 'home_out' }[a.a] }, ctx, fx);
    case 'door': {
      const d = DOOR_BY_ID[a.id];
      if (!d) return false;
      if (!near(ctx.pos, d.at.x, d.at.z, d.r)) return deny(fx);
      fx.push({ k: 'teleport', x: d.to.x, z: d.to.z, door: d.id });
      if (d.log) fx.push({ k: 'log', text: d.log, cls: 'info' });
      return true;
    }

    // ---------- casa: armário (equipamento), baú (poções), cofre (ouro) ----------
    case 'store': case 'take': {
      const box = a.box;
      const f = HOME_FURNITURE[box];
      if (!f || (box !== 'rack' && box !== 'chest')) return false;
      if (!inHome(ctx.pos?.x, ctx.pos?.z) || !near(ctx.pos, f.x, f.z, INTERACT_RANGE.furniture)) return deny(fx, `Chegue perto do ${f.name}.`);
      if (!it || (box === 'rack' ? !gearOk(it) : !potionOk(it))) return deny(fx, box === 'rack' ? 'O armário guarda só armas e armaduras.' : 'O baú guarda só poções e pergaminhos.');
      const bag = c.home[box];
      if (a.a === 'store') {
        if (!c.inv[a.id]) return false;
        const n = qty(c.inv[a.id]);
        const remaining = c.inv[a.id] - n;
        if (remaining <= 0 && c.equipped === a.id) return deny(fx, 'Equipe outra arma antes de guardar esta.');
        if (remaining <= 0 && c.armor === a.id) c.armor = null;
        if (remaining <= 0 && c.helmet === a.id) c.helmet = null;
        removeItem(c.inv, a.id, n); addItem(bag, a.id, n);
        fx.push({ k: 'sfx', name: 'equip' }, { k: 'log', text: `Guardou ${n}x ${it.icon} ${it.name} no ${f.name}.`, cls: 'info' });
      } else {
        if (!bag[a.id]) return false;
        const n = qty(bag[a.id]);
        removeItem(bag, a.id, n); addItem(c.inv, a.id, n);
        fx.push({ k: 'sfx', name: 'pickup' }, { k: 'log', text: `Pegou ${n}x ${it.icon} ${it.name} do ${f.name}.`, cls: 'info' });
      }
      return true;
    }
    case 'deposit': case 'withdraw': {
      const f = HOME_FURNITURE.safe;
      if (!inHome(ctx.pos?.x, ctx.pos?.z) || !near(ctx.pos, f.x, f.z, INTERACT_RANGE.furniture)) return deny(fx, 'Chegue perto do cofre.');
      const from = a.a === 'deposit' ? c.gold : c.home.safe;
      if (from <= 0) return deny(fx);
      const n = qty(from);
      if (a.a === 'deposit') { c.gold -= n; c.home.safe += n; } else { c.home.safe -= n; c.gold += n; }
      fx.push({ k: 'sfx', name: 'coin' }, { k: 'log', text: `${a.a === 'deposit' ? 'Guardou' : 'Retirou'} ${n} 🪙 ${a.a === 'deposit' ? 'no' : 'do'} cofre.`, cls: 'gold' });
      return true;
    }

    // ---------- classe e árvore de habilidades ----------
    case 'choose_class': {
      const cl = CLASSES[a.cls];
      if (!cl || c.cls) return deny(fx, c.cls ? 'Você já escolheu sua classe.' : null);
      if (c.level < CLASS_LEVEL) return deny(fx, `Você escolhe a classe no nível ${CLASS_LEVEL}.`);
      c.cls = a.cls; c.skills = {};
      recalcHp(c);
      fx.push({ k: 'sfx', name: 'levelUp' }, { k: 'classChosen', cls: a.cls },
        { k: 'log', text: `${cl.icon} Agora você é ${cl.name}! ${cl.passive}.`, cls: 'good' });
      if (cl.starter) { // presente: a arma (ou armadura) da classe, já equipada
        addItem(c.inv, cl.starter);
        fx.push({ k: 'log', text: `🎁 Presente de classe: ${ITEMS[cl.starter].icon} ${ITEMS[cl.starter].name}.`, cls: 'gold' });
        equip(c, cl.starter, fx);
      }
      return true;
    }
    case 'skill_up': {
      if (!c.cls) return deny(fx, 'Escolha uma classe primeiro.');
      const why = canRaise(c, a.node);
      if (why) return deny(fx, why);
      c.skills[a.node] = (c.skills[a.node] || 0) + 1;
      recalcHp(c);
      const n = nodeOf(c.cls, a.node);
      fx.push({ k: 'sfx', name: 'equip' }, { k: 'skillUp', node: a.node },
        { k: 'log', text: `${n.icon} ${n.name} ${n.max > 1 ? `${c.skills[a.node]}/${n.max}` : 'aprendida'}!`, cls: 'good' });
      return true;
    }
    case 'respec': {
      if (!c.cls || !Object.keys(c.skills).length) return deny(fx, 'Nada para redistribuir.');
      if (!near(ctx.pos, NPCS.elder.x, NPCS.elder.z, INTERACT_RANGE.npc)) return deny(fx, `Fale com o ${NPCS.elder.name} para redistribuir os pontos.`);
      const cost = RESPEC_COST(c.level);
      if (c.gold < cost) return deny(fx, `Custa ${cost} 🪙.`);
      c.gold -= cost; c.skills = {};
      c.maxHp = maxHpOf(c); c.hp = Math.min(c.hp, c.maxHp);
      fx.push({ k: 'sfx', name: 'coin' }, { k: 'log', text: `Pontos de habilidade devolvidos (−${cost} 🪙).`, cls: 'info' });
      return true;
    }
    default: return false;
  }
}
