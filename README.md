# BlockQuest RPG

Jogo de RPG 3D de navegador, com estética blocada estilo Roblox. Feito com Three.js + Vite.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

## Controles (padrão)

Todos os controles de ação podem ser remapeados no jogo (painel **Controles → ⚙️ Personalizar**), com até 2 teclas por ação, incluindo botões do mouse. WASD/setas, Esc e o botão direito (câmera) são fixos.

| Ação | Tecla |
|---|---|
| Mover | WASD / setas |
| Correr | Shift |
| Pular | Espaço |
| Atacar | Clique esquerdo ou F |
| Travar alvo | Clicar no inimigo, ou Tab para alternar |
| Câmera | Botão direito + arrastar, Q/R, scroll pra zoom |
| Falar / loja | E |
| Poção / Poção grande | 1 / 2 |
| Inventário | I |
| Mostrar/ocultar controles | H |
| Soltar alvo / fechar janela | Esc |

## Mira

Mira assistida + trava de alvo (estilo MMORPG):
- Com arco, o alvo é escolhido automaticamente: o inimigo mais próximo num cone de ~60° à frente (anel **amarelo**).
- Clicar num inimigo ou apertar Tab trava o alvo (anel **vermelho**). A flecha faz uma leve curva até o alvo travado.
- Sem alvo, a flecha sai reta para frente.

## O que já existe

- Mundo aberto: Vila Pedraverde, Floresta Sombria, Campos do Leste, Acampamento Goblin e Ruínas Antigas
- Personagens blocados animados (andar, pular, golpe de espada, tiro com arco)
- Inimigos com IA (vagar → perseguir → atacar → voltar): Slime, Goblin e o chefe Golem Antigo
- Combate corpo a corpo e à distância, crítico, knockback, números de dano, regeneração e renascimento
- **Armas:** 4 espadas e 3 arcos. O Arco Curto dá o mesmo dano da Espada de Ferro (+8), com 22 m de alcance e cadência de 0,75 s (espada: 0,5 s)
- **Loja** com abas Comprar/Vender, itens agrupados por categoria
- **Inventário** para usar poções e trocar de arma
- **Drops:** a cada 5 inimigos derrotados cai um baú (poção ou arma); o chefe sempre deixa uma arma rara
- XP, níveis, ouro, cadeia de 3 missões, minimapa com ★ do objetivo e 🎁 dos baús
- Save automático no localStorage (`game.reset()` no console zera o progresso)

## Estrutura

```
src/
  main.js        loop, jogador, câmera, NPCs, mira, itens
  world.js       mapa, zonas, cenário e colisão
  character.js   modelo blocado (espada/arco) + animação
  enemies.js     tipos de inimigos, spawns, IA e dano
  combat.js      flechas (projéteis)
  loot.js        baús de drop
  items.js       catálogo de itens, loja, tabela de drop
  quests.js      missões
  ui.js          HUD, loja, inventário, remapeamento, minimapa
  input.js       teclado/mouse com bindings configuráveis
```

## Próximos passos

- Classes (guerreiro / mago / arqueiro) e habilidades
- Armaduras e acessórios
- Multiplayer (WebSocket) para jogar em grupo
- Terreno com relevo, dungeons e ciclo dia/noite
- Personalização do avatar
