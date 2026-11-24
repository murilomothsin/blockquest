// Classes, árvore de habilidades e habilidades ativas (dados puros, usados pelo navegador e pelo servidor).
// Inspiração: Tormenta20 (Guerreiro, Caçador, Arcanista, Ladino) e D&D 5e (Fighter, Ranger, Wizard, Rogue).

export const CLASS_LEVEL = 2; // nível em que o jogador escolhe a classe
export const RESPEC_COST = (level) => 25 * level; // redistribuir pontos com o Ancião

export const CLASSES = {
  guerreiro: {
    name: 'Guerreiro', icon: '🛡️', color: '#e8574a', weapon: 'Espadas',
    from: 'Guerreiro (Tormenta20) · Fighter (D&D)',
    desc: 'Linha de frente. Mais vida e defesa, e golpes de espada mais fortes. Segura os monstros enquanto o grupo ataca.',
    base: { hpMul: 0.2, def: 3, dmg: { melee: 0.1 } }, // valores somam aos atributos base (hpMul 0.2 = +20%)
    passive: '+20% vida · +3 defesa · +10% dano corpo a corpo',
    starter: 'leather_armor', // presente ao escolher a classe (o guerreiro já tem espada)
  },
  cacador: {
    name: 'Caçador', icon: '🏹', color: '#5fc26a', weapon: 'Arcos',
    from: 'Caçador (Tormenta20) · Ranger (D&D)',
    desc: 'Especialista em arcos. Mais dano e alcance à distância, perfeito para derrubar quem se aproxima.',
    base: { dmg: { ranged: 0.15 }, range: 4 },
    passive: '+15% dano à distância · +4 m de alcance',
    starter: 'short_bow',
  },
  arcanista: {
    name: 'Arcanista', icon: '🔮', color: '#9b6bff', weapon: 'Cajados',
    from: 'Arcanista (Tormenta20) · Wizard/Sorcerer (D&D)',
    desc: 'Magia em área com cajados. Frágil, mas cada disparo explode e atinge grupos de monstros.',
    base: { hpMul: -0.1, dmg: { magic: 0.2 }, splashR: 1.2, splashPct: 0.25 },
    passive: '−10% vida · +20% dano mágico · explosões maiores (+1,2 m, +25% de dano em área)',
    starter: 'apprentice_staff',
  },
  ladino: {
    name: 'Ladino', icon: '🗡️', color: '#ffc94a', weapon: 'Adagas',
    from: 'Ladino (Tormenta20) · Rogue (D&D)',
    desc: 'Rápido e preciso. Esquiva de golpes, mais críticos e mais velocidade para entrar e sair do combate.',
    base: { crit: 0.1, cdMul: { melee: 0.9 }, speed: 0.1, dodge: 0.15 },
    passive: '+15% esquiva · +10% crítico · golpes 10% mais rápidos · +10% velocidade',
    starter: 'iron_dagger',
  },
};
export const CLASS_IDS = Object.keys(CLASSES);

/**
 * Habilidades ativas (tecla G). O servidor resolve quem é atingido.
 *  area: 'self' = em volta do jogador, 'target' = em volta do alvo (precisa de alvo no alcance)
 */
export const SKILLS = {
  giro: { name: 'Golpe Giratório', icon: '🌀', cd: 8, area: 'self', r: 4, mul: 1.6, desc: 'Acerta todos os monstros em volta (4 m) com 160% do dano.' },
  chuva: { name: 'Chuva de Flechas', icon: '🌧️', cd: 10, area: 'target', r: 5, mul: 1.3, needs: 'ranged', desc: 'Flechas caem numa área de 5 m em volta do alvo (130%).' },
  bola: { name: 'Bola de Fogo', icon: '🔥', cd: 9, area: 'target', r: 4.5, mul: 2.0, needs: 'magic', desc: 'Explosão de 4,5 m em volta do alvo (200%).' },
  furtivo: { name: 'Golpe Furtivo', icon: '🗡️', cd: 7, area: 'target', r: 0, mul: 1.5, reach: 4.5, crit: true, needs: 'melee', desc: 'Golpe crítico garantido no alvo a até 4,5 m (300%).' },
};

/**
 * Árvore de cada classe: 5 nós. 1 ponto por nível a partir do 2 (nível 13 = árvore completa).
 * eff soma nos atributos por ponto. req = pré-requisito { nó: pontos }.
 */
export const TREES = {
  guerreiro: [
    { id: 'g_pele', name: 'Pele de Ferro', icon: '🪨', max: 3, eff: { def: 2 }, desc: '+2 de defesa por ponto' },
    { id: 'g_vigor', name: 'Vigor', icon: '❤️', max: 3, eff: { hpMul: 0.06 }, desc: '+6% de vida máxima por ponto' },
    { id: 'g_forca', name: 'Braço Forte', icon: '💪', max: 3, eff: { dmg: { melee: 0.05 } }, desc: '+5% de dano corpo a corpo por ponto' },
    { id: 'g_giro', name: 'Golpe Giratório', icon: '🌀', max: 1, active: 'giro', req: { g_forca: 1 }, desc: SKILLS.giro.desc },
    { id: 'g_furia', name: 'Fúria', icon: '🔥', max: 2, eff: { crit: 0.04 }, req: { g_giro: 1 }, desc: '+4% de chance de crítico por ponto' },
  ],
  cacador: [
    { id: 'c_mira', name: 'Mira Firme', icon: '🎯', max: 3, eff: { dmg: { ranged: 0.05 } }, desc: '+5% de dano à distância por ponto' },
    { id: 'c_olho', name: 'Olho de Águia', icon: '🦅', max: 3, eff: { range: 2 }, desc: '+2 m de alcance por ponto' },
    { id: 'c_couro', name: 'Couro Curtido', icon: '🦺', max: 3, eff: { def: 1, hpMul: 0.03 }, desc: '+1 defesa e +3% de vida por ponto' },
    { id: 'c_chuva', name: 'Chuva de Flechas', icon: '🌧️', max: 1, active: 'chuva', req: { c_mira: 1 }, desc: SKILLS.chuva.desc },
    { id: 'c_letal', name: 'Tiro Letal', icon: '💥', max: 2, eff: { crit: 0.05 }, req: { c_chuva: 1 }, desc: '+5% de chance de crítico por ponto' },
  ],
  arcanista: [
    { id: 'a_poder', name: 'Poder Arcano', icon: '✨', max: 3, eff: { dmg: { magic: 0.06 } }, desc: '+6% de dano mágico por ponto' },
    { id: 'a_eco', name: 'Eco Arcano', icon: '💫', max: 3, eff: { splashR: 0.4, splashPct: 0.05 }, desc: '+0,4 m de explosão e +5% de dano em área por ponto' },
    { id: 'a_escudo', name: 'Escudo Arcano', icon: '🔰', max: 3, eff: { def: 2 }, desc: '+2 de defesa por ponto' },
    { id: 'a_bola', name: 'Bola de Fogo', icon: '🔥', max: 1, active: 'bola', req: { a_poder: 1 }, desc: SKILLS.bola.desc },
    { id: 'a_foco', name: 'Foco Mental', icon: '🧠', max: 2, eff: { cdMul: { magic: -0.08 } }, req: { a_bola: 1 }, desc: 'Disparos 8% mais rápidos por ponto' },
  ],
  ladino: [
    { id: 'l_lamina', name: 'Lâmina Afiada', icon: '🔪', max: 3, eff: { dmg: { melee: 0.05 } }, desc: '+5% de dano corpo a corpo por ponto' },
    { id: 'l_agil', name: 'Reflexos', icon: '💨', max: 3, eff: { speed: 0.03, dodge: 0.05 }, desc: '+5% de esquiva e +3% de velocidade por ponto' },
    { id: 'l_ponto', name: 'Ponto Fraco', icon: '🎯', max: 3, eff: { crit: 0.04 }, desc: '+4% de chance de crítico por ponto' },
    { id: 'l_furtivo', name: 'Golpe Furtivo', icon: '🗡️', max: 1, active: 'furtivo', req: { l_ponto: 1 }, desc: SKILLS.furtivo.desc },
    { id: 'l_veneno', name: 'Lâminas Envenenadas', icon: '🧪', max: 2, eff: { critMul: 0.25 }, req: { l_furtivo: 1 }, desc: 'Críticos causam +25% de dano por ponto' },
  ],
};

export const skillPointsTotal = (level) => Math.max(0, level - 1);
export const skillPointsSpent = (c) => Object.values(c.skills || {}).reduce((s, n) => s + n, 0);
export const skillPointsFree = (c) => (c.cls ? skillPointsTotal(c.level) - skillPointsSpent(c) : 0);
export const nodeOf = (cls, id) => (TREES[cls] || []).find((n) => n.id === id);
/** habilidade ativa liberada (ou null) */
export const activeSkillOf = (c) => {
  for (const n of TREES[c.cls] || []) if (n.active && (c.skills?.[n.id] || 0) > 0) return n.active;
  return null;
};

/** pode colocar mais um ponto nesse nó? Retorna null se pode, ou o motivo */
export function canRaise(c, id) {
  const n = nodeOf(c.cls, id);
  if (!n) return 'Habilidade inválida.';
  if (skillPointsFree(c) <= 0) return 'Sem pontos livres. Você ganha 1 ponto por nível.';
  if ((c.skills?.[id] || 0) >= n.max) return 'Já está no máximo.';
  for (const [rid, need] of Object.entries(n.req || {})) {
    if ((c.skills?.[rid] || 0) < need) return `Precisa de ${nodeOf(c.cls, rid).name} primeiro.`;
  }
  return null;
}

/**
 * Atributos finais do personagem (classe + pontos da árvore).
 * Tudo que depende de classe/habilidades passa por aqui: vida, defesa, dano, crítico, alcance, velocidade.
 */
export function statsOf(c) {
  const s = {
    hpMul: 1, def: 0, dmg: { melee: 1, ranged: 1, magic: 1 }, crit: 0.15, critMul: 2, range: 0,
    cdMul: { melee: 1, ranged: 1, magic: 1 }, splashR: 0, splashPct: 0, speed: 1, dodge: 0,
  };
  const add = (eff, k = 1) => {
    if (!eff) return;
    if (eff.hpMul) s.hpMul += eff.hpMul * k;
    if (eff.def) s.def += eff.def * k;
    if (eff.crit) s.crit += eff.crit * k;
    if (eff.critMul) s.critMul += eff.critMul * k;
    if (eff.range) s.range += eff.range * k;
    if (eff.splashR) s.splashR += eff.splashR * k;
    if (eff.splashPct) s.splashPct += eff.splashPct * k;
    if (eff.speed) s.speed += eff.speed * k;
    if (eff.dodge) s.dodge += eff.dodge * k;
    for (const st of ['melee', 'ranged', 'magic']) {
      if (eff.dmg?.[st]) s.dmg[st] += eff.dmg[st] * k;
      if (eff.cdMul?.[st]) s.cdMul[st] *= 1 + eff.cdMul[st] * k;
    }
  };
  const cl = CLASSES[c.cls];
  if (cl) {
    const b = cl.base;
    add({ ...b, cdMul: undefined });
    for (const st of ['melee', 'ranged', 'magic']) if (b.cdMul?.[st]) s.cdMul[st] *= b.cdMul[st];
    for (const n of TREES[c.cls]) add(n.eff, c.skills?.[n.id] || 0);
  }
  return s;
}
