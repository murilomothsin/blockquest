// Análise de balanceamento: usa as MESMAS regras do jogo (shared/*) para calcular dano por segundo,
// tempo para matar, dano recebido, salas da mina, economia e morte.
// Uso: node scripts/balance.mjs
import { ITEMS, damageReduction, TREASURE_LOOT } from '../src/shared/items.js';
import { TYPES, SPAWNS } from '../src/shared/mobs.js';
import { CLASSES, TREES, SKILLS, statsOf } from '../src/shared/classes.js';
import { xpToNext, maxHpOf, defenseOf } from '../src/shared/progress.js';
import { attackCooldown, weaponRange, splashOf } from '../src/shared/combatRules.js';
import { MINE_SPAWNS, MINE_ROOM_CENTERS } from '../src/shared/worldData.js';
import { QUESTS } from '../src/shared/quests.js';

const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

// equipamento "típico" por faixa de nível (o que dá para comprar com o ouro ganho até ali)
const GEAR = [
  { upTo: 2, tier: 0, armor: null, helmet: null },
  { upTo: 4, tier: 1, armor: 'leather_armor', helmet: 'leather_helmet' },
  { upTo: 7, tier: 2, armor: 'iron_armor', helmet: 'iron_helmet' },
  { upTo: 10, tier: 3, armor: 'steel_armor', helmet: 'steel_helmet' },
  { upTo: 99, tier: 4, armor: 'rune_armor', helmet: 'rune_helmet' },
];
const WEAPON = {
  guerreiro: ['wood_sword', 'iron_sword', 'iron_sword', 'steel_sword', 'rune_blade'],
  cacador: ['wood_sword', 'short_bow', 'short_bow', 'long_bow', 'elven_bow'],
  arcanista: ['wood_sword', 'apprentice_staff', 'apprentice_staff', 'crystal_staff', 'rune_staff'],
  ladino: ['wood_sword', 'iron_dagger', 'iron_dagger', 'steel_dagger', 'shadow_dagger'],
  nenhuma: ['wood_sword', 'iron_sword', 'iron_sword', 'steel_sword', 'rune_blade'],
};
// ordem em que um jogador "normal" gasta os pontos
const BUILD = {
  guerreiro: ['g_forca', 'g_giro', 'g_pele', 'g_vigor', 'g_forca', 'g_pele', 'g_vigor', 'g_furia', 'g_forca', 'g_pele', 'g_vigor', 'g_furia'],
  cacador: ['c_mira', 'c_chuva', 'c_couro', 'c_mira', 'c_olho', 'c_couro', 'c_mira', 'c_letal', 'c_couro', 'c_olho', 'c_letal', 'c_olho'],
  arcanista: ['a_poder', 'a_bola', 'a_escudo', 'a_poder', 'a_eco', 'a_escudo', 'a_poder', 'a_foco', 'a_escudo', 'a_eco', 'a_foco', 'a_eco'],
  ladino: ['l_ponto', 'l_furtivo', 'l_lamina', 'l_agil', 'l_lamina', 'l_ponto', 'l_agil', 'l_veneno', 'l_lamina', 'l_ponto', 'l_agil', 'l_veneno'],
};

export function makeChar(cls, level) {
  const g = GEAR.find((x) => level <= x.upTo);
  const w = WEAPON[cls][g.tier];
  const c = {
    level, cls: cls === 'nenhuma' || level < 2 ? null : cls, skills: {}, equipped: w, armor: g.armor, helmet: g.helmet,
    inv: { [w]: 1 }, hp: 0, maxHp: 0,
  };
  if (c.cls) for (const id of BUILD[cls].slice(0, level - 1)) c.skills[id] = (c.skills[id] || 0) + 1;
  c.maxHp = maxHpOf(c); c.hp = c.maxHp;
  return c;
}

/** dano médio de um golpe (variação 0,85–1,15 tem média 1) com crítico */
function avgHit(c, mul = 1) {
  const w = ITEMS[c.equipped], s = statsOf(c);
  const base = (10 + c.level * 3 + w.bonus) * s.dmg[w.style] * mul;
  return base * (1 + s.crit * (s.critMul - 1));
}
/** dano por segundo num alvo (+ alvos extras da explosão do cajado) */
export function dps(c, extraTargets = 0) {
  const w = ITEMS[c.equipped];
  let d = avgHit(c) / attackCooldown(c);
  if (w.style === 'magic') d *= 1 + splashOf(c).pct * extraTargets;
  return d;
}
const mobDps = (type, c) => (TYPES[type].dmg * (1 - damageReduction(defenseOf(c))) * (1 - statsOf(c).dodge)) / TYPES[type].cd;

/**
 * Luta contra um grupo (todos atacam juntos). Corpo a corpo: apanha desde o começo.
 * À distância: ganha (alcance − 2)/velocidade segundos de tiros livres antes do 1º monstro chegar.
 * Habilidade ativa usada no começo de cada luta (recarga ≥ 7 s).
 */
export function fight(c, group) {
  const w = ITEMS[c.equipped];
  const mobs = group.map((t) => ({ t, hp: TYPES[t].hp }));
  let t = 0, taken = 0;
  const act = c.cls && Object.entries(c.skills).map(([id]) => TREES[c.cls].find((n) => n.id === id)).find((n) => n?.active);
  let skillReady = 0;
  // à distância: o monstro acorda a `aggro` m (na mina não dá para abrir mais que isso), então anda até 2 m de você
  const range = w.style === 'melee' ? 0 : Math.min(weaponRange(c), Math.max(...group.map((g) => TYPES[g].aggro)) + 2);
  const approach = range ? Math.max(0, range - 2) / Math.max(...group.map((g) => TYPES[g].speed)) : 0;
  const kite = w.style === 'melee' ? 0 : 0.35; // quem luta de longe recua e evita ~35% dos golpes
  const dt = 0.05;
  while (mobs.some((m) => m.hp > 0) && t < 600) {
    const alive = mobs.filter((m) => m.hp > 0);
    // habilidade
    if (act && t >= skillReady && (!SKILLS[act.active].needs || SKILLS[act.active].needs === w.style)) {
      const S = SKILLS[act.active];
      const hit = avgHit(c, S.mul) * (S.crit ? statsOf(c).critMul / (1 + statsOf(c).crit * (statsOf(c).critMul - 1)) : 1);
      const n = S.r > 0 ? Math.min(alive.length, S.r >= 4 ? 4 : 3) : 1;
      for (const m of alive.slice(0, n)) m.hp -= hit;
      skillReady = t + S.cd;
    }
    // ataque normal no primeiro vivo (com explosão do cajado em mais 1–2 próximos)
    const target = mobs.find((m) => m.hp > 0);
    if (target) {
      const per = avgHit(c) * (dt / attackCooldown(c));
      target.hp -= per;
      if (w.style === 'magic') for (const m of mobs.filter((x) => x.hp > 0 && x !== target).slice(0, 2)) m.hp -= per * splashOf(c).pct;
    }
    if (t >= approach) for (const m of mobs) if (m.hp > 0) taken += mobDps(m.t, c) * dt * (1 - kite);
    // chefes arremessam (pedra/dinamite) em quem está longe; metade das vezes o jogador desvia do círculo
    for (const m of mobs) {
      const T = TYPES[m.t].throw;
      if (m.hp > 0 && T && range) taken += ((T.dmg * (1 - damageReduction(defenseOf(c)))) / T.cd) * dt * 0.5;
    }
    t += dt;
  }
  return { time: t, taken };
}

// ---------------------------------------------------------------- relatório
const CLS = ['guerreiro', 'cacador', 'arcanista', 'ladino'];
const out = [];
const log = (s = '') => out.push(s);

log('== Curva de XP ==');
let cum = 0;
const cumXp = { 1: 0 };
for (let l = 1; l < 15; l++) { cum += xpToNext(l); cumXp[l + 1] = cum; }
log([2, 3, 4, 5, 6, 8, 10, 12].map((l) => `Nv${l}: ${cumXp[l]}`).join(' · '));

// nível ao chegar em cada etapa: XP das missões + abates no caminho (estimativa: ~2x os abates pedidos, em volta)
{
  let xp = 0; const lv = () => { let l = 1; while (cumXp[l + 1] <= xp) l++; return l; };
  const stages = [];
  const path = [['slimes', 'slime', 10], ['goblins', 'goblin', 10], ['golem', 'skeleton', 12], ['mina', 'cave_goblin', 0]];
  for (const [qid, farm, n] of path) {
    const q = QUESTS.find((x) => x.id === qid);
    stages.push(`${qid}: chega no Nv${lv()}`);
    xp += n * TYPES[farm].xp + q.count * TYPES[q.target].xp + q.reward.xp;
    if (qid === 'golem') { stages.push(`biomas antes da mina: Nv${lv()}`); xp += 6 * TYPES.spider.xp + 6 * TYPES.zombie.xp + 4 * TYPES.cave_goblin.xp; }
  }
  stages.push(`depois do chefe da mina: Nv${lv()}`);
  log('Progressão típica (missões + abates no caminho): ' + stages.join(' · '));
}

log('\n== DPS em alvo único (com crítico) / vida / defesa ==');
log(`${pad('classe', 11)}${[3, 5, 8, 12].map((l) => pad(`Nv${l} dps|vida|def`, 21)).join('')}`);
for (const k of ['nenhuma', ...CLS]) {
  log(pad(k, 11) + [3, 5, 8, 12].map((l) => { const c = makeChar(k, l); return pad(`${r1(dps(c))} | ${c.maxHp} | ${defenseOf(c)}`, 21); }).join(''));
}

log('\n== Um contra um: segundos para matar / % da vida perdida (Nv típico da área) ==');
// nível em que o jogador normalmente encontra cada monstro (missões 1→4)
const duel = [['slime', 2], ['goblin', 3], ['spider', 5], ['skeleton', 5], ['cave_goblin', 6], ['zombie', 6], ['golem', 5], ['golem', 6], ['goblin_boss', 7], ['goblin_boss', 8], ['goblin_boss', 10]];
log(pad('monstro (nv)', 20) + CLS.map((k) => pad(k, 18)).join(''));
for (const [t, l] of duel) {
  log(pad(`${t} (${l})`, 20) + CLS.map((k) => { const c = makeChar(k, l); const f = fight(c, [t]); return pad(`${r1(f.time)}s ${Math.round((f.taken / c.maxHp) * 100)}%`, 18); }).join(''));
}

log('\n== Salas da mina (todos atacam juntos) — % da vida perdida por sala ==');
const rooms = {};
for (const m of MINE_SPAWNS) {
  const room = MINE_ROOM_CENTERS.reduce((a, b) => (Math.hypot(b.x - m.x, b.z - m.z) < Math.hypot(a.x - m.x, a.z - m.z) ? b : a));
  (rooms[room.id] ||= []).push(m.type);
}
for (const l of [6, 7, 8, 10]) {
  log(`-- nível ${l} --`);
  for (const k of CLS) {
    const c = makeChar(k, l);
    let total = 0;
    const cells = Object.entries(rooms).map(([id, g]) => {
      // sala do chefe: os capangas primeiro, depois o chefe
      const f = fight(c, g);
      total += f.taken;
      return `${id}:${Math.round((f.taken / c.maxHp) * 100)}%`;
    });
    const potions = Math.ceil(Math.max(0, total - c.maxHp) / (c.maxHp * 0.5));
    log(`${pad(k, 10)} ${cells.join(' ')}  | total ${Math.round(total)} de dano = ${r1(total / c.maxHp)}x a vida (~${potions} poções)`);
  }
}

log('\n== Economia ==');
const avg = (g) => (g[0] + g[1]) / 2;
for (const t of Object.keys(TYPES)) {
  const T = TYPES[t];
  log(`${pad(t, 12)} ouro médio ${lpad(avg(T.gold), 6)} · xp ${lpad(T.xp, 4)} · ouro/xp ${r1(avg(T.gold) / T.xp)}`);
}
const mineGold = MINE_SPAWNS.reduce((s, m) => s + avg(TYPES[m.type].gold), 0);
const mineXp = MINE_SPAWNS.reduce((s, m) => s + TYPES[m.type].xp, 0);
const chestGold = [1, 2, 2, 2, 2, 3].reduce((s, tr) => s + avg(TREASURE_LOOT[tr].gold), 0);
log(`Mina inteira: ${MINE_SPAWNS.length} monstros = ${mineGold} ouro + ${mineXp} xp; + 6 baús ≈ ${chestGold} ouro e ~${[1, 2, 2, 2, 2, 3].reduce((s, tr) => s + avg(TREASURE_LOOT[tr].items) + (TREASURE_LOOT[tr].guaranteedRare ? 1 : 0), 0)} itens`);
log(`Missões: ${QUESTS.map((q) => `${q.id} ${q.reward.gold}g/${q.reward.xp}xp`).join(' · ')}`);
const kit = (l) => { const g = GEAR.find((x) => l <= x.upTo); const w = WEAPON.guerreiro[g.tier]; return [w, g.armor, g.helmet].filter(Boolean).reduce((s, id) => s + (ITEMS[id].price || 0), 0); };
log(`Custo do kit da faixa (arma+armadura+elmo): Nv3-4 ${kit(3)} · Nv5-7 ${kit(5)} · Nv8-10 ${kit(8)} · Nv11+ ${kit(11)}`);

log('\n== Morte (perde tudo o que carrega + % progressiva do ouro na mão) ==');
for (const l of [4, 7, 10]) {
  const k = kit(l);
  log(`Nv${l}: kit carregado vale ${k} ouro (revenda ${Math.round(k * 0.4)}). Com 300 de ouro na mão: mortes 1/2/3 custam ${[1, 2, 3].map((n) => Math.floor(300 * 0.1 * n)).join('/')} de ouro`);
}

console.log(out.join('\n'));
