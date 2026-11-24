import * as THREE from 'three';
import { buildWorld, makeLabel } from './world.js';
import { createCharacter, animateCharacter, flash, setGear, setWeapon } from './character.js';
import { EnemyManager, TYPES } from './enemies.js';
import { QUESTS } from './quests.js';
import { ITEMS, ATTACK, SLOTS } from './items.js';
import {
  newCharacter, normalizeCharacter, publicCharacter, LootBag, act, kill, hurt, xpToNext,
  weaponOf, defenseOf, isEquipped as isEquippedBy, nextDeathPct, treasureLeft, questGiver,
} from './shared/progress.js';
import {
  NPCS, WELLS, INTERACT_RANGE, TREASURES, MINE_DOOR, MINE_EXIT, HOME_DOOR, HOME_EXIT, HOME_FURNITURE, regionAt, biomeAt, BIOMES,
  DOORS, DOOR_BY_ID, BOSS_ROOMS, dungeonAt, isDungeonRegion, TOWER_DOOR,
} from './shared/worldData.js';
import { CLASSES, SKILLS, statsOf, activeSkillOf } from './shared/classes.js';
import { attackCooldown, weaponRange } from './shared/combatRules.js';
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
import { TouchControls, isTouchDevice } from './touch.js';

const TOUCH = isTouchDevice();

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2)); // celular: menos pixels = mais FPS e menos bateria
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

const hemi = new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.6);
scene.add(hemi);
// lanterna do jogador: só acende na mina (raio ~18 m) para os monstros não sumirem no escuro
const lantern = new THREE.PointLight(0xffd9a0, 0, 18, 1.3);
scene.add(lantern);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
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
const projectiles = new Projectiles(scene, world, enemies, (e, kind) => enemies.projectileHit(e, kind));
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
enemies.local.char = player; // offline: as regras de ataque usam o personagem local

const weapon = () => weaponOf(player);
function refreshWeapon() {
  setWeapon(hero, weapon());
  setGear(hero, { armorColor: ITEMS[player.armor]?.color ?? null, helmetColor: ITEMS[player.helmet]?.color ?? null });
}
refreshWeapon();

/** defesa total do equipamento */
const defense = () => defenseOf(player);
const isEquipped = (id) => isEquippedBy(player, id);

const facing = () => new THREE.Vector3(Math.sin(player.rotY), 0, Math.cos(player.rotY));
const headPos = (p, hgt = 2.8) => new THREE.Vector3(p.x, hgt, p.z);
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const CHAR_KEYS = ['level', 'xp', 'gold', 'maxHp', 'hp', 'kills', 'inv', 'equipped', 'armor', 'helmet', 'quest', 'cls', 'skills', 'chests', 'home', 'deaths', 'buffs', 'farm'];
/** personagem vindo do servidor substitui o local */
function applyChar(c) {
  if (!c) return;
  for (const k of CHAR_KEYS) if (k in c) player[k] = c[k];
  if ('dead' in c) player.dead = !!c.dead;
  refreshWeapon();
  ui.refresh();
}

const ctxLocal = () => ({ pos: player.pos, now: player.t, clock: Date.now(), rand: Math.random, loot: localLoot });
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
      case 'loot': loot.drop(f.item, { x: f.x, z: f.z }, f.lid, f.n); break;
      case 'lootGone': loot.remove(f.lid); break;
      case 'pickup': {
        if (f.item === 'gold') { ui.float(headPos(player.pos, 3.4), `+${f.n} 🪙`, '#ffd65c', 20); break; }
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
        ui.log(`Você foi derrotado por ${f.by}.${f.lost ? ` Perdeu ${f.lost} 🪙.` : ''}${f.items ? ` Perdeu ${f.items} item(ns).` : ''}${f.novice ? ' 🛡️ Itens protegidos (novato).' : ''}`, 'bad');
        ui.closeDialog(); ui.closeModal();
        ui.death(true, () => request({ a: 'respawn' }), f.pct != null ? { ...f, nextPct: nextDeathPct(player) } : null);
        gearChanged = true;
        break;
      case 'respawn':
        player.dead = false;
        player.pos.set(f.pos[0], 0, f.pos[2]); player.vy = 0;
        hero.root.rotation.z = 0;
        ui.death(false);
        break;
      case 'closeDialog': ui.closeDialog(); break;
      case 'teleport':
        player.pos.set(f.x, 0, f.z); player.vy = 0;
        lockTarget = null;
        ui.closeModal();
        sfx('quest');
        break;
      case 'chest': world.treasures.find((t) => t.id === f.id).open = true; break;
      case 'chooseClass': break; // o HUD mostra o botão "Escolher classe"
      case 'classChosen': ui.closeModal(); ui.openModal('tree'); break;
      case 'skillUp': break;
      case 'buff': player.buffs = { ...(player.buffs || {}), [f.id]: f.until }; break;
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
ui.setGame({
  player, buy, sell, use: useItem, equip, unequip, isEquipped, defense,
  chooseClass: (cls) => request({ a: 'choose_class', cls }),
  skillUp: (node) => request({ a: 'skill_up', node }),
  respec: () => request({ a: 'respec' }),
  store: (box, id, n) => request({ a: 'store', box, id, n }),
  take: (box, id, n) => request({ a: 'take', box, id, n }),
  deposit: (n) => request({ a: 'deposit', n }),
  withdraw: (n) => request({ a: 'withdraw', n }),
});

// ---------- NPCs ----------
const NPC_LOOKS = {
  elder: { shirt: 0x6b4fa0, pants: 0x3d2a5c, hair: 0xe8e8e8 },
  merchant: { shirt: 0xe0a72e, pants: 0x5a3d1f, hair: 0x8a3b12 },
  captain: { shirt: 0x3b5fb5, pants: 0x2b3a67, hair: 0x8a3b12, gear: { armorColor: 0xcfd6de, helmetColor: 0xcfd6de } },
  smith: { shirt: 0x6b4423, pants: 0x3b2a1a, hair: 0x2b2b2b },
  mage: { shirt: 0x3a2a7a, pants: 0x2a1f5c, hair: 0xd9d9e8, hat: 0x3a2a7a },
};
const npcs = Object.entries(NPCS).map(([id, n]) => ({ id, ...n, pos: new THREE.Vector3(n.x, 0, n.z), look: NPC_LOOKS[id] }));
for (const n of npcs) {
  n.char = createCharacter(n.look);
  if (n.look.gear) setGear(n.char, n.look.gear);
  if (n.look.hat) { // chapéu de mago + cajado
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 8), new THREE.MeshLambertMaterial({ color: n.look.hat }));
    hat.position.y = 0.72; n.char.head.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 12), hat.material);
    brim.position.y = 0.27; n.char.head.add(brim);
    setWeapon(n.char, { ...ITEMS.crystal_staff });
  }
  n.char.root.position.copy(n.pos);
  n.char.root.rotation.y = Math.atan2(-n.pos.x, -n.pos.z);
  scene.add(n.char.root);
  const label = makeLabel(n.name, '#ffe08a', 0.8);
  label.position.set(n.pos.x, 3.3, n.pos.z);
  scene.add(label);
  world.colliders.push({ x: n.pos.x, z: n.pos.z, r: 0.8 });
}
const elder = npcs[0];
const npcById = (id) => npcs.find((n) => n.id === id);
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

/** o Ancião também redistribui os pontos de habilidade */
const respecButton = () => (player.cls && Object.keys(player.skills).length
  ? [{ label: '↺ Redistribuir pontos', onClick: () => request({ a: 'respec' }) }] : []);

function talk(npc) {
  if (npc.role === 'shop') { ui.shopTab = 'buy'; ui.shopNpc = npc; return ui.openModal('shop'); }
  const q = player.quest, def = QUESTS[q.idx];
  const extra = npc.id === 'elder' ? respecButton() : [];
  if (q.status === 'done') return ui.dialog(npc.name, 'Graças a você o reino está em paz. Novas aventuras virão em breve...', extra);
  const giver = questGiver(def);
  if (giver !== NPCS[npc.id]) { // a missão atual é com outro NPC
    return ui.dialog(npc.name, npc.id === 'elder'
      ? `${giver.name} ${giver.where} precisa de você. Siga a estrada para o norte e procure no pátio do castelo (a ★ no mapa mostra o caminho).`
      : `Bom te ver, aventureiro. Fale com ${giver.title} ${giver.where}: depois volte aqui.`, extra);
  }
  if (q.status === 'available') {
    return ui.dialog(`${npc.name} — ${def.title}`, def.intro, [{
      label: 'Aceitar missão', onClick: () => request({ a: 'quest_accept' }),
    }]);
  }
  if (q.status === 'active') return ui.dialog(npc.name, `${def.progressText(q.progress, def.count)}. Vá até ${def.where.label} (siga a ★ no mapa).`, extra);
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
const ranged = () => weapon().style !== 'melee'; // arco e cajado atiram projéteis
const maxLockRange = () => (ranged() ? weaponRange(player) + 6 : 30);

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
    if (!world.los(player.pos.x, player.pos.z, e.pos.x, e.pos.z)) continue; // atrás da parede da mina
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function cycleTarget() {
  const list = enemies.list.filter((e) => alive(e) && distXZ(e.pos, player.pos) < 30 && world.los(player.pos.x, player.pos.z, e.pos.x, e.pos.z))
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
  return ranged() ? autoTarget : null;
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
  onKill: (e, key) => onKill(e, key),
  onPlayerHit: (dmg, e) => onPlayerHit(dmg, e),
  onWild: (e) => ui.log(`⚠️ Um ${e.def.name.toLowerCase()} saltou do meio das árvores!`, 'bad'),
};

function attack() {
  const w = weapon();
  const tgt = currentTarget();
  if (tgt && (ranged() || distXZ(tgt.pos, player.pos) < 5)) {
    player.rotY = Math.atan2(tgt.pos.x - player.pos.x, tgt.pos.z - player.pos.z);
  }
  player.attackAnim = 1;
  player.attackSeq++; // outros jogadores veem o golpe quando esse contador muda
  player.attackCd = attackCooldown(player);
  if (ranged()) {
    const magic = w.style === 'magic';
    setTimeout(() => {
      if (player.dead) return;
      sfx(magic ? 'crit' : 'bow', null, magic ? 0.5 : 1);
      const from = new THREE.Vector3(player.pos.x, player.pos.y + (magic ? 2.4 : 1.9), player.pos.z).addScaledVector(facing(), 0.7);
      projectiles.fire(from, alive(tgt) ? tgt : null, facing(), weaponRange(player), magic ? 'magic' : 'arrow', w.color);
    }, magic ? 220 : 160);
  } else {
    sfx('swing');
    setTimeout(() => {
      if (player.dead) return;
      const f = facing();
      enemies.melee(player.pos.x, player.pos.z, f.x, f.z, weaponRange(player));
    }, 140);
  }
}

// ---------- Habilidade da classe (tecla G) ----------
let skillReadyAt = 0; // segundos (relógio do jogo)
function useSkill() {
  const id = activeSkillOf(player);
  if (!id) {
    ui.log(player.cls ? 'Aprenda a habilidade ativa da sua árvore (K).' : 'Escolha uma classe no nível 2 para ter uma habilidade.', 'info');
    return;
  }
  const S = SKILLS[id];
  if (player.t < skillReadyAt) return ui.log(`${S.name} recarregando (${Math.ceil(skillReadyAt - player.t)} s).`, 'info');
  const tgt = S.area === 'target' ? (currentTarget() || findAutoTarget(S.reach ?? weaponRange(player) + 4)) : null;
  if (S.area === 'target' && !tgt) return ui.log(`${S.name}: trave um alvo no alcance (clique no monstro ou Tab).`, 'info');
  if (tgt) player.rotY = Math.atan2(tgt.pos.x - player.pos.x, tgt.pos.z - player.pos.z);
  player.attackAnim = 1;
  player.attackSeq++;
  const r = enemies.skill(id, tgt);
  if (r) onSkillResult(r); // offline responde na hora; online chega por {t:'skill'}
  else skillReadyAt = player.t + 0.5; // evita repetir o pedido enquanto o servidor responde
}
function onSkillResult(r) {
  if (r.ok) { skillReadyAt = player.t + r.cd; return; }
  skillReadyAt = 0;
  if (r.reason) ui.log(r.reason, 'bad');
}

/** Abate (só offline; online o servidor manda o resultado como fx) */
function onKill(e, key) {
  if (lockTarget === e) lockTarget = null;
  const fx = [];
  kill(player, e.type, { x: e.pos.x, z: e.pos.z }, ctxLocal(), fx, key);
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

/** Pergaminho de Retorno (tecla 3): volta para a vila */
function useScroll() {
  if (!player.inv.scroll_return) return ui.log('Sem Pergaminho de Retorno! Compre com o Mago Eldrin no castelo (45 🪙).', 'bad');
  useItem('scroll_return');
}

/** ★ dentro de dungeon/casa: o chefe da missão (se for neste andar), a escada certa, ou a saída */
function dungeonStar(def) {
  const d = dungeonAt(player.pos.x, player.pos.z);
  if (!d) return HOME_EXIT;
  const boss = def && BOSS_ROOMS[def.target];
  if (boss && boss.dungeon === d.id) return boss;
  if (d.region === 'tower') {
    if (boss && boss.dungeon.startsWith('tower') && DOOR_BY_ID[`tower_up${d.floor}`]) return DOOR_BY_ID[`tower_up${d.floor}`].at; // sobe
    return (DOOR_BY_ID[`tower_down${d.floor}`] || DOOR_BY_ID.tower_out).at; // desce / sai
  }
  return MINE_EXIT;
}

// ---------- Regiões: superfície, mina (escura) e casa (interior) ----------
const LOOKS = {
  world: { bg: 0x8fd3ff, fog: TOUCH ? [60, 160] : [70, 200], hemi: 1.6, sun: 2.2 },
  mine: { bg: 0x07050a, fog: [10, 42], hemi: 0.45, sun: 0.12, lantern: 26 },
  tower: { bg: 0x0b0812, fog: [14, 52], hemi: 0.9, sun: 0.1, lantern: 30 },
  home: { bg: 0x1d140d, fog: [30, 60], hemi: 0.9, sun: 0 },
};
let region = null;
let currentBiome = null;
function setRegion(r) {
  if (r === region) return;
  region = r;
  const L = LOOKS[r];
  scene.background.setHex(L.bg);
  scene.fog.color.setHex(L.bg);
  [scene.fog.near, scene.fog.far] = L.fog;
  hemi.intensity = L.hemi;
  lantern.intensity = L.lantern || 0;
  lantern.visible = !!L.lantern;
  sun.intensity = L.sun;
  camera.far = L.fog[1] + 40; // nada além da névoa é desenhado (mais FPS)
  camera.updateProjectionMatrix();
  if (isDungeonRegion(r)) { // câmera de dungeon: alta, ângulo fixo, girando de 90 em 90°
    cam.dist = DUNGEON_CAM.start;
    cam.yawSnap = Math.round(cam.yaw / (Math.PI / 2)) * (Math.PI / 2);
  }
  if (r === 'home') cam.dist = 13;
}

/**
 * Câmera nas dungeons (técnica de "dungeon crawler", tipo Diablo/Hades):
 *  - ângulo alto e fixo (≈57°), olhando de cima: dá para ver a sala e os corredores;
 *  - gira em passos de 90° (Q/R ou arrastando e soltando): o "para frente" do WASD fica alinhado com os corredores;
 *  - paredes entre a câmera e o jogador abaixam (cutaway, em world.js), em vez de a câmera colar no personagem;
 *  - minimapa com névoa de guerra: só o que você já viu aparece.
 */
const DUNGEON_CAM = { pitch: 0.98, start: 18, min: 11, max: 24 };

/** baús abertos (por jogador) ficam com a tampa aberta até reaparecerem */
function syncTreasures() {
  const now = Date.now();
  for (const t of world.treasures) t.open = treasureLeft(player, t, now) > 0;
}
const DOOR_ICONS = { mine_in: '⛏️', home_in: '🏠', tower_in: '🗼', home_out: '🚪' };
const mapMarks = () => {
  const d = dungeonAt(player.pos.x, player.pos.z);
  const here = (o) => dungeonAt(o.x, o.z) === d;
  return [
    ...world.treasures.filter(here).map((t) => ({ x: t.x, z: t.z, icon: '💎', dim: t.open, explored: d ? explored.seen(t.x, t.z) : true })),
    ...DOORS.filter((o) => here(o.at)).map((o) => ({ x: o.at.x, z: o.at.z, icon: DOOR_ICONS[o.id] || '🪜' })),
    ...WELLS.map((w) => ({ x: w.x, z: w.z, icon: '💧' })),
  ].filter((m) => m.explored !== false);
};

// ---------- Névoa de guerra das dungeons: tiles já vistos (salvo no navegador, por conta) ----------
const explored = (() => {
  const KEY = `blockquest-explored-${session.user?.username || 'offline'}`;
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* vazio */ }
  const grids = {};
  const gridOf = (d) => {
    if (!grids[d.id]) {
      grids[d.id] = new Uint8Array(d.cols * d.rows);
      const s0 = data[d.id] || '';
      for (let i = 0; i < s0.length && i < grids[d.id].length; i++) grids[d.id][i] = s0.charCodeAt(i) === 49 ? 1 : 0;
      for (let i = 0; i < grids[d.id].length; i++) if (grids[d.id][i]) ui.revealTile(d, i % d.cols, Math.floor(i / d.cols));
    }
    return grids[d.id];
  };
  let dirty = false, saveT = 0;
  return {
    /** revela os tiles em volta do jogador que ele consegue ver (raio ~5 tiles) */
    update(p, dt) {
      const d = dungeonAt(p.x, p.z);
      if (!d) return;
      const g = gridOf(d);
      const tx = Math.floor((p.x - d.x0) / d.tile), tz = Math.floor((p.z - d.z0) / d.tile);
      for (let dz = -5; dz <= 5; dz++) {
        for (let dx = -5; dx <= 5; dx++) {
          const x = tx + dx, z = tz + dz;
          if (x < 0 || z < 0 || x >= d.cols || z >= d.rows || dx * dx + dz * dz > 30 || g[z * d.cols + x]) continue;
          const c = { x: d.x0 + (x + 0.5) * d.tile, z: d.z0 + (z + 0.5) * d.tile };
          // parede conta como vista se algum vizinho de chão estiver à vista
          const ok = d.grid[z][x] === 0 ? world.los(p.x, p.z, c.x, c.z)
            : [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, az]) => d.grid[z + az]?.[x + ax] === 0 && world.los(p.x, p.z, c.x + ax * d.tile, c.z + az * d.tile));
          if (!ok) continue;
          g[z * d.cols + x] = 1; dirty = true;
          ui.revealTile(d, x, z);
        }
      }
      saveT += dt;
      if (dirty && saveT > 3) {
        saveT = 0; dirty = false;
        for (const [id, arr] of Object.entries(grids)) data[id] = Array.from(arr, (v) => (v ? '1' : '0')).join('');
        localStorage.setItem(KEY, JSON.stringify(data));
      }
    },
    seen(x, z) {
      const d = dungeonAt(x, z);
      if (!d) return true;
      const tx = Math.floor((x - d.x0) / d.tile), tz = Math.floor((z - d.z0) / d.tile);
      return !!gridOf(d)[tz * d.cols + tx];
    },
    init(d) { gridOf(d); },
  };
})();

/** a coisa mais próxima com que dá para interagir (E). Retorna { label, run? } */
function nearestInteractable() {
  const P = player.pos;
  const d = (o) => Math.hypot(P.x - o.x, P.z - o.z);
  const opts = [];
  for (const n of npcs) if (n.pos.distanceTo(P) < 4) opts.push({ dist: n.pos.distanceTo(P), label: `${n.role === 'shop' ? 'Abrir loja de' : 'Falar com'} ${n.name}`, run: () => talk(n) });
  for (const w of WELLS) {
    if (d(w) >= INTERACT_RANGE.well - 1) continue;
    opts.push(player.hp < player.maxHp
      ? { dist: d(w), label: `Beber água da ${w.name} (recupera toda a vida)`, run: drinkFromWell }
      : { dist: d(w), label: `💧 ${w.name[0].toUpperCase()}${w.name.slice(1)} — sua vida está cheia` });
  }
  for (const door of DOORS) { // portas, escadas e saídas
    if (d(door.at) < door.r - 0.3) opts.push({ dist: d(door.at), label: door.label, run: () => request({ a: 'door', id: door.id }) });
  }
  if (region === 'home') {
    for (const [k, f] of Object.entries(HOME_FURNITURE)) {
      if (d(f) < INTERACT_RANGE.furniture - 0.3) opts.push({ dist: d(f), label: `${f.icon} Abrir ${f.name}`, run: () => { ui.homeTab = k; ui.openModal('home'); } });
    }
  }
  for (const t of world.treasures) {
    if (d(t) > INTERACT_RANGE.chest - 0.3) continue;
    const left = treasureLeft(player, t);
    opts.push(left > 0
      ? { dist: d(t), label: `💎 Baú vazio — volta em ${Math.ceil(left / 60000)} min` }
      : { dist: d(t), label: `💎 Abrir baú do tesouro${t.tier === 3 ? ' (lendário!)' : t.tier === 2 ? ' (raro)' : ''}`, run: () => request({ a: 'open_chest', id: t.id }) });
  }
  opts.sort((a, b) => a.dist - b.dist);
  return opts[0] || null;
}

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
    syncTreasures();
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
  net.on('skill', (m) => onSkillResult(m));
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
addEventListener('pagehide', save); // celular: o navegador pode matar a aba sem beforeunload

// ---------- Celular / tablet: controles na tela ----------
const touch = TOUCH ? new TouchControls(input, renderer.domElement, {
  online: !!net,
  onChat: () => sendChat && ui.openChat((text) => sendChat(text)),
  onInventory: () => !player.dead && ui.toggleModal('inventory'),
  onTree: () => !player.dead && ui.toggleModal(player.cls ? 'tree' : 'class'),
  onScroll: () => !player.dead && useScroll(),
}) : null;

// ---------- Câmera ----------
const cam = { yaw: 0, pitch: 0.38, dist: 13, yawSnap: 0 };

// ---------- Loop ----------
const clock = new THREE.Timer();
let saveTimer = 0;
let currentZone = null;
let currentArea = 'world';
let miniT = 1;
let inSafe = null;

function update(dt) {
  player.t += dt;
  const t = player.t;

  // câmera
  const inDungeon = isDungeonRegion(region);
  const dragging = input.rmb || input.touchCam;
  if (dragging) {
    cam.yaw -= input.dx * 0.005;
    if (!inDungeon) cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.dy * 0.004, 0.05, 1.35);
  }
  if (inDungeon) {
    cam.dist = THREE.MathUtils.clamp(cam.dist + input.wheel * 1.2, DUNGEON_CAM.min, DUNGEON_CAM.max);
    if (input.hit('camLeft')) cam.yawSnap += Math.PI / 2; // Q/R: gira 90°
    if (input.hit('camRight')) cam.yawSnap -= Math.PI / 2;
    if (dragging) cam.yawSnap = Math.round(cam.yaw / (Math.PI / 2)) * (Math.PI / 2); // ao soltar, encaixa no ângulo mais próximo
    else cam.yaw += (cam.yawSnap - cam.yaw) * Math.min(1, dt * 8);
  } else {
    cam.dist = THREE.MathUtils.clamp(cam.dist + input.wheel * 1.2, 5, 28);
    if (input.held('camLeft')) cam.yaw += dt * 2;
    if (input.held('camRight')) cam.yaw -= dt * 2;
  }

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
  if (input.hit('tree') && !player.dead && !ui.dialogOpen) ui.toggleModal(player.cls ? 'tree' : 'class');
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
    let analog = 1;
    if (input.move) { // joystick na tela: direção e força (empurrar pouco = andar devagar)
      mv.set(0, 0, 0).addScaledVector(fwd, -input.move.y).addScaledVector(right, input.move.x);
      analog = Math.min(1, 0.35 + input.move.mag);
    }
    if (mv.lengthSq() > 0) {
      mv.normalize();
      const run = input.held('run');
      player.pos.addScaledVector(mv, (run ? 13 : 8) * analog * statsOf(player).speed * dt);
      moveAmount = run ? 1 : 0.75 * analog;
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
    if (input.hit('skill')) useSkill();
    if (input.hit('potion')) useItem('potion');
    if (input.hit('bigPotion')) useItem('big_potion');
    if (input.hit('scroll')) useScroll();
  }

  // coisa mais próxima para interagir (NPC, poço, portas, móveis da casa, baús de tesouro)
  const talkKey = TOUCH ? '✋' : keyLabel(input.bindings.talk.find(Boolean));
  const it = canAct ? nearestInteractable() : null;
  touch?.update({ canTalk: it?.run, potions: player.inv.potion || 0, ranged: weapon().style !== 'melee' && weapon().style, blocked: ui.isBlocking(), dead: player.dead });
  ui.prompt(it ? (it.run ? `[${talkKey}] ${it.label}` : it.label) : null);
  if (it?.run && input.hit('talk')) it.run();

  // física
  player.vy -= 28 * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  world.resolve(player.pos, 0.6);

  player.attackCd -= dt;
  player.attackAnim = Math.max(0, player.attackAnim - dt * (ranged() ? 2.2 : 3.5));

  // sem regeneração passiva: vida só volta com poção ou bebendo no poço da vila

  // jogador visual
  hero.root.position.copy(player.pos);
  hero.root.rotation.y = player.rotY;
  if (player.dead) hero.root.rotation.z = Math.min(Math.PI / 2, hero.root.rotation.z + dt * 4);
  const isRanged = ranged();
  animateCharacter(hero, t, moveAmount, isRanged ? 0 : player.attackAnim, !player.onGround);
  if (weapon().style === 'magic') { // cajado: aponta para frente ao lançar
    if (player.attackAnim > 0) hero.armR.rotation.x = -1.5 * Math.min(1, player.attackAnim * 2);
  } else if (isRanged) {
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
  autoTarget = isRanged && !player.dead ? findAutoTarget(weaponRange(player)) : null;
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
  const giverNpc = npcById(Object.keys(NPCS).find((k) => NPCS[k] === questGiver(QUESTS[q.idx])) || 'elder');
  marker.position.set(giverNpc.pos.x, 4.4 + Math.sin(t * 3) * 0.15, giverNpc.pos.z);

  const z = world.zoneAt(player.pos.x, player.pos.z);
  if (z && z.id !== currentZone?.id) ui.log(`📍 ${z.name}`, 'info');
  currentZone = z;
  setRegion(regionAt(player.pos.x, player.pos.z));
  const areaKey = dungeonAt(player.pos.x, player.pos.z)?.id || (region === 'home' ? 'home' : 'world');
  if (areaKey !== currentArea) { currentArea = areaKey; world.showArea(areaKey); }
  const b = BIOMES[biomeAt(player.pos.x, player.pos.z)];
  ui.region(region === 'world' ? (z?.name || b.name) : z?.name);
  if (region === 'world' && b.id !== currentBiome) { if (currentBiome) ui.log(`🧭 ${b.name}`, 'info'); currentBiome = b.id; }
  const safe = world.isSafe(player.pos.x, player.pos.z);
  if (safe !== inSafe) {
    if (inSafe !== null) ui.log(safe ? '🛡️ Zona segura: monstros não entram aqui' : '⚠️ Saindo da zona segura', safe ? 'good' : 'bad');
    inSafe = safe;
  }

  const boss = enemies.list.find((e) => e.def.boss && e.state === 'chase');
  ui.boss(boss ? boss.def.name : null, boss ? boss.hp / boss.def.hp : 0);

  // câmera segue
  const camTarget = new THREE.Vector3(player.pos.x, player.pos.y + 2.2, player.pos.z);
  // dentro de casa (sem teto): câmera alta, olhando de cima, para ver o cômodo inteiro
  const pitch = region === 'home' ? Math.max(cam.pitch, 1.0) : inDungeon ? DUNGEON_CAM.pitch : cam.pitch;
  camera.position.set(
    camTarget.x + cam.dist * Math.cos(pitch) * Math.sin(cam.yaw),
    camTarget.y + cam.dist * Math.sin(pitch),
    camTarget.z + cam.dist * Math.cos(pitch) * Math.cos(cam.yaw),
  );
  camera.position.y = Math.max(0.5, camera.position.y);

  camera.lookAt(camTarget);
  world.fadeOccluders(camera.position, player.pos);
  world.cutaway(camera.position, player.pos, dt);
  world.updateLights(player.pos, t);
  explored.update(player.pos, dt);
  sound.setListener(player.pos, new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)));
  sun.position.set(player.pos.x + 30, 60, player.pos.z + 20);
  lantern.position.set(player.pos.x, 4.5, player.pos.z);
  sun.target.position.copy(player.pos);

  // HUD
  const def = QUESTS[q.idx];
  let qh;
  if (q.status === 'done') qh = '<h3>🏆 Todas as missões concluídas</h3><p>Você é o herói da vila!</p>';
  else if (q.status === 'available') qh = `<h3>❗ Nova missão</h3><p>Fale com ${questGiver(def).title} ${questGiver(def).where}.</p>`;
  else if (q.status === 'active') {
    const d = Math.round(Math.hypot(def.where.x - player.pos.x, def.where.z - player.pos.z));
    qh = `<h3>${def.title}</h3><p>${def.progressText(q.progress, def.count)}</p><p>★ ${def.where.label} — ${d}m</p>`;
  } else qh = `<h3>${def.title} ✔</h3><p>Volte para ${questGiver(def).title} ${questGiver(def).where} para a recompensa.</p>`;
  ui.quest(qh);
  ui.hud(player, xpToNext(player.level), weapon());
  ui.skillButton(player, skillReadyAt, player.t);
  const qGiver = (q.status === 'available' || q.status === 'complete') && questGiver(def);
  let questTarget = q.status === 'active' ? def.where : qGiver ? qGiver : null;
  if (questTarget && region !== 'world') questTarget = dungeonStar(q.status === 'active' ? def : null);
  syncTreasures();
  // nas dungeons, o minimapa só mostra monstros que você enxerga (mesma sala / sem parede no meio)
  const seen = (e) => !inDungeon || (distXZ(e.pos, player.pos) < 32 && world.los(player.pos.x, player.pos.z, e.pos.x, e.pos.z) && explored.seen(e.pos.x, e.pos.z));
  const sameArea = (o) => dungeonAt(o.pos.x, o.pos.z) === dungeonAt(player.pos.x, player.pos.z);
  miniT += dt;
  if (miniT >= 1 / 20) { // minimapa a 20 Hz (desenhar o canvas todo quadro custava ~0,7 ms)
    miniT = 0;
    ui.minimap(player, enemies.alive().filter(seen), region === 'world' ? npcs : [], questTarget, loot.list, remote ? remote.list().filter(sameArea) : [], mapMarks());
  }
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

/** tempo de CPU por quadro (ms), média móvel: game.perf no console */
const perf = { update: 0, render: 0 };
function frame(now) {
  clock.update(now);
  const dt = Math.min(0.05, clock.getDelta());
  const t0 = performance.now();
  update(dt);
  const t1 = performance.now();
  renderer.render(scene, camera);
  const t2 = performance.now();
  perf.update += (t1 - t0 - perf.update) * 0.05;
  perf.render += (t2 - t1 - perf.render) * 0.05;
  input.endFrame();
  requestAnimationFrame(frame);
}

ui.log('Bem-vindo a BlockQuest! Fale com o Ancião Bento.', 'info');
frame();

// atalho de debug no console
window.game = { player, cam, renderer, scene, camera, perf, enemies, loot, ui, equip, unequip, defense, onPlayerHit, addItem, request, applyFx, localLoot, projectiles, world, sound, session, get net() { return net; }, get remote() { return remote; }, reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } };
