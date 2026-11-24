import * as THREE from 'three';
import { buildWorld, makeLabel } from './world.js';
import { createCharacter, animateCharacter, flash } from './character.js';
import { EnemyManager } from './enemies.js';
import { QUESTS } from './quests.js';
import { ITEMS, ATTACK, rollDrop } from './items.js';
import { Input, keyLabel } from './input.js';
import { UI } from './ui.js';
import { Projectiles } from './combat.js';
import { Loot } from './loot.js';
import { Sound } from './audio.js';

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const enemies = new EnemyManager(scene, world, sfx);
const input = new Input(renderer.domElement);
const ui = new UI(input, sound);
const loot = new Loot(scene);
const projectiles = new Projectiles(scene, world, enemies, (hit) => reportHits([hit]));
projectiles.onWorld = (pos) => sfx('arrowHit', pos, 0.7);
enemies.onWild = (e) => ui.log(`⚠️ Um ${e.def.name.toLowerCase()} saltou do meio das árvores!`, 'bad');
// clique em qualquer botão da interface
document.addEventListener('click', (e) => { if (e.target.closest?.('button')) sfx('ui'); });

// ---------- Save ----------
const SAVE_KEY = 'blockquest-save-v2';
const DEFAULTS = {
  level: 1, xp: 0, gold: 10, maxHp: 100, hp: 100, kills: 0,
  inv: { potion: 3, wood_sword: 1 }, equipped: 'wood_sword',
  quest: { idx: 0, status: 'available', progress: 0 }, pos: [0, 0, 8],
};
function load() {
  try {
    let s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    const old = !s && JSON.parse(localStorage.getItem('blockquest-save-v1') || 'null');
    if (old) { // migra save antigo (weaponLvl/potions) para inventário
      const eq = ['wood_sword', 'iron_sword', 'steel_sword', 'rune_blade'][old.weaponLvl || 0];
      s = { ...old, inv: { potion: old.potions || 0, wood_sword: 1, [eq]: 1 }, equipped: eq };
    }
    const merged = { ...structuredClone(DEFAULTS), ...(s || {}) };
    if (!ITEMS[merged.equipped]) merged.equipped = 'wood_sword';
    return merged;
  } catch { return structuredClone(DEFAULTS); }
}
function save() {
  const { level, xp, gold, maxHp, hp, kills, inv, equipped, quest } = player;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ level, xp, gold, maxHp, hp: Math.ceil(hp), kills, inv, equipped, quest, pos: [player.pos.x, 0, player.pos.z] }));
}
const saved = load();

// ---------- Jogador ----------
const player = {
  ...saved,
  pos: new THREE.Vector3(...saved.pos),
  vy: 0, rotY: Math.PI, onGround: true, dead: false,
  attackCd: 0, attackAnim: 0, lastHurt: -99, t: 0,
};
const hero = createCharacter({ shirt: 0xd9433b, pants: 0x2b3a67, hair: 0x3b2414, weapon: true, bow: true });
scene.add(hero.root);

const weapon = () => ITEMS[player.equipped];
function refreshWeapon() {
  const w = weapon();
  hero.sword.visible = w.style === 'melee';
  hero.bow.visible = w.style === 'ranged';
  (w.style === 'melee' ? hero.sword.userData.blade : hero.bow.userData.limb).material.color.setHex(w.color);
}
refreshWeapon();

const xpToNext = (l) => Math.floor(50 * Math.pow(l, 1.5));
const facing = () => new THREE.Vector3(Math.sin(player.rotY), 0, Math.cos(player.rotY));
const headPos = (p, hgt = 2.8) => new THREE.Vector3(p.x, hgt, p.z);
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function rollDamage() {
  const base = 10 + player.level * 3 + weapon().bonus;
  const crit = Math.random() < 0.15;
  const dmg = Math.round(base * (0.85 + Math.random() * 0.3) * (crit ? 2 : 1));
  return { dmg, crit };
}

function gainXp(n) {
  player.xp += n;
  ui.float(headPos(player.pos, 3.3), `+${n} XP`, '#6fd0ff', 16);
  while (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level++;
    player.maxHp += 15;
    player.hp += 15; // não cura: só ganha os 15 de vida máxima nova
    ui.float(headPos(player.pos, 3.8), 'LEVEL UP!', '#f5b82e', 30);
    ui.log(`Você subiu para o nível ${player.level}! Vida máxima: ${player.maxHp}`, 'good');
    sfx('levelUp');
  }
  save();
}

// ---------- Itens ----------
function addItem(id, n = 1) { player.inv[id] = (player.inv[id] || 0) + n; }
function removeItem(id, n = 1) {
  player.inv[id] = (player.inv[id] || 0) - n;
  if (player.inv[id] <= 0) delete player.inv[id];
}
function equip(id) {
  if (!player.inv[id] || ITEMS[id].kind !== 'weapon') return;
  player.equipped = id;
  refreshWeapon();
  lockTarget = null;
  ui.log(`Equipou ${ITEMS[id].icon} ${ITEMS[id].name}.`, 'info');
  save();
}
function useItem(id) {
  const it = ITEMS[id];
  if (it.kind !== 'consumable') return;
  if (!player.inv[id]) { sfx('deny'); return ui.log(`Sem ${it.name}! Compre com a Mercadora Lia.`, 'bad'); }
  if (player.dead) return;
  if (player.hp >= player.maxHp) { sfx('deny'); return ui.log('Vida já está cheia.', 'info'); }
  removeItem(id);
  sfx('potion');
  const heal = Math.round(player.maxHp * it.heal);
  player.hp = Math.min(player.maxHp, player.hp + heal);
  ui.float(headPos(player.pos), `+${heal}`, '#7dff7d', 22);
  save();
}
function buy(id) {
  const it = ITEMS[id];
  if (player.gold < it.price) { sfx('deny'); return; }
  player.gold -= it.price;
  addItem(id);
  sfx('coin');
  ui.log(`Comprou ${it.icon} ${it.name}.`, 'gold');
  if (it.kind === 'weapon') equip(id);
  save();
}
function sell(id) {
  const it = ITEMS[id];
  if (!player.inv[id]) return;
  if (id === player.equipped && player.inv[id] <= 1) return;
  removeItem(id);
  player.gold += it.sell;
  sfx('coin');
  ui.log(`Vendeu ${it.icon} ${it.name} por ${it.sell} ouro.`, 'gold');
  save();
}
ui.setGame({ player, buy, sell, use: useItem, equip });

// ---------- NPCs ----------
const npcs = [
  { id: 'elder', name: 'Ancião Bento', pos: new THREE.Vector3(4, 0, -5), look: { shirt: 0x6b4fa0, pants: 0x3d2a5c, hair: 0xe8e8e8 } },
  { id: 'merchant', name: 'Mercadora Lia', pos: new THREE.Vector3(-6, 0, 4), look: { shirt: 0xe0a72e, pants: 0x5a3d1f, hair: 0x8a3b12 } },
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
      label: 'Aceitar missão', onClick: () => {
        q.status = 'active'; q.progress = 0;
        sfx('quest');
        ui.log(`Missão aceita: ${def.title}`, 'info'); ui.closeDialog(); save();
      },
    }]);
  }
  if (q.status === 'active') return ui.dialog(npc.name, `${def.progressText(q.progress, def.count)}. Vá até ${def.where.label} (siga a ★ no mapa).`);
  if (q.status === 'complete') {
    return ui.dialog(npc.name, def.doneText, [{
      label: 'Receber recompensa', onClick: () => {
        const r = def.reward;
        sfx('quest'); sfx('coin');
        player.gold += r.gold || 0;
        const got = [];
        for (const [id, n] of Object.entries(r.items || {})) { addItem(id, n); got.push(`${n}x ${ITEMS[id].name}`); }
        ui.log(`Recompensa: ${r.gold} ouro${got.length ? `, ${got.join(', ')}` : ''}`, 'gold');
        for (const id of Object.keys(r.items || {})) {
          const it = ITEMS[id];
          if (it.kind === 'weapon' && it.style === weapon().style && it.bonus > weapon().bonus) equip(id);
        }
        q.idx++; q.progress = 0;
        q.status = q.idx < QUESTS.length ? 'available' : 'done';
        ui.closeDialog();
        gainXp(r.xp);
      },
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
function reportHits(hits) {
  for (const hh of hits) {
    sfx(hh.crit ? 'crit' : 'hit', hh.enemy.pos);
    ui.float(headPos(hh.enemy.pos, hh.enemy.def.height + 0.4), hh.crit ? `${hh.dmg}!` : `${hh.dmg}`, hh.crit ? '#ffd84a' : '#ffffff', hh.crit ? 28 : 20);
    if (hh.killed) onKill(hh.enemy);
  }
}

function attack() {
  const w = weapon();
  const tgt = currentTarget();
  if (tgt && (w.style === 'ranged' || distXZ(tgt.pos, player.pos) < 5)) {
    player.rotY = Math.atan2(tgt.pos.x - player.pos.x, tgt.pos.z - player.pos.z);
  }
  player.attackAnim = 1;
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
      reportHits(enemies.hitArc(player.pos, facing(), ATTACK.melee.range, rollDamage));
    }, 140);
  }
}

function onKill(e) {
  const g = e.def.gold[0] + Math.floor(Math.random() * (e.def.gold[1] - e.def.gold[0] + 1));
  player.gold += g;
  player.kills++;
  sfx('coin', e.pos);
  ui.float(headPos(e.pos, e.def.height + 1), `+${g} 🪙`, '#ffd65c', 16);
  ui.log(`${e.def.name} derrotado! +${g} ouro`, 'gold');
  if (lockTarget === e) lockTarget = null;
  // a cada 5 abates cai um item; chefe sempre deixa uma arma rara
  if (player.kills % 5 === 0) {
    loot.drop(rollDrop(), e.pos);
    sfx('drop', e.pos);
    ui.log('🎁 Um item caiu! Encoste no baú para pegar.', 'good');
  }
  if (e.def.boss) {
    loot.drop(rollDrop(true), new THREE.Vector3(e.pos.x + 1.5, 0, e.pos.z));
    ui.log('🎁 O chefe deixou cair uma arma rara!', 'good');
  }
  const q = player.quest, def = QUESTS[q.idx];
  if (q.status === 'active' && def.target === e.type) {
    q.progress++;
    if (q.progress >= def.count) { q.status = 'complete'; sfx('quest'); ui.log(`Missão concluída! Volte ao ${elder.name}.`, 'info'); }
  }
  gainXp(e.def.xp);
}

function onPickup(id) {
  const it = ITEMS[id];
  addItem(id);
  sfx('pickup');
  ui.float(headPos(player.pos, 3.4), `${it.icon} ${it.name}`, it.kind === 'weapon' ? '#d9b3ff' : '#b8ffb0', 18);
  ui.log(`Pegou ${it.icon} ${it.name}!${it.kind === 'weapon' ? ` Abra o inventário [${keyLabel(input.bindings.inventory.find(Boolean))}] para equipar.` : ''}`, 'good');
  ui.refresh();
  save();
}

function onPlayerHit(dmg, e) {
  if (player.dead) return;
  const real = Math.max(1, Math.round(dmg * (0.85 + Math.random() * 0.3)));
  player.hp -= real;
  player.lastHurt = player.t;
  sfx('playerHurt');
  flash(hero, 0x660000);
  setTimeout(() => flash(hero, 0x000000), 120);
  ui.float(headPos(player.pos), `-${real}`, '#ff5d5d', 22);
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true;
    sfx('playerDie');
    lockTarget = null;
    const lost = Math.floor(player.gold * 0.1);
    player.gold -= lost;
    ui.log(`Você foi derrotado por ${e.def.name}.`, 'bad');
    ui.closeDialog(); ui.closeModal();
    ui.death(true, () => {
      player.dead = false; player.hp = player.maxHp;
      player.pos.set(0, 0, 8); player.vy = 0;
      hero.root.rotation.z = 0;
      ui.death(false); save();
    });
  }
}

// ---------- Poço da vila: única cura fora as poções ----------
const WELL = { x: 0, z: 0, r: 3.4 };
function drinkFromWell() {
  if (player.hp >= player.maxHp) { sfx('deny'); return; }
  const healed = Math.round(player.maxHp - player.hp);
  player.hp = player.maxHp;
  sfx('potion');
  ui.float(headPos(player.pos), `+${healed}`, '#7dd8ff', 22);
  ui.log('💧 Você bebeu a água do poço e recuperou toda a vida.', 'good');
  save();
}

// ---------- Câmera ----------
const cam = { yaw: 0, pitch: 0.38, dist: 13 };

// ---------- Loop ----------
const clock = new THREE.Clock();
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
  const nearWell = !near && Math.hypot(player.pos.x - WELL.x, player.pos.z - WELL.z) < WELL.r;
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

  enemies.update(dt, player, camera, { onPlayerHit });
  projectiles.update(dt);
  loot.update(dt, player, onPickup);
  world.update(t, dt);

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
  ui.minimap(player, enemies.alive(), npcs, questTarget, loot.list);
  ui.updateFloats(camera, dt);

  saveTimer += dt;
  if (saveTimer > 5 && !player.dead) { saveTimer = 0; save(); }
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}

ui.log('Bem-vindo a BlockQuest! Fale com o Ancião Bento.', 'info');
frame();

// atalho de debug no console
window.game = { player, enemies, loot, ui, equip, addItem, projectiles, world, sound, reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } };
