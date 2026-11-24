# BlockQuest RPG

Jogo de RPG 3D de navegador, com estética blocada estilo Roblox. Feito com Three.js + Vite.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

## Controles

| Ação | Tecla |
|---|---|
| Mover / correr | WASD / Shift |
| Pular | Espaço |
| Atacar | Clique esquerdo ou F |
| Câmera | Botão direito + arrastar, Q/R, scroll pra zoom |
| Falar com NPC | E |
| Poção | 1 |

## O que já existe

- Mundo aberto: Vila Pedraverde, Floresta Sombria, Campos do Leste, Acampamento Goblin e Ruínas Antigas
- Personagens blocados animados (andar, pular, golpe de espada)
- Inimigos com IA (vagar → perseguir → atacar → voltar): Slime, Goblin e o chefe Golem Antigo
- Combate com crítico, knockback, números de dano, regeneração fora de combate e morte/renascimento
- XP, níveis, ouro, poções, 4 tiers de espada
- NPCs: Ancião Bento (cadeia de 3 missões) e Mercadora Lia (loja)
- HUD, rastreador de missão, minimapa com ★ indicando o objetivo, barra de chefe
- Save automático no localStorage (`game.reset()` no console zera o progresso)

## Estrutura

```
src/
  main.js        loop do jogo, jogador, câmera, NPCs, diálogos
  world.js       mapa, zonas, cenário e colisão
  character.js   modelo blocado + animação
  enemies.js     tipos de inimigos, spawns e IA
  quests.js      missões e armas
  ui.js          HUD, diálogos, minimapa, números flutuantes
  input.js       teclado e mouse
```

## Próximos passos

- Classes (guerreiro / mago / arqueiro) e habilidades
- Inventário e equipamentos
- Multiplayer (WebSocket) para jogar em grupo
- Terreno com relevo, dungeons e ciclo dia/noite
- Personalização do avatar
