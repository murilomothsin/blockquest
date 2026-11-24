# BlockQuest RPG

Jogo de RPG 3D de navegador, multiplayer, com estética blocada estilo Roblox. Three.js + Vite no cliente, Node + WebSocket + SQLite no servidor.

## Rodar

Requer **Node 22.13+** (usa o `node:sqlite` nativo, sem dependência nativa).

```bash
npm install
npm run dev        # servidor do jogo (3001) + Vite (5173) juntos → http://localhost:5173
```

Produção (um único processo serve o jogo, a API e o WebSocket):

```bash
npm run build
npm start          # http://localhost:3001  (PORT=8080 npm start para outra porta)
```

Outros scripts: `npm run dev:client` (só Vite), `npm run dev:server` (só servidor, com reload).
O banco fica em `server/data/blockquest.db` (fora do git). Use `DB_PATH=/caminho/arquivo.db` para mudar.

## Multiplayer e contas

- Ao abrir o jogo aparece a tela de **Entrar / Criar conta**. Também dá para **jogar offline** (progresso no navegador).
- Usuário: 3–16 caracteres (letras, números, `_`), sem diferenciar maiúsculas. Senha: mínimo 6. Senhas são guardadas com **scrypt** + salt; o login gera um token de sessão (30 dias) salvo no navegador.
- Ao criar conta, dá para **levar o progresso offline** para a conta nova.
- O progresso (nível, ouro, inventário, missões, posição) fica **no servidor**, por conta.
- Online você vê os outros jogadores (nome em cima da cabeça, movimento, golpes, arma, armadura e capacete) e os pontos azuis no minimapa.
- Se a mesma conta entrar em outro lugar, a sessão antiga é desconectada.

### Chat

Aperte **Enter** para escrever. A mensagem aparece no chat de todos e num **balão em cima da cabeça** de quem falou.

| Comando | O que faz |
|---|---|
| `/w nome mensagem` | Mensagem privada (sussurro). Só você e a pessoa veem |
| `/r mensagem` | Responde o último sussurro recebido |
| `/ignorar nome` | Para de mostrar as mensagens dessa pessoa (salvo no navegador) |
| `/designorar nome` | Volta a mostrar |
| `/online` | Lista quem está online |
| `/ajuda` | Lista os comandos |

### Como funciona

```
cliente ──HTTP──▶ /api/register | /api/login | /api/me | /api/logout | /api/online
cliente ◀──WS──▶ /ws   hello(token) → welcome | state (10/s) → snap (10/s) | chat | save | join/leave
```

**Limitações desta primeira etapa:** monstros, drops e missões ainda rodam em cada cliente. Cada jogador vê os próprios monstros, e o progresso é enviado pelo cliente (o servidor valida tipos e limites, mas não é anti-cheat). Próximo passo: servidor autoritativo para monstros, dano e loot, para lutar junto contra o mesmo inimigo.

## Controles (padrão)

Todos os controles de ação podem ser remapeados no jogo (painel **Controles → ⚙️ Personalizar**), com até 2 teclas por ação, incluindo botões do mouse. WASD/setas, Enter, Esc e o botão direito (câmera) são fixos.

| Ação | Tecla |
|---|---|
| Mover | WASD / setas |
| Correr | Shift |
| Pular | Espaço |
| Atacar | Clique esquerdo ou F |
| Travar alvo | Clicar no inimigo, ou Tab para alternar |
| Câmera | Botão direito + arrastar, Q/R, scroll pra zoom |
| Falar / loja / beber no poço | E |
| Poção / Poção grande | 1 / 2 |
| Inventário | I |
| Chat (online) | Enter |
| Som liga/desliga | M |
| Mostrar/ocultar controles | H |
| Soltar alvo / fechar janela | Esc |

## Mecânicas

- **Mira:** assistida, com anel amarelo no alvo automático do arco e anel vermelho no alvo travado (clique ou Tab). As flechas fazem uma leve curva até o alvo travado.
- **Vida:** não regenera sozinha. Recupera só com **poções** ou **bebendo no poço da vila** (E). Inimigos regeneram devagar (2%/s) depois de 12 s sem levar dano.
- **Zona segura:** círculo de 32 m em volta da vila (marcado no chão). Monstros não entram e nada aparece ali.
- **Encontros selvagens (estilo Pokémon):** andando no meio das árvores, fora da vila e das estradas, de vez em quando um goblin pula do mato (com "!"). No máximo 2 ao mesmo tempo, com intervalo mínimo de 15 s. Configurável em `WILD` (`src/enemies.js`).
- **Golem Antigo:** se você fica a mais de 8 m, ele arremessa pedras. Uma área vermelha marca onde a pedra vai cair, e dá pra desviar.
- **Drops:** a cada 5 inimigos derrotados cai um baú (poção, arma ou armadura). O chefe sempre deixa um equipamento raro.
- **Armaduras e capacetes:** 5 tiers com as mesmas cores das armas (couro, ferro, aço, rúnico e élfico, este só caindo de monstros). A defesa da armadura e do capacete soma, e cada ponto reduz o dano em %, com retorno decrescente: `def / (def + 25)`. Ferro completo (10) bloqueia 29%; rúnico completo (27), 52%. A primeira missão dá uma Armadura de Couro.
- **Limite do mapa:** círculo de 140 m, cercado por montanhas.

## Sons

Todos os sons são sintetizados com Web Audio (`src/audio.js`), com volume e pan pela posição. Para usar arquivos de verdade, coloque os áudios em `public/sounds/` e mapeie em `public/sounds/sounds.json`, por exemplo `{ "swing": "espada.mp3" }`. A lista de nomes está no próprio json.

## Estrutura

```
server/
  index.js       HTTP (API + arquivos do build) e WebSocket (presença, snapshots, chat, saves)
  auth.js        contas (scrypt), sessões, validação dos saves
  db.js          SQLite (node:sqlite): users, sessions, characters
src/
  main.js        loop, jogador, câmera, NPCs, mira, itens, integração online
  net/           session.js (login), net.js (WebSocket), remote.js (outros jogadores)
  world.js       mapa, zonas, zona segura, mato, colisão, limite
  character.js   modelo blocado (espada/arco) + animação
  enemies.js     tipos, spawns, IA, arremesso do golem, encontros selvagens
  combat.js      flechas
  loot.js        baús de drop
  items.js       catálogo de itens, loja, tabela de drop
  quests.js      missões
  audio.js       sons sintetizados / arquivos opcionais
  ui.js          HUD, loja, inventário, remapeamento, chat, minimapa
  input.js       teclado/mouse com bindings configuráveis
```

## Próximos passos

- Servidor autoritativo para monstros, dano e loot (combate cooperativo de verdade)
- Grupos (party) com XP compartilhado, e troca de itens entre jogadores
- Classes (guerreiro / mago / arqueiro) e habilidades
- Personalização do avatar (cores e acessórios salvos na conta)
- Deploy (ex.: Fly.io, Railway ou VPS) com HTTPS/WSS
