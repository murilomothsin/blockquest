import * as THREE from 'three';
import { ZONES, WORLD_RADIUS } from './world.js';

const $ = (id) => document.getElementById(id);
const tmp = new THREE.Vector3();

export class UI {
  constructor() {
    this.floats = [];
    this.dialogOpen = false;
    this.mini = $('minimap').getContext('2d');
  }

  hud(p, xpNext, weaponName) {
    $('level').textContent = p.level;
    $('hpfill').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('hptext').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('xpfill').style.width = `${(p.xp / xpNext) * 100}%`;
    $('xptext').textContent = `XP ${p.xp} / ${xpNext}`;
    $('gold').textContent = p.gold;
    $('potions').textContent = p.potions;
    $('weapon').textContent = weaponName;
  }

  quest(html) { $('quest').innerHTML = html; }

  log(msg, cls = '') {
    const box = $('log');
    const d = document.createElement('div');
    d.textContent = msg; d.className = cls;
    box.appendChild(d);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; }, 5000);
    setTimeout(() => d.remove(), 5600);
  }

  prompt(text) {
    const el = $('prompt');
    if (text) { el.textContent = text; el.classList.remove('hidden'); } else el.classList.add('hidden');
  }

  boss(name, ratio) {
    const el = $('bossbar');
    if (name == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('bossname').textContent = name;
    $('bossfill').style.width = `${Math.max(0, ratio) * 100}%`;
  }

  dialog(title, text, buttons = []) {
    this.dialogOpen = true;
    $('dialog').classList.remove('hidden');
    $('dtitle').textContent = title;
    $('dtext').textContent = text;
    const b = $('dbuttons'); b.innerHTML = '';
    for (const btn of [...buttons, { label: 'Fechar', secondary: true, onClick: () => this.closeDialog() }]) {
      const el = document.createElement('button');
      el.textContent = btn.label;
      if (btn.secondary) el.className = 'secondary';
      if (btn.disabled) el.disabled = true;
      el.onclick = () => btn.onClick();
      b.appendChild(el);
    }
  }

  closeDialog() { this.dialogOpen = false; $('dialog').classList.add('hidden'); }

  death(show, onRespawn) {
    $('death').classList.toggle('hidden', !show);
    if (onRespawn) $('respawn').onclick = onRespawn;
  }

  float(worldPos, text, color = '#fff', size = 20) {
    const el = document.createElement('div');
    el.className = 'float'; el.textContent = text;
    el.style.color = color; el.style.fontSize = `${size}px`;
    $('floats').appendChild(el);
    this.floats.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0)), t: 0 });
  }

  updateFloats(camera, dt) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt; f.pos.y += dt * 1.6;
      tmp.copy(f.pos).project(camera);
      const behind = tmp.z > 1;
      f.el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
      f.el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
      f.el.style.opacity = behind ? 0 : Math.max(0, 1 - f.t / 1.2);
      if (f.t > 1.2) { f.el.remove(); this.floats.splice(i, 1); }
    }
  }

  minimap(player, enemies, npcs, target) {
    const g = this.mini, W = 170, R = 60, sc = W / 2 / R;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#3f7d34'; g.fillRect(0, 0, W, W);
    const toMap = (x, z) => [W / 2 + (x - player.pos.x) * sc, W / 2 + (z - player.pos.z) * sc];
    // limite do mundo
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3;
    g.beginPath(); g.arc(...toMap(0, 0), WORLD_RADIUS * sc, 0, Math.PI * 2); g.stroke();
    for (const z of ZONES) {
      g.fillStyle = z.color + '88';
      g.beginPath(); g.arc(...toMap(z.x, z.z), z.r * sc, 0, Math.PI * 2); g.fill();
    }
    for (const e of enemies) {
      const [x, y] = toMap(e.pos.x, e.pos.z);
      g.fillStyle = e.def.boss ? '#b46bff' : '#ff4040';
      g.fillRect(x - (e.def.boss ? 4 : 2), y - (e.def.boss ? 4 : 2), e.def.boss ? 8 : 4, e.def.boss ? 8 : 4);
    }
    for (const n of npcs) {
      const [x, y] = toMap(n.pos.x, n.pos.z);
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
    if (target) {
      let [x, y] = toMap(target.x, target.z);
      const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy);
      if (d > W / 2 - 10) { x = W / 2 + (dx / d) * (W / 2 - 10); y = W / 2 + (dy / d) * (W / 2 - 10); }
      g.fillStyle = '#ffd84a'; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('★', x, y);
    }
    // jogador
    g.translate(W / 2, W / 2);
    g.rotate(-player.rotY + Math.PI);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }
}
