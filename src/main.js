import * as THREE from 'three';
import { buildWorld, makeLabel } from './world.js';
import { createCharacter, animateCharacter, flash } from './character.js';
import { EnemyManager } from './enemies.js';
import { QUESTS, WEAPONS } from './quests.js';
import { Input } from './input.js';
import { UI } from './ui.js';

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
const enemies = new EnemyManager(scene, world);
const ui = new UI();
const input = new Input(renderer.domElement);

// ---------- Save ----------
const SAVE_KEY = 'blockquest-save-v1';
const DEFAULTS = { level: 1, xp: 0, gold: 10, potions: 3, weaponLvl: 0, maxHp: 100, hp: 100, quest: { idx: 0, status: 'available', progress: 0 }, pos: [0, 0, 8] };
function load() {
  try { return { ...structuredClone(DEFAULTS), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return structuredClone(DEFAULTS); }
}
function save() {
  const { level, xp, gold, potions, weaponLvl, maxHp, hp, quest } = player;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ level, xp, gold, potions, weaponLvl, maxHp, hp: Math.ceil(hp), quest, pos: [player.pos.x, 0, player.pos.z] }));
}
const saved = load();

// ---------- Jogador ----------
const player = {
  ...saved,
  pos: new THREE.Vector3(...saved.pos),
  vy: 0, rotY: Math.PI, onGround: true, dead: false,
  attackCd: 0, attackAnim: 0, lastHurt: -99, t: 0,
};
const hero = createCharacter({ shirt: 0xd9433b, pants: 0x2b3a67, hair: 0x3b2414, weapon: true });
scene.add(hero.root);
function refreshWeapon() { hero.sword.userData.blade.material.color.setHex(WEAPONS[player.weaponLvl].color); }
refreshWeapon();

const xpToNext = (l) => Math.floor(50 * Math.pow(l, 1.5));
const facing = () => new THREE.Vector3(Math.sin(player.rotY), 0, Math.cos(player.rotY));
const headPos = (p, h = 2.8) => new THREE.Vector3(p.x, h, p.z);

function rollDamage() {
  const base = 10 + player.level * 3 + WEAPONS[player.weaponLvl].bonus;
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
    player.hp = player.maxHp;
    ui.float(headPos(player.pos, 3.8), 'LEVEL UP!', '#f5b82e', 30);
    ui.log(`Você subiu para o nível ${player.level}! Vida máxima: ${player.maxHp}`, 'good');
  }
  save();
}

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
  const q = player.quest, def = QUESTS[q.idx];
  if (npc.id === 'elder') {
    if (q.status === 'done') return ui.dialog(npc.name, 'Graças a você a Vila Pedraverde está em paz. Novas aventuras virão em breve...');
    if (q.status === 'available') {
      return ui.dialog(`${npc.name} — ${def.title}`, def.intro, [{
        label: 'Aceitar missão', onClick: () => {
          q.status = 'active'; q.progress = 0;
          ui.log(`Missão aceita: ${def.title}`, 'info'); ui.closeDialog(); save();
        },
      }]);
    }
    if (q.status === 'active') return ui.dialog(npc.name, `${def.progressText(q.progress, def.count)}. Vá até ${def.where.label} (siga a ★ no mapa).`);
    if (q.status === 'complete') {
      return ui.dialog(npc.name, def.doneText, [{
        label: 'Receber recompensa', onClick: () => {
          const r = def.reward;
          player.gold += r.gold || 0;
          player.potions += r.potions || 0;
          if (r.weapon) { player.weaponLvl = Math.max(player.weaponLvl, r.weapon); refreshWeapon(); ui.log(`Nova arma: ${WEAPONS[player.weaponLvl].name}!`, 'good'); }
          ui.log(`Recompensa: ${r.gold} ouro${r.potions ? `, ${r.potions} poções` : ''}`, 'gold');
          q.idx++; q.progress = 0;
          q.status = q.idx < QUESTS.length ? 'available' : 'done';
          ui.closeDialog();
          gainXp(r.xp);
        },
      }]);
    }
  }
  if (npc.id === 'merchant') {
    const next = WEAPONS[player.weaponLvl + 1];
    const wCost = 120 * (player.weaponLvl + 1);
    const buttons = [{
      label: 'Poção de vida — 15 🪙', disabled: player.gold < 15, onClick: () => {
        player.gold -= 15; player.potions++; ui.log('Comprou 1 poção.', 'gold'); save(); talk(npc);
      },
    }];
    if (next) buttons.push({
      label: `${next.name} — ${wCost} 🪙`, disabled: player.gold < wCost, onClick: () => {
        player.gold -= wCost; player.weaponLvl++; refreshWeapon();
        ui.log(`Comprou ${next.name}!`, 'good'); save(); talk(npc);
      },
    });
    ui.dialog(npc.name, `Bem-vindo à minha banca! Você tem ${player.gold} de ouro. Arma atual: ${WEAPONS[player.weaponLvl].name}.`, buttons);
  }
}

// ---------- Combate ----------
function onKill(e) {
  const g = e.def.gold[0] + Math.floor(Math.random() * (e.def.gold[1] - e.def.gold[0] + 1));
  player.gold += g;
  ui.float(headPos(e.pos, e.def.height + 1), `+${g} 🪙`, '#ffd65c', 16);
  ui.log(`${e.def.name} derrotado! +${g} ouro`, 'gold');
  if (Math.random() < (e.def.boss ? 1 : 0.15)) { player.potions++; ui.log('Encontrou uma poção!', 'good'); }
  const q = player.quest, def = QUESTS[q.idx];
  if (q.status === 'active' && def.target === e.type) {
    q.progress++;
    if (q.progress >= def.count) { q.status = 'complete'; ui.log(`Missão concluída! Volte ao ${elder.name}.`, 'info'); }
  }
  gainXp(e.def.xp);
}

function onPlayerHit(dmg, e) {
  if (player.dead) return;
  const real = Math.max(1, Math.round(dmg * (0.85 + Math.random() * 0.3)));
  player.hp -= real;
  player.lastHurt = player.t;
  flash(hero, 0x660000);
  setTimeout(() => flash(hero, 0x000000), 120);
  ui.float(headPos(player.pos), `-${real}`, '#ff5d5d', 22);
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true;
    const lost = Math.floor(player.gold * 0.1);
    player.gold -= lost;
    ui.log(`Você foi derrotado por ${e.def.name}.`, 'bad');
    ui.closeDialog();
    ui.death(true, () => {
      player.dead = false; player.hp = player.maxHp;
      player.pos.set(0, 0, 8); player.vy = 0;
      hero.root.rotation.z = 0;
      ui.death(false); save();
    });
  }
}

// ---------- Câmera ----------
const cam = { yaw: 0, pitch: 0.38, dist: 13 };

// ---------- Loop ----------
const clock = new THREE.Clock();
let saveTimer = 0;
let currentZone = null;

function update(dt) {
  player.t += dt;
  const t = player.t;

  // câmera
  if (input.rmb) {
    cam.yaw -= input.dx * 0.005;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.dy * 0.004, 0.05, 1.35);
  }
  cam.dist = THREE.MathUtils.clamp(cam.dist + input.wheel * 1.2, 5, 28);
  if (input.down('KeyQ')) cam.yaw += dt * 2;
  if (input.down('KeyR')) cam.yaw -= dt * 2;

  let moveAmount = 0;
  const canAct = !player.dead && !ui.dialogOpen;

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
      const run = input.down('ShiftLeft') || input.down('ShiftRight');
      const speed = run ? 13 : 8;
      player.pos.addScaledVector(mv, speed * dt);
      moveAmount = run ? 1 : 0.75;
      const target = Math.atan2(mv.x, mv.z);
      let diff = target - player.rotY;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.rotY += diff * Math.min(1, dt * 14);
    }
    if (input.hit('Space') && player.onGround) { player.vy = 10; player.onGround = false; }

    if ((input.clicked || input.hit('KeyF')) && player.attackCd <= 0) {
      player.attackCd = 0.5; player.attackAnim = 1;
      setTimeout(() => {
        if (player.dead) return;
        for (const h of enemies.hitArc(player.pos, facing(), 3.2, rollDamage)) {
          ui.float(headPos(h.enemy.pos, h.enemy.def.height + 0.4), h.crit ? `${h.dmg}!` : `${h.dmg}`, h.crit ? '#ffd84a' : '#ffffff', h.crit ? 28 : 20);
          if (h.killed) onKill(h.enemy);
        }
      }, 140);
    }

    if (input.hit('Digit1')) {
      if (player.potions <= 0) ui.log('Sem poções! Compre com a Mercadora Lia.', 'bad');
      else if (player.hp >= player.maxHp) ui.log('Vida já está cheia.', 'info');
      else {
        player.potions--;
        const heal = Math.round(player.maxHp * 0.5);
        player.hp = Math.min(player.maxHp, player.hp + heal);
        ui.float(headPos(player.pos), `+${heal}`, '#7dff7d', 22);
      }
    }
  }

  // NPC próximo
  let near = null;
  for (const n of npcs) if (n.pos.distanceTo(player.pos) < 4) near = n;
  ui.prompt(near && canAct ? `[E] Falar com ${near.name}` : null);
  if (near && canAct && input.hit('KeyE')) talk(near);
  if (ui.dialogOpen && input.hit('Escape')) ui.closeDialog();

  // física
  player.vy -= 28 * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  world.resolve(player.pos, 0.6);

  player.attackCd -= dt;
  player.attackAnim = Math.max(0, player.attackAnim - dt * 3.5);

  // regeneração fora de combate
  if (!player.dead && t - player.lastHurt > 6 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.03 * dt);
  }

  // jogador visual
  hero.root.position.copy(player.pos);
  hero.root.rotation.y = player.rotY;
  if (player.dead) hero.root.rotation.z = Math.min(Math.PI / 2, hero.root.rotation.z + dt * 4);
  animateCharacter(hero, t, moveAmount, player.attackAnim, !player.onGround);

  // NPCs olham para o jogador
  for (const n of npcs) {
    if (n.pos.distanceTo(player.pos) < 8) n.char.root.rotation.y = Math.atan2(player.pos.x - n.pos.x, player.pos.z - n.pos.z);
    animateCharacter(n.char, t, 0, 0);
    n.char.armL.rotation.x = Math.sin(t * 1.5 + n.pos.x) * 0.08;
  }

  enemies.update(dt, player, camera, { onPlayerHit });
  world.update(t, dt);

  // marcador de missão
  const q = player.quest;
  setMarker(q.status === 'available' ? '!' : q.status === 'complete' ? '?' : '');
  marker.position.y = 4.4 + Math.sin(t * 3) * 0.15;

  // zona
  const z = world.zoneAt(player.pos.x, player.pos.z);
  if (z && z !== currentZone) ui.log(`📍 ${z.name}`, 'info');
  currentZone = z;

  // boss bar
  const boss = enemies.list.find((e) => e.def.boss && e.state === 'chase');
  ui.boss(boss ? boss.def.name : null, boss ? boss.hp / boss.def.hp : 0);

  // câmera segue
  const target = new THREE.Vector3(player.pos.x, player.pos.y + 2.2, player.pos.z);
  camera.position.set(
    target.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    target.y + cam.dist * Math.sin(cam.pitch),
    target.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  );
  camera.position.y = Math.max(0.5, camera.position.y);
  camera.lookAt(target);
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
  ui.hud(player, xpToNext(player.level), WEAPONS[player.weaponLvl].name);
  const questTarget = q.status === 'active' ? def.where : (q.status === 'available' || q.status === 'complete') ? elder.pos : null;
  ui.minimap(player, enemies.alive(), npcs, questTarget);
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

ui.log('Bem-vindo a BlockQuest! Fale com o Ancião Bento (E).', 'info');
frame();

// atalho de debug no console
window.game = { player, enemies, reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } };
