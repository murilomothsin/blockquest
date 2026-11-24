import * as THREE from 'three';
import { ZONES, WORLD_RADIUS } from './world.js';
import { ITEMS, SHOP, CATEGORIES, category, itemStats } from './items.js';
import { ACTIONS, RESERVED, keyLabel } from './input.js';

const $ = (id) => document.getElementById(id);
const tmp = new THREE.Vector3();
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') el.onclick = v;
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : String(c));
  return el;
};

export class UI {
  constructor(input) {
    this.input = input;
    this.floats = [];
    this.dialogOpen = false;
    this.modal = null; // 'shop' | 'inventory' | 'keys'
    this.shopTab = 'buy';
    this.game = null; // { player, buy, sell, use, equip }
    this.mini = $('minimap').getContext('2d');
    const pref = localStorage.getItem('blockquest-help-collapsed');
    this.helpCollapsed = pref != null ? pref === '1' : (innerWidth < 1100 || innerHeight < 700);
    $('mclose').onclick = () => this.closeModal();
    $('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') this.closeModal(); };
    // tira o foco de botões depois do clique (senão Espaço "clica" de novo)
    document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());
    this.renderHelp();
  }

  setGame(g) { this.game = g; }
  isBlocking() { return this.dialogOpen || this.modal !== null; }

  hud(p, xpNext, weapon) {
    $('level').textContent = p.level;
    $('hpfill').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('hptext').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('xpfill').style.width = `${(p.xp / xpNext) * 100}%`;
    $('xptext').textContent = `XP ${p.xp} / ${xpNext}`;
    $('gold').textContent = p.gold;
    $('potions').textContent = p.inv.potion || 0;
    $('bigpotions').textContent = p.inv.big_potion || 0;
    $('weapon').textContent = `${weapon.icon} ${weapon.name}`;
    $('drop').textContent = `${p.kills % 5}/5`;
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

  // ---------- Diálogo simples (NPC) ----------
  dialog(title, text, buttons = []) {
    this.dialogOpen = true;
    $('dialog').classList.remove('hidden');
    $('dtitle').textContent = title;
    $('dtext').textContent = text;
    const b = $('dbuttons'); b.innerHTML = '';
    for (const btn of [...buttons, { label: 'Fechar', secondary: true, onClick: () => this.closeDialog() }]) {
      b.appendChild(h('button', { class: btn.secondary ? 'secondary' : '', disabled: btn.disabled, onclick: () => btn.onClick() }, btn.label));
    }
  }

  closeDialog() { this.dialogOpen = false; $('dialog').classList.add('hidden'); }

  death(show, onRespawn) {
    $('death').classList.toggle('hidden', !show);
    if (onRespawn) $('respawn').onclick = onRespawn;
  }

  // ---------- Janelas (loja, inventário, teclas) ----------
  openModal(kind) {
    this.closeDialog();
    this.modal = kind;
    $('modal-bg').classList.remove('hidden');
    this.renderModal();
  }

  closeModal() {
    this.modal = null;
    this.input.capture = null;
    $('modal-bg').classList.add('hidden');
  }

  toggleModal(kind) { if (this.modal === kind) this.closeModal(); else this.openModal(kind); }

  refresh() { if (this.modal) this.renderModal(); }

  renderModal() {
    const body = $('mbody'), tabs = $('mtabs');
    body.innerHTML = ''; tabs.innerHTML = '';
    if (this.modal === 'shop') this.renderShop(body, tabs);
    else if (this.modal === 'inventory') this.renderInventory(body);
    else if (this.modal === 'keys') this.renderKeys(body);
  }

  itemCard(id, { owned, badge, actions }) {
    const it = ITEMS[id];
    const color = it.color != null ? hex(it.color) : '#7dff7d';
    return h('div', { class: 'card', style: `--c:${color}` },
      h('div', { class: 'icon' }, it.icon),
      h('div', { class: 'info' },
        h('b', {}, it.name, badge ? h('span', { class: 'badge' }, badge) : null),
        h('small', {}, itemStats(it)),
        owned != null ? h('small', { class: 'own' }, `Você tem: ${owned}`) : null),
      h('div', { class: 'act' }, ...actions));
  }

  grouped(ids, render) {
    const frag = [];
    for (const [cat, title] of CATEGORIES) {
      const list = ids.filter((id) => category(ITEMS[id]) === cat);
      if (!list.length) continue;
      frag.push(h('h4', {}, title), h('div', { class: 'grid' }, list.map(render)));
    }
    return frag;
  }

  act(fn) { return () => { fn(); this.refresh(); }; }

  renderShop(body, tabs) {
    const { player, buy, sell } = this.game;
    $('mtitle').innerHTML = `🛒 Mercadora Lia <span class="goldtag">🪙 ${player.gold}</span>`;
    for (const [id, label] of [['buy', 'Comprar'], ['sell', 'Vender']]) {
      tabs.appendChild(h('button', { class: `tab ${this.shopTab === id ? 'active' : ''}`, onclick: () => { this.shopTab = id; this.renderModal(); } }, label));
    }
    if (this.shopTab === 'buy') {
      body.append(...this.grouped(SHOP, (id) => {
        const it = ITEMS[id];
        return this.itemCard(id, {
          owned: player.inv[id] || 0,
          actions: [h('span', { class: 'price' }, `🪙 ${it.price}`),
            h('button', { disabled: player.gold < it.price, onclick: this.act(() => buy(id)) }, 'Comprar')],
        });
      }));
    } else {
      const ids = Object.keys(player.inv).filter((id) => player.inv[id] > 0);
      if (!ids.length) body.append(h('p', { class: 'empty' }, 'Nada para vender.'));
      body.append(...this.grouped(ids, (id) => {
        const it = ITEMS[id];
        const locked = id === player.equipped && player.inv[id] <= 1;
        return this.itemCard(id, {
          owned: player.inv[id],
          badge: id === player.equipped ? 'equipada' : null,
          actions: [h('span', { class: 'price sell' }, `+🪙 ${it.sell}`),
            h('button', { class: 'sellbtn', disabled: locked, title: locked ? 'Equipe outra arma antes de vender esta' : '', onclick: this.act(() => sell(id)) }, locked ? 'Equipada' : 'Vender')],
        });
      }));
    }
  }

  renderInventory(body) {
    const { player, use, equip } = this.game;
    $('mtitle').innerHTML = `🎒 Inventário <span class="goldtag">🪙 ${player.gold}</span>`;
    const ids = Object.keys(player.inv).filter((id) => player.inv[id] > 0);
    if (!ids.length) body.append(h('p', { class: 'empty' }, 'Inventário vazio.'));
    body.append(...this.grouped(ids, (id) => {
      const it = ITEMS[id];
      const isEq = id === player.equipped;
      const btn = it.kind === 'consumable'
        ? h('button', { onclick: this.act(() => use(id)) }, 'Usar')
        : h('button', { disabled: isEq, onclick: this.act(() => equip(id)) }, isEq ? 'Equipada' : 'Equipar');
      return this.itemCard(id, { owned: player.inv[id], badge: isEq ? 'equipada' : null, actions: [btn] });
    }));
  }

  renderKeys(body) {
    $('mtitle').textContent = '⚙️ Personalizar controles';
    body.append(h('p', { class: 'hint' }, 'Clique num botão e aperte a tecla (ou botão do mouse) desejada. Esc cancela, Backspace limpa. WASD/setas e o botão direito (câmera) são fixos.'));
    const table = h('div', { class: 'keys' });
    for (const a of ACTIONS) {
      const slots = [0, 1].map((slot) => {
        const btn = h('button', { class: 'keycap-btn' }, keyLabel(this.input.bindings[a.id][slot]));
        btn.onclick = () => {
          btn.textContent = 'Aperte…'; btn.classList.add('listening');
          this.input.startCapture((code) => {
            if (code === 'Escape') return this.renderModal();
            if (RESERVED.includes(code)) { this.log(`${keyLabel(code)} é reservada.`, 'bad'); return this.renderModal(); }
            const moved = this.input.setBinding(a.id, slot, code === 'Backspace' ? null : code);
            if (moved) this.log(`${keyLabel(code)} foi removida de "${moved}".`, 'info');
            this.renderHelp(); this.renderModal();
          });
        };
        return btn;
      });
      table.append(h('div', { class: 'krow' }, h('span', {}, a.label), ...slots));
    }
    body.append(table, h('div', { class: 'kfoot' },
      h('button', { class: 'secondary', onclick: () => { this.input.resetBindings(); this.renderHelp(); this.renderModal(); } }, 'Restaurar padrão')));
  }

  // ---------- Painel de controles ----------
  renderHelp() {
    const el = $('controls');
    el.innerHTML = '';
    el.classList.toggle('collapsed', this.helpCollapsed);
    const helpKey = keyLabel(this.input.bindings.help.find(Boolean));
    if (this.helpCollapsed) {
      el.append(h('button', { class: 'pill', onclick: () => this.toggleHelp() }, `⌨️ Controles [${helpKey}]`));
      return;
    }
    const caps = (list) => list.filter(Boolean).map((c) => h('kbd', {}, keyLabel(c)));
    const rows = [
      ['Mover', [h('kbd', {}, 'W'), h('kbd', {}, 'A'), h('kbd', {}, 'S'), h('kbd', {}, 'D')]],
      ['Câmera', [h('kbd', {}, 'Botão dir. + arrastar')]],
      ['Zoom', [h('kbd', {}, 'Scroll')]],
      ['Travar alvo', [h('kbd', {}, 'Clique no inimigo')]],
      ...ACTIONS.filter((a) => a.id !== 'help').map((a) => [a.label, caps(this.input.bindings[a.id])]),
    ];
    el.append(
      h('div', { class: 'chead' },
        h('b', {}, '⌨️ Controles'),
        h('button', { class: 'mini', onclick: () => this.openModal('keys') }, '⚙️ Personalizar'),
        h('button', { class: 'mini secondary', title: `Ocultar [${helpKey}]`, onclick: () => this.toggleHelp() }, '✕')),
      h('div', { class: 'cgrid' }, rows.map(([label, keys]) => h('div', { class: 'crow' }, h('span', {}, label), h('span', { class: 'ckeys' }, keys.length ? keys : h('kbd', { class: 'none' }, '—'))))),
    );
  }

  toggleHelp() {
    this.helpCollapsed = !this.helpCollapsed;
    localStorage.setItem('blockquest-help-collapsed', this.helpCollapsed ? '1' : '0');
    this.renderHelp();
  }

  // ---------- Números flutuantes ----------
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

  // ---------- Minimapa ----------
  minimap(player, enemies, npcs, target, loot = []) {
    const g = this.mini, W = 170, R = 60, sc = W / 2 / R;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#3f7d34'; g.fillRect(0, 0, W, W);
    const toMap = (x, z) => [W / 2 + (x - player.pos.x) * sc, W / 2 + (z - player.pos.z) * sc];
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3;
    g.beginPath(); g.arc(...toMap(0, 0), WORLD_RADIUS * sc, 0, Math.PI * 2); g.stroke();
    for (const z of ZONES) {
      g.fillStyle = z.color + '88';
      g.beginPath(); g.arc(...toMap(z.x, z.z), z.r * sc, 0, Math.PI * 2); g.fill();
    }
    for (const e of enemies) {
      const [x, y] = toMap(e.pos.x, e.pos.z);
      const s = e.def.boss ? 8 : 4;
      g.fillStyle = e.def.boss ? '#b46bff' : '#ff4040';
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    for (const l of loot) {
      const [x, y] = toMap(l.g.position.x, l.g.position.z);
      g.fillStyle = '#ffffff'; g.font = '12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🎁', x, y);
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
    g.translate(W / 2, W / 2);
    g.rotate(-player.rotY + Math.PI);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }
}
