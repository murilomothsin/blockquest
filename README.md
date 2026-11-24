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
- O progresso (nível, XP, ouro, inventário, equipamento, vida, missões, posição) fica **no servidor**, por conta, e só o servidor muda esses valores. O progresso offline **não** pode ser levado para uma conta (seria uma porta para trapaça).
- Contas da equipe aparecem com etiqueta colorida em cima da cabeça e no chat: **[ADM]** vermelho, **[MOD]** verde, **[QA]** azul.
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
- Para ver as denúncias: `npm run denuncias` (abertas), `npm run denuncias -- todas`, `npm run denuncias -- resolver <id>`. Moderadores também veem no jogo com `/denuncias`.

### Equipe: cargos

| Cargo | Etiqueta | O que pode |
|---|---|---|
| Jogador | (nenhuma) | jogar |
| Tester (QA) | `[QA]` azul | comandos de teste + chat da equipe |
| Moderador | `[MOD]` verde | mutar, expulsar, banir, ver/resolver denúncias, avisos + chat da equipe |
| Admin | `[ADM]` vermelho | tudo acima + mudar cargos |

**Criar o primeiro admin** (pelo terminal, com a conta já criada no jogo): `npm run cargo -- SeuNome admin`. `npm run cargo` lista a equipe. Depois disso, admins usam `/cargo nome qa|mod|admin|player` no jogo (vale na hora).

Comandos (digite `/ajuda` no jogo para ver só os do seu cargo):

| Comando | Cargo | O que faz |
|---|---|---|
| `/equipe msg` | todos da equipe | chat só da equipe |
| `/aviso texto` | mod, admin | aviso grande no meio da tela de todos |
| `/mutar nome minutos [motivo]` · `/desmutar nome` | mod, admin | silêncio no chat |
| `/expulsar nome [motivo]` | mod, admin | desconecta |
| `/banir nome horas [motivo]` · `/desbanir nome` | mod, admin | suspende a conta (`0` = permanente); o login mostra o motivo |
| `/denuncias` · `/resolver id` | mod, admin | denúncias abertas |
| `/tp x z` · `/tp nome` · `/tp mina\|chefe\|porta\|casa\|castelo\|ruinas\|torre\|andar1..4\|necromante` | QA, admin | teleporta |
| `/classe nome` | QA, admin | troca de classe na hora (zera a árvore) |
| `/item id [qtd]` · `/itens` · `/ouro n` · `/xp n` · `/nivel n` | QA, admin | dá itens/ouro/XP, define nível |
| `/curar` · `/imortal` · `/spawn tipo [qtd]` · `/matar` · `/missao n` | QA, admin | ferramentas de teste |
| `/cargo nome cargo` | admin | muda cargo |

Regras: só se pune quem tem cargo **menor** (moderador não pune moderador nem admin), ninguém muda o próprio cargo, e mensagens da equipe nunca são escondidas pelo `/ignorar`. Clicar no nome de alguém no chat também mostra atalhos da equipe (Mutar 10 min, Expulsar, Ir até). **Toda ação da equipe fica registrada** na tabela `staff_log` (quem, o quê, em quem, quando).

### Como funciona

```
cliente ──HTTP──▶ /api/register | /api/login | /api/me | /api/logout | /api/online
cliente ◀──WS──▶ /ws   hello(token) → welcome(personagem, cargo) | state (10/s) → snap (10/s) | chat | join/leave | role
                        hit(ids) → mobs (10/s) | mev (eventos: golpe, morte, pedra, encontro)
                        act(pedido) → fx(personagem + efeitos) | setpos | cmd → sys | report | staff | announce
```

**Monstros no servidor (online):** o servidor roda a IA de todos os monstros a 20 Hz (`server/game.js`), então todo mundo vê e enfrenta **os mesmos monstros**. O cliente só diz "acertei o monstro X". O servidor confere a arma, a distância e o tempo entre golpes, e só então **rola o dano**. Golpes de longe ou rápidos demais são ignorados. Quem bateu no monstro nos últimos 30 s **ganha o abate** (ouro, XP, progresso de missão). Cada jogador recebe só os monstros a até 110 m.

A IA é um único código (`src/shared/mobs.js`) que roda no servidor (online) e no navegador (offline). O mapa também é compartilhado (`src/shared/worldData.js`, gerado com a mesma semente), então as colisões e o "mato" batem nos dois lados.

**Progresso no servidor:** XP, nível, ouro, inventário, equipamento, vida, missões e baús são do servidor. O cliente só manda **pedidos** (`comprar`, `vender`, `equipar`, `usar poção`, `beber no poço`, `aceitar/entregar missão`, `pegar baú`, `renascer`) e o servidor aplica as regras de `src/shared/progress.js`. Ele confere, por exemplo, se o jogador está perto da loja, do ancião, do poço ou do baú, e se tem ouro. O dano do jogador usa o nível e a arma **do servidor**, e o dano dos monstros, a armadura e a morte (−10% do ouro) também são calculados lá. Offline, as mesmas regras rodam no navegador.

**Posição:** continua vindo do cliente, mas o servidor recusa velocidade impossível (acima de 21 m/s) e devolve o jogador para a última posição válida. Morto não anda. Teleporte só acontece por ordem do servidor (renascer, `/tp`).

O servidor salva os personagens a cada 10 s, ao sair e ao desligar.

Testes automáticos com o servidor rodando: `npm run test:server` (monstros, economia, baús, morte, anti-trapaça, cargos e moderação: 41 checagens) e `npm run test:chat` (filtro e denúncias).

## Controles (padrão)

Todos os controles de ação podem ser remapeados no jogo (painel **Controles → ⚙️ Personalizar**), com até 2 teclas por ação, incluindo botões do mouse. WASD/setas, Enter, Esc e o botão direito (câmera) são fixos.

| Ação | Tecla |
|---|---|
| Mover | WASD / setas |
| Correr | Shift |
| Pular | Espaço |
| Atacar | Clique esquerdo ou F |
| Travar alvo | Clicar no inimigo, ou Tab para alternar |
| Câmera | Botão direito + arrastar, Q/R, scroll pra zoom (nas dungeons Q/R giram de 90 em 90°) |
| Interagir (falar, loja, poço, portas, móveis da casa, baús) | E |
| Poção / Poção grande | 1 / 2 |
| Pergaminho de Retorno (volta para a vila) | 3 |
| Habilidade da classe | G |
| Classe / árvore de habilidades | K |
| Inventário | I |
| Chat (online) | Enter |
| Som liga/desliga | M |
| Mostrar/ocultar controles | H |
| Soltar alvo / fechar janela | Esc |

### Celular e tablet
Em telas de toque os controles aparecem sozinhos (no PC dá para testar com `?touch=1` na URL):

| Na tela | Faz |
|---|---|
| Polegar na metade esquerda | joystick (aparece onde você encosta). Empurrar pouco = andar devagar; até a borda = correr |
| Arrastar no resto da tela | girar a câmera · dois dedos (pinça) = zoom |
| Toque rápido num monstro | travar o alvo |
| ⚔️ (segurar continua atacando) · ⤒ Pular · 🎯 Alvo · 🧪 Poção | ações |
| ✋ Usar | falar, loja, poço, portas, móveis, baús (acende verde quando tem algo perto) |
| Botão da habilidade | habilidade da classe (G) |
| 🎒 ⭐ 📜 💬 ⛶ (topo) | inventário, classe/habilidades, Pergaminho de Retorno, chat (online), tela cheia |

Os controles somem enquanto uma janela está aberta. No celular o jogo usa menos resolução e sombras menores (mais FPS e bateria). Melhor deitado — em pé aparece um aviso.

**Testar no seu celular (mesmo Wi-Fi):** `npm run dev:celular` e abra no celular o endereço `Network:` que o Vite mostra (ex.: `http://192.168.x.x:5199`).

## Mecânicas

- **Mira:** assistida, com anel amarelo no alvo automático do arco e anel vermelho no alvo travado (clique ou Tab). As flechas fazem uma leve curva até o alvo travado.
- **Vida:** não regenera sozinha. Recupera só com **poções** ou **bebendo no poço da vila / na fonte do castelo** (E). Inimigos regeneram devagar (2%/s) depois de 12 s sem levar dano.
- **Zonas seguras:** círculo de 32 m em volta da vila e o pátio do castelo (marcados no chão). Monstros não entram e nada aparece ali.
- **Encontros selvagens (estilo Pokémon):** andando no meio das árvores, fora da vila e das estradas, de vez em quando um goblin pula do mato (com "!"). No máximo 2 por jogador, com intervalo mínimo de 15 s. Online, outros jogadores por perto também veem e podem ajudar. Configurável em `WILD` (`src/shared/mobs.js`).
- **Golem Antigo:** se você fica a mais de 8 m, ele arremessa pedras. Uma área vermelha marca onde a pedra vai cair, e dá pra desviar.
- **Drops:** a cada 5 inimigos derrotados cai um baú (poção, arma ou armadura). O chefe sempre deixa um equipamento raro.
- **Armaduras e capacetes:** 5 tiers com as mesmas cores das armas (couro, ferro, aço, rúnico e élfico, este só caindo de monstros). A defesa da armadura e do capacete soma, e cada ponto reduz o dano em %, com retorno decrescente: `def / (def + 25)`. Ferro completo (10) bloqueia 29%; rúnico completo (27), 52%. A primeira missão dá uma Armadura de Couro.
- **Limite do mapa:** círculo de 300 m, cercado por montanhas.
- **Pergaminhos (uso único):** Retorno (45 🪙, tecla 3: volta para o centro da vila de qualquer lugar, inclusive dungeons), Proteção (+15 defesa por 60 s), Pressa (+30% velocidade por 45 s) e Fúria (+25% dano por 30 s). Vendidos nas lojas, caem de baús e dos drops; o Baú de casa guarda pergaminhos. Os efeitos ativos aparecem ao lado do painel com o tempo restante.

### Biomas
| Bioma | Onde | Monstros | Baú |
|---|---|---|---|
| Campos (centro) | vila, floresta, acampamento, ruínas | slime, goblin, Golem Antigo | floresta, campos, ruínas |
| Deserto Escaldante | leste | esqueletos | 1 |
| Pântano Sombrio | sudoeste | aranhas, mortos-vivos | 1 |
| Pedreira | noroeste | goblins das cavernas · **entrada da mina** | 1 |
| Planalto de Pedralta | norte | lobos (em bando) · **Castelo de Pedralta** | 2 |
| Terras Amaldiçoadas | sul/sudeste | fantasmas, esqueletos · **Ruínas Amaldiçoadas** e **Torre do Necromante** | 2 |

### Castelo de Pedralta
Ao norte (siga a estrada). Muralhas, torres, portão e um pátio que é **zona segura**, com a **Capitã Helena** (missões 5–8), o **Ferreiro Duarte** (loja igual à da Mercadora Lia) e uma **fonte** que cura como o poço.

### Ruínas Amaldiçoadas
Cemitério com lápides, muros caídos, névoa roxa, fogos-fátuos e uma cripta. **Fantasmas** flutuam pelas ruínas e a **Rainha Espectral** (6.500 de vida) guarda a cripta: o grito dela cai numa área marcada no chão.

### Torre do Necromante (dungeon de 4 andares)
No extremo sul. Cada andar é uma dungeon com escadas para subir/descer: **1º Salão dos Ossos** (esqueletos, cultistas), **2º Biblioteca Proibida** (fantasmas, cultistas, estantes), **3º Câmara das Gárgulas** (anéis em espiral até a escada), **4º Topo** com o **Necromante** (10.000 de vida, feitiços em área) e o baú lendário. Cultistas e o Necromante atacam de longe. Paredes valem no servidor.

### Câmera e minimapa nas dungeons
Técnicas de câmera de *dungeon crawler* (Diablo, Hades): **ângulo alto e fixo**, giro em **passos de 90°** (Q/R, ou arrastar e soltar, que encaixa no ângulo mais próximo) para o "para frente" ficar alinhado com os corredores, e **cutaway**: as paredes entre a câmera e o personagem abaixam em vez de esconder você. O minimapa tem **névoa de guerra** (só aparece o que você já viu, salvo no navegador) e só mostra os monstros que você enxerga (mesma sala, sem parede no meio). Dentro de uma dungeon, a ★ aponta o chefe da missão ou a escada certa.

### Missões
1–4 com o Ancião Bento (slimes, goblins, Golem, mina). Depois ele te manda para o castelo: **5 Lobos do Planalto**, **6 Os Mortos Não Descansam** (fantasmas), **7 A Rainha Espectral** e **8 A Torre do Necromante**, com a Capitã Helena. O "!" e o "?" aparecem em cima de quem dá a missão.

### Mina Abandonada (dungeon)
Entre pela porta na Pedreira (E). Lá dentro é escuro (o personagem leva uma lanterna) e as paredes bloqueiam movimento, flechas e visão — também no servidor. São 7 salas: entrada, aranhas, ossos (esqueletos), goblins das cavernas, cripta (mortos-vivos), salão e a sala do chefe **Goblin Minerador** (3.200 de vida, joga dinamite com área marcada no chão). 22 monstros e 6 baús. Saída pela escada da entrada. Feita para o **nível 8** (ver Balanceamento).

### Baús de tesouro
20 baús fixos (superfície, mina e torre). Abrir (E) espalha **moedas douradas** e 1–4 itens no chão. Cada jogador tem os seus: depois de aberto, o baú volta em 10 min (comum), 20 min (raro) ou 45 min (lendário, sala do chefe, sempre com 1 equipamento de chefe).

### Classes e árvore de habilidades
No **nível 2** o jogador escolhe a classe (permanente; ganha a arma da classe de presente). Inspiradas nas classes que existem tanto em **Tormenta20** quanto em **D&D 5e** e que combinam com um RPG de ação com espada/arco/magia:

| Classe | T20 · D&D | Bônus fixo | Habilidade (G) |
|---|---|---|---|
| 🛡️ Guerreiro | Guerreiro · Fighter | +20% vida, +3 defesa, +10% dano corpo a corpo | Golpe Giratório (em volta, 160%) |
| 🏹 Caçador | Caçador · Ranger | +15% dano à distância, +4 m de alcance | Chuva de Flechas (área no alvo, 130%) |
| 🔮 Arcanista | Arcanista · Wizard | −10% vida, +20% magia, explosões maiores | Bola de Fogo (área no alvo, 200%) |
| 🗡️ Ladino | Ladino · Rogue | +15% esquiva, +10% crítico, golpes e passos mais rápidos | Golpe Furtivo (crítico garantido, 300%) |

Ficaram de fora (por enquanto): Clérigo/Paladino (precisam de cura em grupo — conflita com "vida só com poção/poço"), Bardo e Druida (precisam de buffs/transformações).
Cada classe tem uma árvore de 5 nós: 3 de atributos (até 3 pontos), a habilidade ativa e um nó final que depende dela. **1 ponto por nível** (árvore completa no nível 13). O Ancião Bento redistribui os pontos por 25 × nível de ouro. Cajados (magia em área) e adagas (golpes rápidos) entraram na loja para o Arcanista e o Ladino.

### Casa do jogador
A casa com a porta dourada, ao lado do poço, é a sua (E para entrar). Por dentro é **privada**: cada jogador vê só a própria (os outros não te veem lá). Móveis: **Armário de Armas** (armas, armaduras, elmos), **Baú** (poções e pergaminhos), **Cofre** (ouro) e **Espelho** (personalização, em breve).

### Morte
Ao morrer você **perde tudo o que carrega** (volta com uma Espada de Madeira) e uma parte do **ouro na mão**: 10% na 1ª morte, 20% na 2ª, 30% na 3ª... O contador zera **a cada 2 dias, à meia-noite UTC**. **Proteção de novato:** até o nível 3 a morte não tira os itens (só a parte do ouro); ao chegar no nível 4 o jogo avisa que a proteção acabou. O que está guardado em casa nunca se perde — a ideia é que a casa vire o "banco" e o armário guarde um equipamento reserva.

### Balanceamento
`node scripts/balance.mjs` simula, com as mesmas regras do jogo, dano por segundo de cada classe por nível, tempo para matar cada monstro, vida perdida em cada sala da mina e andar da torre, economia e custo da morte. Progressão típica: goblins no Nv3, Golem no Nv5, mina no **Nv8**, lobos no Nv9, fantasmas no Nv11, Rainha no Nv12, torre no **Nv14**.

## Sons

Todos os sons são sintetizados com Web Audio (`src/audio.js`), com volume e pan pela posição. Para usar arquivos de verdade, coloque os áudios em `public/sounds/` e mapeie em `public/sounds/sounds.json`, por exemplo `{ "swing": "espada.mp3" }`. A lista de nomes está no próprio json.

## Estrutura

```
server/
  index.js       HTTP (API + arquivos do build) e WebSocket (conexões, chat, denúncias)
  game.js        mundo autoritativo: monstros, personagens, golpes, pedidos, baús, velocidade, saves
  commands.js    comandos da equipe (QA/mod/admin)
  moderation.js  filtro do chat, silêncio, histórico/provas, denúncias, staff_log
  filter.js      filtro de palavrões (chat e nomes)
  auth.js        contas (scrypt), sessões, suspensões, saves
  db.js          SQLite (node:sqlite): users (+cargo/ban), sessions, characters, reports, staff_log
scripts/
  dev.js         sobe servidor + Vite
  cargo.js       define/lista cargos (npm run cargo)
  denuncias.js   lista/resolve denúncias (npm run denuncias)
  test-*.mjs     testes do servidor: test-server (economia/cargos), test-chat, test-mina (classes, casa, mina, baús, morte), test-expansao (torre, pergaminhos, castelo)
  balance.mjs    análise de balanceamento (números)
src/
  shared/        código usado pelo navegador E pelo servidor:
    progress.js    regras do personagem: XP, ouro, loja, equipar, poções, missões, baús, casa, portas, classe, morte
    classes.js     classes, árvores de habilidades, habilidades ativas, atributos (statsOf)
    combatRules.js ataque normal, explosão do cajado e habilidades (validados no servidor)
    mobs.js        tipos, spawns, IA, arremessos (pedra/dinamite), encontros selvagens (MobSim)
    worldData.js   layout do mapa com semente, biomas, mina (grade), casa, baús de tesouro, NPCs, colisão
    items.js       catálogo de itens, loja, tabela de drop
    quests.js      missões
    roles.js       cargos, permissões e comandos da equipe
  main.js        loop, jogador, câmera, NPCs, mira, itens, integração online
  net/           session.js (login), net.js (WebSocket), remote.js (outros jogadores)
  world.js       desenha o mapa a partir de shared/worldData.js
  character.js   modelo blocado (espada/adaga/arco/cajado) + animação
  enemies.js     visual dos monstros (MobSim local offline, ou estado do servidor online)
  combat.js      flechas e orbes mágicos
  loot.js        baús de drop e pilhas de moedas
  audio.js       sons sintetizados / arquivos opcionais
  ui.js          HUD, loja, inventário, classe/árvore, casa, morte, chat, minimapa (biomas/mina)
  input.js       teclado/mouse com bindings configuráveis (+ ações virtuais do toque)
  touch.js       controles de toque: joystick, botões, câmera por arraste, pinça
```

## Próximos passos

- Grupos (party) com XP compartilhado, e troca de itens entre jogadores
- Personalização do avatar no Espelho da casa (cores e acessórios salvos na conta)
- Mais casas: hoje todo jogador usa a mesma porta (o interior é privado); depois, uma casa por jogador/compra de casas
- Deploy (ex.: Fly.io, Railway ou VPS) com HTTPS/WSS
