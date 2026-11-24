// Recompensas: items = { itemId: quantidade }
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
    reward: { xp: 600, gold: 300, items: { big_potion: 3, potion: 3 } },
  },
  {
    id: 'mina', title: 'A Mina Abandonada', target: 'goblin_boss', count: 1,
    where: { x: -146, z: -96, label: 'Mina Abandonada (Pedreira)' },
    intro: 'Os mineiros sumiram na mina da Pedreira, a noroeste. Dizem que um Goblin Minerador enorme tomou conta dos túneis, com aranhas, esqueletos e mortos-vivos. Entre, sobreviva ao escuro e derrote-o. Guarde seus itens em casa antes: quem cai lá dentro perde tudo o que carrega!',
    progressText: (n, c) => `Goblin Minerador derrotado: ${n}/${c}`,
    doneText: 'Você voltou da mina! Os mineiros vão poder trabalhar de novo. Tome, isto vai ajudar nas próximas aventuras.',
    reward: { xp: 900, gold: 400, items: { big_potion: 4 } },
  },
];
