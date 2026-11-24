// Missões em sequência. giver = quem dá e recebe a missão (NPCS em worldData; padrão: elder).
// where = destino mostrado com ★ no minimapa. Recompensas: items = { itemId: quantidade }.
export const QUESTS = [
  {
    id: 'slimes', title: 'Praga de Slimes', target: 'slime', count: 5,
    where: { x: -35, z: -35, label: 'Floresta Sombria' },
    intro: 'Ah, um aventureiro! Os slimes da Floresta Sombria estão devorando nossas plantações. Derrote 5 deles e eu te recompenso.',
    progressText: (n, c) => `Slimes derrotados: ${n}/${c}`,
    doneText: 'Excelente! A floresta já parece mais tranquila. Tome, esta armadura de couro vai te proteger lá fora.',
    reward: { xp: 60, gold: 30, items: { potion: 2, leather_armor: 1 } },
  },
  {
    id: 'goblins', title: 'Acampamento Goblin', target: 'goblin', count: 4,
    where: { x: 65, z: -15, label: 'Acampamento Goblin' },
    intro: 'Goblins montaram um acampamento a leste e estão roubando nossos mercadores. Derrote 4 deles. Cuidado, eles batem forte!',
    progressText: (n, c) => `Goblins derrotados: ${n}/${c}`,
    doneText: 'Você é mais forte do que parece! Tome, esta espada era do meu avô.',
    reward: { xp: 180, gold: 80, items: { iron_sword: 1 } },
  },
  {
    id: 'golem', title: 'O Golem Antigo', target: 'golem', count: 1,
    where: { x: 0, z: -95, label: 'Ruínas Antigas' },
    intro: 'Um Golem Antigo despertou nas ruínas ao sul. É ele quem atrai os monstros para cá. Só um herói pode detê-lo. Leve poções!',
    progressText: (n, c) => `Golem derrotado: ${n}/${c}`,
    doneText: 'Inacreditável... você derrotou o Golem! A Vila Pedraverde te deve tudo, herói.',
    reward: { xp: 600, gold: 300, items: { big_potion: 3, potion: 3, scroll_return: 1 } },
  },
  {
    id: 'mina', title: 'A Mina Abandonada', target: 'goblin_boss', count: 1,
    where: { x: -146, z: -96, label: 'Mina Abandonada (Pedreira)' },
    intro: 'Os mineiros sumiram na mina da Pedreira, a noroeste. Dizem que um Goblin Minerador enorme tomou conta dos túneis, com aranhas, esqueletos e mortos-vivos. Entre, sobreviva ao escuro e derrote-o. Guarde seus itens em casa antes: quem cai lá dentro perde tudo o que carrega! Lembra do Pergaminho de Retorno que te dei? Se a coisa apertar, leia e volte para a vila (tecla 3).',
    progressText: (n, c) => `Goblin Minerador derrotado: ${n}/${c}`,
    doneText: 'Você voltou da mina! Os mineiros vão poder trabalhar de novo. Chegou um mensageiro do Castelo de Pedralta, ao norte: a Capitã Helena procura um herói como você. Vá falar com ela.',
    reward: { xp: 900, gold: 400, items: { big_potion: 4, scroll_return: 2 } },
  },
  // ---------- Castelo de Pedralta (Capitã Helena) ----------
  {
    id: 'lobos', giver: 'captain', title: 'Lobos do Planalto', target: 'wolf', count: 8,
    where: { x: 108, z: -212, label: 'Covil dos Lobos (leste do castelo)' },
    intro: 'Então você é o herói da Vila Pedraverde. Ótimo. Uma alcateia de Lobos Cinzentos está atacando nossas patrulhas no planalto, a leste das muralhas. Eles são rápidos e vêm em bando. Derrote 8 deles.',
    progressText: (n, c) => `Lobos derrotados: ${n}/${c}`,
    doneText: 'Bom trabalho. As patrulhas voltaram inteiras. O Ferreiro Duarte, aqui no pátio, vende o mesmo que a Mercadora Lia, e a fonte do castelo cura como o poço da vila.',
    reward: { xp: 1300, gold: 350, items: { big_potion: 3, scroll_shield: 2 } },
  },
  {
    id: 'fantasmas', giver: 'captain', title: 'Os Mortos Não Descansam', target: 'ghost', count: 8,
    where: { x: 60, z: 164, label: 'Ruínas Amaldiçoadas (sudeste)' },
    intro: 'Algo pior que lobos: o velho cemitério ao sudeste, que agora chamam de Ruínas Amaldiçoadas, está cheio de fantasmas. Eles atravessam a noite gritando. Derrote 8 fantasmas e descubra o que os acordou.',
    progressText: (n, c) => `Fantasmas derrotados: ${n}/${c}`,
    doneText: 'Uma Rainha Espectral? Então é ela quem prende as almas no cemitério... Descanse e prepare-se. Você vai precisar enfrentá-la.',
    reward: { xp: 1700, gold: 450, items: { big_potion: 3, scroll_haste: 2 } },
  },
  {
    id: 'rainha', giver: 'captain', title: 'A Rainha Espectral', target: 'banshee', count: 1,
    where: { x: 60, z: 154, label: 'Cripta das Ruínas Amaldiçoadas' },
    intro: 'A Rainha Espectral flutua diante da cripta, no centro das ruínas. O grito dela atravessa armaduras: quando o chão brilhar, saia de perto! Derrote-a e liberte as almas.',
    progressText: (n, c) => `Rainha Espectral derrotada: ${n}/${c}`,
    doneText: 'As almas se foram... mas antes de sumir, a Rainha falou de um mestre: o Necromante, na torre negra no fim das terras amaldiçoadas. É ele quem desperta os mortos.',
    reward: { xp: 2400, gold: 650, items: { big_potion: 4, scroll_fury: 2, scroll_return: 2 } },
  },
  {
    id: 'torre', giver: 'captain', title: 'A Torre do Necromante', target: 'necromancer', count: 1,
    where: { x: -9, z: 251, label: 'Torre do Necromante (extremo sul)' },
    intro: 'A Torre do Necromante tem quatro andares: o Salão dos Ossos, a Biblioteca Proibida, a Câmara das Gárgulas e o topo, onde ele espera. Cultistas lançam feitiços de longe; as gárgulas são duras como pedra. Suba, andar por andar, e acabe com isso.',
    progressText: (n, c) => `Necromante derrotado: ${n}/${c}`,
    doneText: 'A torre caiu em silêncio. O reino inteiro vai cantar o seu nome, herói. Leve isto como prova da gratidão do Castelo de Pedralta.',
    reward: { xp: 3500, gold: 1200, items: { big_potion: 5, rune_armor: 1 } },
  },
];
