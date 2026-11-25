// Configurações do jogo editáveis pelo painel admin (multiplicadores de XP, ouro, monstros...).
// Valem nas regras compartilhadas: online o servidor aplica (é a fonte da verdade); offline o navegador
// usa as mesmas que o servidor publicou em /api/config.

/** definição de cada campo: rótulo em pt-BR, limites e padrão */
export const SETTING_DEFS = {
  xpMul: { label: 'XP ganho (multiplicador)', min: 0.1, max: 10, step: 0.1, def: 1, hint: '2 = dobro de XP por monstro' },
  goldMul: { label: 'Ouro dos monstros (multiplicador)', min: 0, max: 10, step: 0.1, def: 1 },
  dropEvery: { label: 'Cai um item a cada N abates', min: 1, max: 50, step: 1, def: 5, int: true },
  mobHpMul: { label: 'Vida dos monstros (multiplicador)', min: 0.1, max: 10, step: 0.1, def: 1, hint: 'os monstros vivos ajustam na hora, mantendo a % de vida' },
  mobDmgMul: { label: 'Dano dos monstros (multiplicador)', min: 0, max: 10, step: 0.1, def: 1 },
  respawnMul: { label: 'Tempo de respawn (multiplicador)', min: 0.1, max: 10, step: 0.1, def: 1, hint: '2 = monstros demoram o dobro para voltar' },
  deathStep: { label: 'Ouro perdido por morte (% a mais por morte)', min: 0, max: 50, step: 1, def: 10, int: true, hint: '10 = 10%, 20%, 30%... no período de 2 dias' },
  noviceLevel: { label: 'Proteção de novato até o nível', min: 0, max: 20, step: 1, def: 3, int: true, hint: 'até este nível morrer não tira os itens' },
  motd: { label: 'Mensagem ao entrar no jogo', text: true, max: 200, def: '' },
  responsavel: { label: 'Responsável pelo jogo (página de privacidade)', text: true, max: 120, def: '', hint: 'seu nome ou o da empresa (controlador dos dados, LGPD)' },
  contato: { label: 'E-mail de contato para privacidade', text: true, max: 120, def: '', hint: 'onde os jogadores pedem acesso ou exclusão dos dados' },
};

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, d.def]));

/** valores atuais (mutável: o servidor/cliente chamam applySettings) */
export const SETTINGS = { ...DEFAULT_SETTINGS };

/** aceita só campos conhecidos, dentro dos limites */
export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (!s || typeof s !== 'object') return out;
  for (const [k, d] of Object.entries(SETTING_DEFS)) {
    const v = s[k];
    if (d.text) { if (typeof v === 'string') out[k] = v.replace(/\s+/g, ' ').trim().slice(0, d.max); continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const c = Math.max(d.min, Math.min(d.max, n));
    out[k] = d.int ? Math.round(c) : Math.round(c * 100) / 100;
  }
  return out;
}

export function applySettings(s) {
  Object.assign(SETTINGS, sanitizeSettings(s));
  return SETTINGS;
}
