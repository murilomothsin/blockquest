import * as THREE from 'three';
import { buildWorld, makeLabel } from './world.js';
import { createCharacter, animateCharacter, flash, setGear } from './character.js';
import { EnemyManager, TYPES } from './enemies.js';
import { QUESTS } from './quests.js';
import { ITEMS, ATTACK, SLOTS } from './items.js';
import {
  newCharacter, normalizeCharacter, publicCharacter, LootBag, act, kill, hurt, xpToNext,
  weaponOf, defenseOf, isEquipped as isEquippedBy, rollDamage as rollDamageFor,
} from './shared/progress.js';
import { NPCS, WELL, INTERACT_RANGE } from './shared/worldData.js';
import { ROLES, roleOf, tagged, can, STAFF_COMMANDS } from './shared/roles.js';
import { Input, keyLabel } from './input.js';
import { UI } from './ui.js';
import { Projectiles } from './combat.js';
import { Loot } from './loot.js';
import { Sound } from './audio.js';
import { startSession, logoutSession } from './net/session.js';
import { Net } from './net/net.js';
import { RemotePlayers } from './net/remote.js';
import { Bubbles } from './net/bubble.js';

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 70, 190);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const world = buildWorld(scene);
const sound = new Sound();
const sfx = (name, pos = null, vol = 1) => sound.play(name, pos, vol);
const input = new Input(renderer.domElement);
const ui = new UI(input, sound);
const loot = new Loot(scene);
// clique em qualquer botão da interface
document.addEventListener('click', (e) => { if (e.target.closest?.('button')) sfx('ui'); });

// ---------- Conta (login online ou modo offline) ----------
const session = await startSession();
let net = null; // conexão com o servidor (só online)
let remote = null; // outros jogadores

// Monstros: offline a IA roda aqui; online o servidor manda e todo mundo vê os mesmos monstros
const enemies = new EnemyManager(scene, world, sfx, { online: session.online });
const projectiles = new Projectiles(scene, world, enemies, (e, dir) => enemies.arrowHit(e, dir.x, dir.z, rollDamage));
projectiles.onWorld = (pos) => sfx('arrowHit', pos, 0.7);

// ---------- Personagem / save ----------
// Online o progresso (XP, ouro, itens, vida, missões, baús) é do SERVIDOR: aqui só mostramos e mandamos pedidos.
// Offline as mesmas regras (shared/progress.js) rodam aqui e o save fica no navegador.
const SAVE_KEY = 'blockquest-save-v2';
function load() {
  try {
    if (session.online) return normalizeCharacter(session.save);
    let s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    const old = !s && JSON.parse(localStorage.getItem('blockquest-save-v1') || 'null');
    if (old) { // migra save antigo (weaponLvl/potions) para inventário
      const eq = ['wood_sword', 'iron_sword', 'steel_sword', 'rune_blade'][old.weaponLvl || 0];
      s = { ...old, inv: { potion: old.potions || 0, wood_sword: 1, [eq]: 1 }, equipped: eq };
    }
    return normalizeCharacter(s);
  } catch { return newCharacter(); }
}
/** só offline: online quem salva é o servidor */
function save() {
  if (net) return;
  const data = publicCharacter({ ...player, pos: [player.pos.x, 0, player.pos.z] });
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}
const saved = load();
const localLoot = new LootBag(); // baús do modo offline

// ---------- Jogador ----------
const player = {
  ...saved,
  pos: new THREE.Vector3(...saved.pos),
  vy: 0, rotY: Math.PI, onGround: true, dead: false,
  attackCd: 0, attackAnim: 0, attackSeq: 0, moveAmount: 0, lastHurt: -99, t: 0,
};
const hero = createCharacter({ shirt: 0xd9433b, pants: 0x2b3a67, hair: 0x3b2414, weapon: true, bow: true });
scene.add(hero.root);

const weapon = () => weaponOf(player);
function refreshWeapon() {
  const w = weapon();
  hero.sword.visible = w.style === 'melee';
  hero.bow.visible = w.style === 'ranged';
  (w.style === 'melee' ? hero.sword.userData.blade : hero.bow.userData.limb).material.color.setHex(w.color);
  setGear(hero, { armorColor: ITEMS[player.armor]?.color ?? null, helmetColor: ITEMS[player.helmet]?.color ?? null });
}
refreshWeapon();

/** defesa total do equipamento */
const defense = () => defenseOf(player);
const isEquipped = (id) => isEquippedBy(player, id);

const facing = () => new THREE.Vector3(Math.sin(player.rotY), 0, Math.cos(player.rotY));
const headPos = (p, hgt = 2.8) => new THREE.Vector3(p.x, hgt, p.z);
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** dano do golpe (só offline; online o servidor rola o dano com o nível e a arma dele) */
const rollDamage = () => rollDamageFor(player);

const CHAR_KEYS = ['level', 'xp', 'gold', 'maxHp', 'hp', 'kills', 'inv', 'equipped', 'armor', 'helmet', 'quest'];
/** personagem vindo do servidor substitui o local */
function applyChar(c) {
  if (!c) return;
  for (const k of CHAR_KEYS) if (k in c) player[k] = c[k];
  if ('dead' in c) player.dead = !!c.dead;
  refreshWeapon();
  ui.refresh();
}

const ctxLocal = () => ({ pos: player.pos, now: player.t, rand: Math.random, loot: localLoot });
/** Pedido do jogador: offline aplica as regras aqui; online manda pro servidor e espera o resultado (fx). */
function request(a) {
  if (net) { net.send({ t: 'act', ...a }); return; }
  const fx = [];
  act(player, a, ctxLocal(), fx);
  applyFx(fx);
  save();
}

/** Mostra os efeitos que as regras de progresso geraram (iguais online e offline) */
function applyFx(list = []) {
  const at = (o) => (o.at ? new THREE.Vector3(o.at.x, 0, o.at.z) : player.pos);
  let gearChanged = false;
  for (const f of list) {
    switch (f.k) {
      case 'log': ui.log(f.text, f.cls); break;
      case 'sfx': sfx(f.name, f.at ? at(f) : null); break;
      case 'float': ui.float(headPos(at(f), f.h ?? 2.8), f.text, f.color, f.size); break;
      case 'levelUp': ui.float(headPos(player.pos, 3.8), 'LEVEL UP!', '#f5b82e', 30); sfx('levelUp'); break;
      case 'heal': ui.float(headPos(player.pos), `+${f.n}`, f.color, 22); break;
      case 'loot': loot.drop(f.item, { x: f.x, z: f.z }, f.lid); break;
      case 'lootGone': loot.remove(f.lid); break;
      case 'pickup': {
        const it = ITEMS[f.item], gear = !!SLOTS[it.kind];
        ui.float(headPos(player.pos, 3.4), `${it.icon} ${it.name}`, gear ? '#d9b3ff' : '#b8ffb0', 18);
        ui.log(`Pegou ${it.icon} ${it.name}!${gear ? ` Abra o inventário [${keyLabel(input.bindings.inventory.find(Boolean))}] para equipar.` : ''}`, 'good');
        break;
      }
      case 'equip': {
        const it = ITEMS[f.item];
        if (it.kind === 'weapon') lockTarget = null;
        sfx(it.kind === 'weapon' ? 'ui' : 'equip');
        ui.log(`Equipou ${it.icon} ${it.name}.`, 'info');
        gearChanged = true;
        break;
      }
      case 'hurt':
        player.lastHurt = player.t;
        sfx('playerHurt');
        flash(hero, 0x660000);
        setTimeout(() => flash(hero, 0x000000), 120);
        ui.float(headPos(player.pos), `-${f.dmg}`, '#ff5d5d', 22);
        break;
      case 'death':
        player.dead = true;
        sfx('playerDie');
        lockTarget = null;
        ui.log(`Você foi derrotado por ${f.by}.${f.lost ? ` Perdeu ${f.lost} de ouro.` : ''}`, 'bad');
        ui.closeDialog(); ui.closeModal();
        ui.death(true, () => request({ a: 'respawn' }));
        break;
      case 'respawn':
        player.dead = false;
        player.pos.set(f.pos[0], 0, f.pos[2]); player.vy = 0;
        hero.root.rotation.z = 0;
        ui.death(false);
        break;
      case 'closeDialog': ui.closeDialog(); break;
      default: break;
    }
  }
  if (gearChanged) refreshWeapon();
  ui.refresh();
}

const equip = (id) => request({ a: 'equip', id });
const unequip = (slot) => request({ a: 'unequip', slot });
const useItem = (id) => request({ a: 'use', id });
const buy = (id) => request({ a: 'buy', id });
const sell = (id) => request({ a: 'sell', id });
/** só para testes offline no console */
function addItem(id, n = 1) { player.inv[id] = (player.inv[id] || 0) + n; ui.refresh(); }
ui.setGame({ player, buy, sell, use: useItem, equip, unequip, isEquipped, defense });

// ---------- NPCs ----------
const npcs = [
  { id: 'elder', name: NPCS.elder.name, pos: new THREE.Vector3(NPCS.elder.x, 0, NPCS.elder.z), look: { shirt: 0x6b4fa0, pants: 0x3d2a5c, hair: 0xe8e8e8 } },
  { id: 'merchant', name: NPCS.merchant.name, pos: new THREE.Vector3(NPCS.merchant.x, 0, NPCS.merchant.z), look: { shirt: 0xe0a72e, pants: 0x5a3d1f, hair: 0x8a3b12 } },
];
for (const n of npcs) {
  n.char = createCharacter(n.look);
  n.char.root.position.copy(n.pos);
  n.char.root.rotation.y = Math.atan2(-n.pos.x, -n.pos.z);
  scene.add(n.char.root);
  const label = makeLabel(n.name, '#ffe08a', 0.8);
  label.position.set(n.pos.x, 3.3, n.pos.z);
  scene.add(label);
  world.colliders.push({ x: n.pos.x, z: n.pos.z, r: 0.8 });
}
const elder = npcs[0];
let markerText = '';
const marker = makeLabel('!', '#ffd84a', 2.2);
marker.position.set(elder.pos.x, 4.4, elder.pos.z);
scene.add(marker);
function setMarker(t) {
  if (t === markerText) return;
  markerText = t;
  const c = marker.userData.canvas, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  if (t) {
    g.font = 'bold 110px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = '#000'; g.strokeText(t, 256, 64);
    g.fillStyle = t === '?' ? '#9cff8f' : '#ffd84a'; g.fillText(t, 256, 64);
  }
  marker.material.map.needsUpdate = true;
}

function talk(npc) {
  if (npc.id === 'merchant') { ui.shopTab = 'buy'; return ui.openModal('shop'); }
  const q = player.quest, def = QUESTS[q.idx];
  if (q.status === 'done') return ui.dialog(npc.name, 'Graças a você a Vila Pedraverde está em paz. Novas aventuras virão em breve...');
  if (q.status === 'available') {
    return ui.dialog(`${npc.name} — ${def.title}`, def.intro, [{
      label: 'Aceitar missão', onClick: () => request({ a: 'quest_accept' }),
    }]);
  }
  if (q.status === 'active') return ui.dialog(npc.name, `${def.progressText(q.progress, def.count)}. Vá até ${def.where.label} (siga a ★ no mapa).`);
  if (q.status === 'complete') {
    return ui.dialog(npc.name, def.doneText, [{
      label: 'Receber recompensa', onClick: () => request({ a: 'quest_turnin' }),
    }]);
  }
}

// ---------- Mira / alvo ----------
let lockTarget = null;
let autoTarget = null;
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1.1, 32),
  new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.visible = false;
scene.add(ring);
const raycaster = new THREE.Raycaster();

const alive = (e) => e && e.state !== 'dead';
const maxLockRange = () => (weapon().style === 'ranged' ? weapon().range + 6 : 30);

function findAutoTarget(range) {
  const camF = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const f = facing();
  let best = null, bestD = Infinity;
  for (const e of enemies.list) {
    if (!alive(e)) continue;
    const d = distXZ(e.pos, player.pos);
    if (d > range) continue;
    const dir = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z).normalize();
    if (Math.max(dir.dot(f), dir.dot(camF)) < 0.5 && d > 4) continue; // cone de ~60°
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function cycleTarget() {
  const list = enemies.list.filter((e) => alive(e) && distXZ(e.pos, player.pos) < 30)
    .sort((a, b) => distXZ(a.pos, player.pos) - distXZ(b.pos, player.pos));
  if (!list.length) { lockTarget = null; return; }
  lockTarget = list[(list.indexOf(lockTarget) + 1) % list.length];
}

function pickEnemyAt(x, y) {
  raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const roots = enemies.list.filter(alive).map((e) => e.model.root);
  for (const hit of raycaster.intersectObjects(roots, true)) {
    let o = hit.object;
    while (o && !o.userData.enemy) o = o.parent;
    if (o) return o.userData.enemy;
  }
  return null;
}

function currentTarget() {
  if (alive(lockTarget) && distXZ(lockTarget.pos, player.pos) <= maxLockRange()) return lockTarget;
  return weapon().style === 'ranged' ? autoTarget : null;
}

// ---------- Combate ----------
/** Número de dano em cima do monstro. `mine`: golpe meu (amarelo/branco) ou de outro jogador (cinza, menor). */
function reportHit({ enemy, dmg, crit, mine }) {
  if (mine) sfx(crit ? 'crit' : 'hit', enemy.pos);
  const color = mine ? (crit ? '#ffd84a' : '#ffffff') : '#b9c2d0';
  ui.float(headPos(enemy.pos, enemy.def.height + 0.4), crit ? `${dmg}!` : `${dmg}`, color, mine ? (crit ? 28 : 20) : 15);
}
enemies.handlers = {
  onDamage: reportHit,
  onKill: (e) => onKill(e),
  onPlayerHit: (dmg, e) => onPlayerHit(dmg, e),
  onWild: (e) => ui.log(`⚠️ Um ${e.def.name.toLowerCase()} saltou do meio das árvores!`, 'bad'),
};

function attack() {
  const w = weapon();
  const tgt = currentTarget();
  if (tgt && (w.style === 'ranged' || distXZ(tgt.pos, player.pos) < 5)) {
    player.rotY = Math.atan2(tgt.pos.x - player.pos.x, tgt.pos.z - player.pos.z);
  }
  player.attackAnim = 1;
  player.attackSeq++; // outros jogadores veem o golpe quando esse contador muda
  player.attackCd = ATTACK[w.style].cooldown;
  if (w.style === 'ranged') {
    setTimeout(() => {
      if (player.dead) return;
      sfx('bow');
      const from = new THREE.Vector3(player.pos.x, player.pos.y + 1.9, player.pos.z).addScaledVector(facing(), 0.7);
      projectiles.fire(from, alive(tgt) ? tgt : null, facing(), w.range, rollDamage);
    }, 160);
  } else {
    sfx('swing');
    setTimeout(() => {
      if (player.dead) return;
      const f = facing();
      enemies.melee(player.pos.x, player.pos.z, f.x, f.z, ATTACK.melee.range, rollDamage);
    }, 140);
  }
}

/** Abate (só offline; online o servidor manda o resultado como fx) */
function onKill(e) {
  if (lockTarget === e) lockTarget = null;
  const fx = [];
  kill(player, e.type, { x: e.pos.x, z: e.pos.z }, ctxLocal(), fx);
  applyFx(fx);
  save();
}

/** Dano de monstro (só offline; online o servidor aplica armadura, morte e perda de ouro) */
function onPlayerHit(dmg, e) {
  const fx = [];
  hurt(player, dmg, e.type, ctxLocal(), fx);
  applyFx(fx);
}

// ---------- Poço da vila: única cura fora as poções ----------
const drinkFromWell = () => request({ a: 'well' });

// ---------- Multiplayer ----------
const bubbles = new Bubbles(scene);
let sendChat = null;
let myRole = session.user?.role || 'player';
if (session.online) {
  ui.setAccount(session.user.username, true, myRole);
  ui.netStatus('🟡 Conectando…');
  remote = new RemotePlayers(scene);
  net = new Net(session.token);
  const onlineText = () => `🟢 Online · ${remote.map.size + 1} jogador${remote.map.size ? 'es' : ''}`;
  net.on('welcome', (m) => {
    enemies.myId = m.id;
    myRole = m.role;
    ui.setAccount(m.name, true, myRole);
    // o personagem é o do servidor (inclusive vida e baús ainda no chão)
    applyChar(m.c);
    player.pos.set(m.c.pos[0], 0, m.c.pos[2]);
    loot.clear();
    applyFx(m.loot);
    if (m.c.dead) applyFx([{ k: 'death', by: 'um monstro', lost: 0 }]);
    remote.clear();
    for (const p of m.players) remote.add(p);
    ui.netStatus(onlineText());
    ui.chatMsg(null, `Conectado como ${m.name}. ${m.players.length ? `${m.players.length} outro(s) jogador(es) online.` : 'Você é o único online agora.'}`, 'sys');
    if (myRole !== 'player') ui.chatMsg(null, `Você é ${roleOf(myRole).label}. Seus comandos estão na /ajuda.`, 'sys');
  });
  net.on('join', (m) => { remote.add(m); ui.netStatus(onlineText()); ui.chatMsg(null, `${tagged(m.name, m.role)} entrou no jogo.`, 'sys'); sfx('ui'); });
  net.on('leave', (m) => { remote.remove(m.id); ui.netStatus(onlineText()); ui.chatMsg(null, `${m.name} saiu.`, 'sys'); });
  net.on('snap', (m) => remote.snapshot(m.players, net.id));
  net.on('role', (m) => {
    if (m.id === net.id) { myRole = m.role; ui.setAccount(session.user.username, true, myRole); } else remote.setRole(m.id, m.role);
  });

  // progresso e monstros vindos do servidor
  net.on('fx', (m) => { applyChar(m.c); applyFx(m.fx); });
  net.on('setpos', (m) => { player.pos.set(m.x, player.pos.y, m.z); player.vy = 0; });
  enemies.send = (msg) => net.send(msg);
  net.on('mobs', (m) => enemies.applySnapshot(m.m));
  net.on('mev', (ev) => enemies.onEvent(ev));

  // ---------- Chat: geral (todos + balão na cabeça), sussurro (/w), ignorar ----------
  const IGNORE_KEY = 'blockquest-ignored';
  const ignored = new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]'));
  const saveIgnored = () => localStorage.setItem(IGNORE_KEY, JSON.stringify([...ignored]));
  let lastWhisperFrom = null;
  const anchorFor = (id) => (id === net.id ? hero.root : remote.map.get(id)?.char.root);
  const staffMsg = (role) => roleOf(role).rank > 0; // mensagens da equipe nunca são escondidas pelo /ignorar

  net.on('chat', (m) => {
    if (ignored.has(m.from.toLowerCase()) && !staffMsg(m.role)) return;
    ui.chatMsg(m.from, m.text, m.id === net.id ? 'me' : '', m.id === net.id ? null : m.from, m.role);
    const anchor = anchorFor(m.id);
    if (anchor) bubbles.say(m.id, anchor, m.text);
    if (m.id !== net.id) sfx('ui');
  });
  net.on('whisper', (m) => {
    const mine = m.id === net.id;
    if (!mine && ignored.has(m.from.toLowerCase()) && !staffMsg(m.role)) return;
    if (!mine) lastWhisperFrom = m.from;
    ui.chatMsg(mine ? `[Para ${m.to}]` : `[De ${m.from}]`, m.text, 'whisper', mine ? null : m.from, mine ? null : m.role);
    const anchor = anchorFor(m.id); // só quem participa vê o balão do sussurro
    if (anchor) bubbles.say(m.id, anchor, m.text, { whisper: true });
    if (!mine) sfx('pickup');
  });
  net.on('sys', (m) => ui.chatMsg(null, m.text, 'sys'));
  net.on('staff', (m) => { ui.chatMsg(`[Equipe] ${m.from}`, m.text, 'staff', m.from === session.user.username ? null : m.from, m.role); sfx('ui'); });
  net.on('announce', (m) => { ui.chatMsg(`📢 ${m.from}`, m.text, 'announce'); ui.announce(m.text, m.from); sfx('quest'); });

  // ---------- Moderação: menu no nome do jogador e denúncia ----------
  const ignore = (name) => {
    ignored.add(name.toLowerCase()); saveIgnored();
    ui.chatMsg(null, `Você não vai mais ver mensagens de ${name}.`, 'sys');
  };
  const report = (name) => ui.reportDialog(name, ({ reason, note }) => net.send({ t: 'report', name, reason, note }));
  const cmd = (c, ...args) => net.send({ t: 'cmd', cmd: c, args });
  ui.onPlayerMenu = (name, x, y) => {
    const items = [
      { label: '💬 Sussurrar', run: () => { ui.openChat((txt) => sendChat(txt)); document.getElementById('chatinput').value = `/w ${name} `; } },
      ignored.has(name.toLowerCase())
        ? { label: '👁️ Deixar de ignorar', run: () => sendChat(`/designorar ${name}`) }
        : { label: '🔇 Ignorar', run: () => ignore(name) },
      { label: '🚩 Denunciar', danger: true, run: () => report(name) },
    ];
    // atalhos da equipe (o servidor confere o cargo de novo)
    if (can(myRole, 'moderate')) {
      items.push(
        { label: '🤐 Mutar 10 min', staff: true, run: () => cmd('/mutar', name, '10') },
        { label: '👢 Expulsar', staff: true, run: () => cmd('/expulsar', name) },
      );
    }
    if (can(myRole, 'test')) items.push({ label: '📍 Ir até', staff: true, run: () => cmd('/tp', name) });
    ui.playerMenu(name, x, y, items);
  };

  const helpText = () => {
    const base = 'Comandos: /w nome msg (sussurrar) · /r msg (responder) · /ignorar nome · /designorar nome · /denunciar nome · /online. Dica: clique no nome de alguém no chat.';
    const mine = STAFF_COMMANDS.filter((c) => can(myRole, c.perm));
    return mine.length ? [base, `Equipe (${roleOf(myRole).label}): ${mine.map((c) => `${c.cmd} — ${c.desc}`).join(' · ')}`] : [base];
  };

  sendChat = (raw) => {
    const text = raw.trim();
    const [c, ...rest] = text.split(' ').filter(Boolean);
    const arg = rest.join(' ').trim();
    switch ((c || '').toLowerCase()) {
      case '/w': case '/s': case '/sussurrar': {
        const [to, ...msg] = rest;
        if (!to || !msg.length) return ui.chatMsg(null, 'Use: /w nome mensagem', 'sys');
        return net.chat(msg.join(' '), to);
      }
      case '/r': // responder o último sussurro
        if (!lastWhisperFrom) return ui.chatMsg(null, 'Ninguém sussurrou pra você ainda.', 'sys');
        if (!arg) return ui.chatMsg(null, 'Use: /r mensagem', 'sys');
        return net.chat(arg, lastWhisperFrom);
      case '/ignorar':
        if (!arg) return ui.chatMsg(null, `Ignorados: ${[...ignored].join(', ') || 'ninguém'}`, 'sys');
        return ignore(arg);
      case '/denunciar':
        if (!arg) return ui.chatMsg(null, 'Use: /denunciar nome (ou clique no nome da pessoa no chat)', 'sys');
        return report(rest[0]);
      case '/designorar':
        ignored.delete(arg.toLowerCase()); saveIgnored();
        return ui.chatMsg(null, `${arg} voltou a aparecer no seu chat.`, 'sys');
      case '/online':
        return ui.chatMsg(null, `Online: ${[tagged(session.user.username, myRole), ...remote.list().map((p) => tagged(p.name, p.role))].join(', ')}`, 'sys');
      case '/ajuda': case '/?':
        for (const line of helpText()) ui.chatMsg(null, line, 'sys');
        return;
      default:
        if (c?.startsWith('/')) return cmd(c.toLowerCase(), ...rest); // comandos da equipe: o servidor decide
        return net.chat(text);
    }
  };
  net.on('kicked', (m) => {
    ui.netStatus(m.banned ? '⛔ Conta suspensa' : '🔴 Desconectado');
    ui.chatMsg(null, m.message, 'sys');
    ui.log(m.message, 'bad');
    ui.announce(m.message, m.banned ? 'Conta suspensa' : 'Desconectado');
  });
  net.on('error', (m) => { if (m.code === 'auth') logoutSession(null); });
  net.on('disconnect', (e) => {
    if ([4001, 4003, 4004, 4005].includes(e.code)) return;
    remote.clear();
    ui.netStatus('🟠 Reconectando…');
  });
  document.getElementById('logout').onclick = () => logoutSession(session.token);
} else {
  ui.setAccount('Aventureiro (offline)', false);
}
addEventListener('beforeunload', save); // offline: salva ao fechar (online não faz nada)

// ---------- Câmera ----------
const cam = { yaw: 0, pitch: 0.38, dist: 13 };

// ---------- Loop ----------
const clock = new THREE.Timer();
let saveTimer = 0;
let currentZone = null;
let inSafe = null;

function update(dt) {
  player.t += dt;
  const t = player.t;

  // câmera
  if (input.rmb) {
    cam.yaw -= input.dx * 0.005;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.dy * 0.004, 0.05, 1.35);
  }
  cam.dist = THREE.MathUtils.clamp(cam.dist + input.wheel * 1.2, 5, 28);
  if (input.held('camLeft')) cam.yaw += dt * 2;
  if (input.held('camRight')) cam.yaw -= dt * 2;

  // atalhos de interface
  if (input.tapped('Escape')) {
    if (ui.modal) ui.closeModal();
    else if (ui.dialogOpen) ui.closeDialog();
    else lockTarget = null;
  }
  if (input.hit('help')) ui.toggleHelp();
  if (input.hit('mute')) {
    const m = sound.toggleMute();
    ui.log(m ? '🔇 Som desligado' : '🔊 Som ligado', 'info');
    ui.renderHelp();
  }
  if (input.hit('inventory') && !player.dead && !ui.dialogOpen) ui.toggleModal('inventory');
  if (net && input.tapped('Enter') && !ui.isBlocking()) ui.openChat((text) => sendChat(text));

  let moveAmount = 0;
  const canAct = !player.dead && !ui.isBlocking();

  if (canAct) {
    const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const mv = new THREE.Vector3();
    if (input.down('KeyW') || input.down('ArrowUp')) mv.add(fwd);
    if (input.down('KeyS') || input.down('ArrowDown')) mv.sub(fwd);
    if (input.down('KeyD') || input.down('ArrowRight')) mv.add(right);
    if (input.down('KeyA') || input.down('ArrowLeft')) mv.sub(right);
    if (mv.lengthSq() > 0) {
      mv.normalize();
      const run = input.held('run');
      player.pos.addScaledVector(mv, (run ? 13 : 8) * dt);
      moveAmount = run ? 1 : 0.75;
      let diff = Math.atan2(mv.x, mv.z) - player.rotY;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.rotY += diff * Math.min(1, dt * 14);
    }
    if (input.hit('jump') && player.onGround) { player.vy = 10; player.onGround = false; sfx('jump'); }

    // clicar num inimigo trava o alvo
    if (input.click) {
      const picked = pickEnemyAt(input.click.x, input.click.y);
      if (picked) lockTarget = picked;
    }
    if (input.hit('target')) cycleTarget();
    if (input.hit('attack') && player.attackCd <= 0) attack();
    if (input.hit('potion')) useItem('potion');
    if (input.hit('bigPotion')) useItem('big_potion');
  }

  // NPC próximo (ou o poço da vila, que cura)
  let near = null;
  for (const n of npcs) if (n.pos.distanceTo(player.pos) < 4) near = n;
  const nearWell = !near && Math.hypot(player.pos.x - WELL.x, player.pos.z - WELL.z) < INTERACT_RANGE.well - 1;
  const talkKey = keyLabel(input.bindings.talk.find(Boolean));
  if (near && canAct) ui.prompt(`[${talkKey}] ${near.id === 'merchant' ? 'Abrir loja de' : 'Falar com'} ${near.name}`);
  else if (nearWell && canAct) ui.prompt(player.hp < player.maxHp ? `[${talkKey}] Beber água do poço (recupera toda a vida)` : '💧 Poço da vila — sua vida está cheia');
  else ui.prompt(null);
  if (near && canAct && input.hit('talk')) talk(near);
  if (nearWell && canAct && input.hit('talk')) drinkFromWell();

  // física
  player.vy -= 28 * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  world.resolve(player.pos, 0.6);

  player.attackCd -= dt;
  player.attackAnim = Math.max(0, player.attackAnim - dt * (weapon().style === 'ranged' ? 2.2 : 3.5));

  // sem regeneração passiva: vida só volta com poção ou bebendo no poço da vila

  // jogador visual
  hero.root.position.copy(player.pos);
  hero.root.rotation.y = player.rotY;
  if (player.dead) hero.root.rotation.z = Math.min(Math.PI / 2, hero.root.rotation.z + dt * 4);
  const ranged = weapon().style === 'ranged';
  animateCharacter(hero, t, moveAmount, ranged ? 0 : player.attackAnim, !player.onGround);
  if (ranged) {
    if (player.attackAnim > 0) { // pose de tiro: braço do arco esticado, outro puxando a corda
      hero.armL.rotation.x = -1.55;
      hero.armR.rotation.x = -1.35 + (1 - player.attackAnim) * 0.3;
    } else if (!moveAmount) hero.armL.rotation.x = -0.35;
  }

  for (const n of npcs) {
    if (n.pos.distanceTo(player.pos) < 8) n.char.root.rotation.y = Math.atan2(player.pos.x - n.pos.x, player.pos.z - n.pos.z);
    animateCharacter(n.char, t, 0, 0);
    n.char.armL.rotation.x = Math.sin(t * 1.5 + n.pos.x) * 0.08;
  }

  enemies.update(dt, player, camera);
  projectiles.update(dt);
  loot.update(dt, player, (lid) => request({ a: 'pickup', lid }));
  world.update(t, dt);
  player.moveAmount = moveAmount;
  if (net) {
    net.sendState({
      x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), r: +player.rotY.toFixed(3),
      m: moveAmount, air: !player.onGround, d: player.dead, s: player.attackSeq, w: player.equipped, a: player.armor || '', hm: player.helmet || '',
      hp: Math.ceil(player.hp), mhp: player.maxHp, lv: player.level,
    });
    remote.update(dt);
  }
  bubbles.update(dt);

  // alvo: anel vermelho = travado, amarelo = mira automática do arco
  if (lockTarget && (!alive(lockTarget) || distXZ(lockTarget.pos, player.pos) > 40)) lockTarget = null;
  autoTarget = ranged && !player.dead ? findAutoTarget(weapon().range) : null;
  const shown = currentTarget();
  ring.visible = !!shown;
  if (shown) {
    const locked = shown === lockTarget;
    ring.material.color.setHex(locked ? 0xff3b3b : 0xffd84a);
    ring.position.set(shown.pos.x, 0.06, shown.pos.z);
    ring.scale.setScalar(shown.def.radius * 1.1 + 0.3 + (locked ? Math.sin(t * 6) * 0.05 : 0));
  }

  // marcador de missão
  const q = player.quest;
  setMarker(q.status === 'available' ? '!' : q.status === 'complete' ? '?' : '');
  marker.position.y = 4.4 + Math.sin(t * 3) * 0.15;

  const z = world.zoneAt(player.pos.x, player.pos.z);
  if (z && z !== currentZone) ui.log(`📍 ${z.name}`, 'info');
  currentZone = z;
  const safe = world.isSafe(player.pos.x, player.pos.z);
  if (safe !== inSafe) {
    if (inSafe !== null) ui.log(safe ? '🛡️ Zona segura: monstros não entram aqui' : '⚠️ Saindo da zona segura', safe ? 'good' : 'bad');
    inSafe = safe;
  }

  const boss = enemies.list.find((e) => e.def.boss && e.state === 'chase');
  ui.boss(boss ? boss.def.name : null, boss ? boss.hp / boss.def.hp : 0);

  // câmera segue
  const camTarget = new THREE.Vector3(player.pos.x, player.pos.y + 2.2, player.pos.z);
  camera.position.set(
    camTarget.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    camTarget.y + cam.dist * Math.sin(cam.pitch),
    camTarget.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  );
  camera.position.y = Math.max(0.5, camera.position.y);
  camera.lookAt(camTarget);
  world.fadeOccluders(camera.position, player.pos);
  sound.setListener(player.pos, new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)));
  sun.position.set(player.pos.x + 30, 60, player.pos.z + 20);
  sun.target.position.copy(player.pos);

  // HUD
  const def = QUESTS[q.idx];
  let qh;
  if (q.status === 'done') qh = '<h3>🏆 Todas as missões concluídas</h3><p>Você é o herói da vila!</p>';
  else if (q.status === 'available') qh = `<h3>❗ Nova missão</h3><p>Fale com o ${elder.name} na vila.</p>`;
  else if (q.status === 'active') {
    const d = Math.round(Math.hypot(def.where.x - player.pos.x, def.where.z - player.pos.z));
    qh = `<h3>${def.title}</h3><p>${def.progressText(q.progress, def.count)}</p><p>★ ${def.where.label} — ${d}m</p>`;
  } else qh = `<h3>${def.title} ✔</h3><p>Volte ao ${elder.name} para a recompensa.</p>`;
  ui.quest(qh);
  ui.hud(player, xpToNext(player.level), weapon());
  const questTarget = q.status === 'active' ? def.where : (q.status === 'available' || q.status === 'complete') ? elder.pos : null;
  ui.minimap(player, enemies.alive(), npcs, questTarget, loot.list, remote ? remote.list() : []);
  ui.updateFloats(camera, dt);

  saveTimer += dt;
  if (saveTimer > 5 && !player.dead && !net) {
    saveTimer = 0;
    save();
    const fx = [];
    localLoot.expire(player.t, fx); // baús offline também somem depois de um tempo
    applyFx(fx);
  }
}

function frame(now) {
  clock.update(now);
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}

ui.log('Bem-vindo a BlockQuest! Fale com o Ancião Bento.', 'info');
frame();

// atalho de debug no console
window.game = { player, enemies, loot, ui, equip, unequip, defense, onPlayerHit, addItem, request, applyFx, localLoot, projectiles, world, sound, session, get net() { return net; }, get remote() { return remote; }, reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } };
