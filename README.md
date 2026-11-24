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
| `/denunciar nome` | Abre a janela de denúncia |
| `/online` | Lista quem está online |
| `/ajuda` | Lista os comandos |

**Clicar no nome** de alguém no chat abre um menu: Sussurrar, Ignorar ou Denunciar.

### Moderação

- **Filtro de palavrões no servidor** (`server/filter.js`): troca a palavra por `*****` e pega variações como acentos, letras repetidas (`porraaa`), números no lugar de letras (`p0rr4`) e letras separadas (`p o r r a`). Vale para o chat geral e para os sussurros. Para ampliar, acrescente raízes em `ROOTS`/`EXACT` e exceções em `ALLOW` (ex.: `picanha`, `computador`).
- **Silêncio automático:** 3 palavrões em 1 minuto deixam a pessoa 60 s sem poder escrever.
- **Nomes ofensivos** são recusados no cadastro.
- **Denúncias:** a janela tem motivo (ofensa, assédio, spam, trapaça, nome, outro) e um comentário opcional. O servidor anexa as **últimas 20 mensagens originais** do denunciado (antes do filtro), então a prova não pode ser forjada pelo cliente. Limites: 1 denúncia por pessoa a cada 10 min e 10 por hora.
- Para ver as denúncias: `npm run denuncias` (abertas), `npm run denuncias -- todas`, `npm run denuncias -- resolver <id>`.

### Como funciona

```
cliente ──HTTP──▶ /api/register | /api/login | /api/me | /api/logout | /api/online
cliente ◀──WS──▶ /ws   hello(token) → welcome | state (10/s) → snap (10/s) | chat | save | join/leave
                        hit(ids) → mobs (10/s) | mev (eventos: golpe, morte, pedra, encontro) | hurt | report
```

**Monstros no servidor (online):** o servidor roda a IA de todos os monstros a 20 Hz (`server/game.js`), então todo mundo vê e enfrenta **os mesmos monstros**. O cliente só diz "acertei o monstro X". O servidor confere a arma, a distância e o tempo entre golpes, e só então **rola o dano**. Golpes de longe ou rápidos demais são ignorados. Quem bateu no monstro nos últimos 30 s **ganha o abate** (ouro, XP, progresso de missão). Cada jogador recebe só os monstros a até 110 m.

A IA é um único código (`src/shared/mobs.js`) que roda no servidor (online) e no navegador (offline). O mapa também é compartilhado (`src/shared/worldData.js`, gerado com a mesma semente), então as colisões e o "mato" batem nos dois lados.

**Ainda confiado ao cliente:** a posição do jogador, o nível (usado no cálculo de dano), o ouro, o inventário e os drops dos baús. Próximo passo anti-trapaça: mover XP, ouro e drops para o servidor.

Testes automáticos com o servidor rodando: `npm run test:mobs` e `node scripts/test-chat.mjs`.

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
- **Encontros selvagens (estilo Pokémon):** andando no meio das árvores, fora da vila e das estradas, de vez em quando um goblin pula do mato (com "!"). No máximo 2 por jogador, com intervalo mínimo de 15 s. Online, outros jogadores por perto também veem e podem ajudar. Configurável em `WILD` (`src/shared/mobs.js`).
- **Golem Antigo:** se você fica a mais de 8 m, ele arremessa pedras. Uma área vermelha marca onde a pedra vai cair, e dá pra desviar.
- **Drops:** a cada 5 inimigos derrotados cai um baú (poção, arma ou armadura). O chefe sempre deixa um equipamento raro.
- **Armaduras e capacetes:** 5 tiers com as mesmas cores das armas (couro, ferro, aço, rúnico e élfico, este só caindo de monstros). A defesa da armadura e do capacete soma, e cada ponto reduz o dano em %, com retorno decrescente: `def / (def + 25)`. Ferro completo (10) bloqueia 29%; rúnico completo (27), 52%. A primeira missão dá uma Armadura de Couro.
- **Limite do mapa:** círculo de 140 m, cercado por montanhas.

## Sons

Todos os sons são sintetizados com Web Audio (`src/audio.js`), com volume e pan pela posição. Para usar arquivos de verdade, coloque os áudios em `public/sounds/` e mapeie em `public/sounds/sounds.json`, por exemplo `{ "swing": "espada.mp3" }`. A lista de nomes está no próprio json.

## Estrutura

```
server/
  index.js       HTTP (API + arquivos do build) e WebSocket (presença, snapshots, chat, saves, denúncias)
  game.js        mundo autoritativo: roda a IA dos monstros, valida golpes, distribui eventos
  filter.js      filtro de palavrões (chat e nomes)
  auth.js        contas (scrypt), sessões, validação dos saves
  db.js          SQLite (node:sqlite): users, sessions, characters, reports
scripts/
  dev.js         sobe servidor + Vite
  denuncias.js   lista/resolve denúncias (npm run denuncias)
  test-*.mjs     testes do servidor (monstros e chat)
src/
  shared/        código usado pelo navegador E pelo servidor:
    mobs.js        tipos, spawns, IA, arremesso do golem, encontros selvagens (MobSim)
    worldData.js   layout do mapa com semente, colisão, zona segura, mato
    items.js       catálogo de itens, loja, tabela de drop
  main.js        loop, jogador, câmera, NPCs, mira, itens, integração online
  net/           session.js (login), net.js (WebSocket), remote.js (outros jogadores)
  world.js       desenha o mapa a partir de shared/worldData.js
  character.js   modelo blocado (espada/arco) + animação
  enemies.js     visual dos monstros (MobSim local offline, ou estado do servidor online)
  combat.js      flechas
  loot.js        baús de drop
  quests.js      missões
  audio.js       sons sintetizados / arquivos opcionais
  ui.js          HUD, loja, inventário, remapeamento, chat, minimapa
  input.js       teclado/mouse com bindings configuráveis
```

## Próximos passos

- XP, ouro e drops validados no servidor (anti-trapaça completo)
- Grupos (party) com XP compartilhado, e troca de itens entre jogadores
- Classes (guerreiro / mago / arqueiro) e habilidades
- Personalização do avatar (cores e acessórios salvos na conta)
- Deploy (ex.: Fly.io, Railway ou VPS) com HTTPS/WSS
