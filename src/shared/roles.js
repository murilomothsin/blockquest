// Cargos de conta: quem é da equipe e o que cada um pode fazer.
// O servidor é quem decide (o cliente usa isto só para mostrar etiquetas e a /ajuda).

export const ROLES = {
  player: { rank: 0, label: 'Jogador', tag: null, color: '#9fe3ff' },
  qa: { rank: 1, label: 'Tester (QA)', tag: 'QA', color: '#4ad7ff' },
  mod: { rank: 2, label: 'Moderador', tag: 'MOD', color: '#5dff8a' },
  admin: { rank: 3, label: 'Admin', tag: 'ADM', color: '#ff6b5d' },
};
export const ROLE_IDS = Object.keys(ROLES);
export const roleOf = (r) => ROLES[r] || ROLES.player;
export const isStaff = (r) => roleOf(r).rank > 0;

/** Permissões por cargo. Admin tem todas. */
const PERMS = {
  qa: ['test', 'staffchat'],
  mod: ['moderate', 'reports', 'announce', 'staffchat'],
  admin: ['test', 'moderate', 'reports', 'announce', 'staffchat', 'roles', 'panel'], // panel = painel /admin
};
export const can = (role, perm) => (PERMS[role] || []).includes(perm);

/** quem age precisa ter cargo MAIOR que o alvo (mod não pune admin nem outro mod) */
export const outranks = (actor, target) => roleOf(actor).rank > roleOf(target).rank;

/** Nome com etiqueta, ex.: "[MOD] Carla" */
export const tagged = (name, role) => (roleOf(role).tag ? `[${roleOf(role).tag}] ${name}` : name);

/**
 * Comandos de chat da equipe. `perm` decide quem vê/usa. O servidor executa.
 * Texto em pt-BR para a /ajuda.
 */
export const STAFF_COMMANDS = [
  { cmd: '/equipe msg', perm: 'staffchat', desc: 'chat só da equipe' },
  { cmd: '/aviso texto', perm: 'announce', desc: 'aviso em destaque para todos' },
  { cmd: '/mutar nome minutos [motivo]', perm: 'moderate', desc: 'silencia no chat' },
  { cmd: '/desmutar nome', perm: 'moderate', desc: 'tira o silêncio' },
  { cmd: '/expulsar nome [motivo]', perm: 'moderate', desc: 'desconecta do jogo' },
  { cmd: '/banir nome horas [motivo]', perm: 'moderate', desc: 'suspende a conta (0 = permanente)' },
  { cmd: '/desbanir nome', perm: 'moderate', desc: 'remove a suspensão' },
  { cmd: '/denuncias', perm: 'reports', desc: 'denúncias abertas' },
  { cmd: '/resolver id', perm: 'reports', desc: 'marca denúncia como resolvida' },
  { cmd: '/tp x z | /tp nome | /tp mina|chefe|porta|casa|castelo|ruinas|torre|andar1..4|necromante', perm: 'test', desc: 'teleporta' },
  { cmd: '/item id [qtd]', perm: 'test', desc: 'ganha um item (/itens lista os ids)' },
  { cmd: '/ouro n', perm: 'test', desc: 'ganha ouro' },
  { cmd: '/xp n', perm: 'test', desc: 'ganha XP' },
  { cmd: '/nivel n', perm: 'test', desc: 'define o nível' },
  { cmd: '/curar', perm: 'test', desc: 'vida cheia' },
  { cmd: '/imortal', perm: 'test', desc: 'liga/desliga não levar dano' },
  { cmd: '/spawn tipo [qtd]', perm: 'test', desc: 'cria monstros perto (slime, goblin, golem, spider, skeleton, zombie, cave_goblin, goblin_boss, wolf, ghost, banshee, cultist, gargoyle, necromancer)' },
  { cmd: '/classe nome', perm: 'test', desc: 'troca de classe na hora (guerreiro, cacador, arcanista, ladino) e zera a árvore' },
  { cmd: '/matar', perm: 'test', desc: 'mata os monstros a até 15 m' },
  { cmd: '/missao n', perm: 'test', desc: 'pula para a missão n (1 a 8)' },
  { cmd: '/cargo nome cargo', perm: 'roles', desc: 'muda o cargo (player, qa, mod, admin)' },
];
