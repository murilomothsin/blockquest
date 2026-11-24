import * as THREE from 'three';
import { ZONES, WORLD_RADIUS } from './world.js';
import { ITEMS, SHOP, CATEGORIES, category, itemStats, damageReduction } from './items.js';
import { ACTIONS, RESERVED, keyLabel } from './input.js';
import { roleOf } from './shared/roles.js';

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
  constructor(input, sound = null) {
    this.input = input;
    this.sound = sound;
    this.floats = [];
    this.dialogOpen = false;
    this.chatOpen = false;
    this.online = false;
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
  isBlocking() { return this.dialogOpen || this.modal !== null || this.chatOpen || this.reportOpen; }

  // ---------- Conta / online ----------
  setAccount(name, online, role = 'player') {
    const r = roleOf(role);
    $('pname').textContent = name;
    // etiqueta do cargo ao lado do nome (só equipe)
    let badge = $('pbadge');
    if (!badge) { badge = document.createElement('span'); badge.id = 'pbadge'; badge.className = 'rbadge'; $('pname').after(badge); }
    badge.textContent = r.tag || '';
    badge.title = r.label;
    badge.style.background = r.color;
    badge.classList.toggle('hidden', !r.tag);
    $('account').classList.toggle('hidden', !online);
    $('chat').classList.toggle('hidden', !online);
    this.online = online;
    this.renderHelp();
  }

  netStatus(text) { $('netstatus').innerHTML = text; }

  // ---------- Chat ----------
  chatMsg(from, text, cls = '', who = null, role = null) {
    const box = $('chatlog');
    const d = document.createElement('div');
    d.className = cls;
    const r = roleOf(role);
    if (from && r.tag) { // [ADM] / [MOD] / [QA] na frente do nome
      const t = document.createElement('span');
      t.className = 'rbadge';
      t.textContent = r.tag;
      t.title = r.label;
      t.style.background = r.color;
      d.append(t);
    }
    if (from) {
      const b = document.createElement('b');
      if (r.tag) b.style.color = r.color;
      b.textContent = `${from}: `;
      if (who) { // nome clicável: abre o menu (sussurrar / ignorar / denunciar)
        b.className = 'pname';
        b.title = `Opções para ${who}`;
        b.onclick = (e) => { e.stopPropagation(); this.onPlayerMenu?.(who, e.clientX, e.clientY); };
      }
      d.append(b);
    }
    d.append(document.createTextNode(text)); // textContent: nunca interpreta HTML vindo de outro jogador
    box.appendChild(d);
    while (box.children.length > 10) box.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; }, 12000);
  }

  /** Menu pequeno ao clicar no nome de um jogador. items: [{label, danger?, run}] */
  playerMenu(name, x, y, items) {
    this.closePlayerMenu();
    const m = document.createElement('div');
    m.id = 'pmenu';
    const h = document.createElement('div');
    h.className = 'pm-title'; h.textContent = name;
    m.append(h);
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      if (it.danger) b.className = 'danger';
      if (it.staff) b.className = 'staff';
      b.onclick = (e) => { e.stopPropagation(); this.closePlayerMenu(); it.run(); };
      m.append(b);
    }
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    m.style.top = `${Math.max(8, y - r.height - 6)}px`;
    setTimeout(() => addEventListener('pointerdown', this._pmClose = (e) => { if (!m.contains(e.target)) this.closePlayerMenu(); }), 0);
  }

  closePlayerMenu() {
    document.getElementById('pmenu')?.remove();
    if (this._pmClose) { removeEventListener('pointerdown', this._pmClose); this._pmClose = null; }
  }

  /** Janela de denúncia. onSubmit({reason, note}) */
  reportDialog(name, onSubmit) {
    this.closePlayerMenu();
    document.getElementById('report-bg')?.remove();
    const REASONS = [
      ['ofensa', 'Palavrões ou ofensas'], ['assedio', 'Assédio ou ameaça'], ['spam', 'Spam / propaganda'],
      ['trapaca', 'Trapaça (hack)'], ['nome', 'Nome inadequado'], ['outro', 'Outro motivo'],
    ];
    const bg = document.createElement('div');
    bg.id = 'report-bg';
    const box = document.createElement('div');
    box.id = 'report';
    const h = document.createElement('h3');
    h.textContent = `🚩 Denunciar ${name}`;
    const p = document.createElement('p');
    p.textContent = 'As últimas mensagens desse jogador são anexadas automaticamente. Denúncias falsas podem gerar punição.';
    const list = document.createElement('div');
    list.className = 'reasons';
    for (const [id, label] of REASONS) {
      const l = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'reason'; r.value = id;
      l.append(r, ` ${label}`);
      list.append(l);
    }
    const note = document.createElement('textarea');
    note.maxLength = 300; note.placeholder = 'Detalhes (opcional)';
    const err = document.createElement('div');
    err.className = 'err';
    const row = document.createElement('div');
    row.className = 'row';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancelar';
    const send = document.createElement('button');
    send.textContent = 'Enviar denúncia'; send.className = 'danger';
    row.append(cancel, send);
    box.append(h, p, list, note, err, row);
    bg.append(box);
    document.body.append(bg);
    this.reportOpen = true;
    this.input.keys.clear();
    const close = () => { bg.remove(); this.reportOpen = false; };
    cancel.onclick = close;
    list.onchange = () => { err.textContent = ''; };
    bg.onclick = (e) => { if (e.target === bg) close(); };
    box.onkeydown = (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); };
    send.onclick = () => {
      const reason = list.querySelector('input:checked')?.value;
      if (!reason) { err.textContent = 'Escolha um motivo.'; return; }
      onSubmit({ reason, note: note.value.trim() });
      close();
    };
  }

  openChat(onSend) {
    const inp = $('chatinput');
    this.chatOpen = true;
    this.input.keys.clear();
    $('chat').classList.add('open');
    inp.classList.remove('hidden');
    inp.value = '';
    inp.focus();
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = inp.value.trim();
        if (text) onSend(text);
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    };
  }

  closeChat() {
    const inp = $('chatinput');
    this.chatOpen = false;
    inp.blur();
    inp.classList.add('hidden');
    $('chat').classList.remove('open');
  }

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
    const def = this.game?.defense() || 0;
    $('defense').textContent = def ? `🛡️ Defesa ${def} (−${Math.round(damageReduction(def) * 100)}% dano)` : '🛡️ Sem armadura';
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

  /** Aviso grande no meio da tela (avisos da equipe, expulsão) */
  announce(text, from = '') {
    let el = $('announce');
    if (!el) { el = document.createElement('div'); el.id = 'announce'; document.body.append(el); }
    el.replaceChildren();
    const h = document.createElement('small'); h.textContent = from;
    const t = document.createElement('div'); t.textContent = text;
    el.append(h, t);
    el.classList.remove('hidden', 'show');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('show');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => el.classList.remove('show'), 7000);
  }

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
        const eq = this.game.isEquipped(id);
        const locked = eq && player.inv[id] <= 1;
        return this.itemCard(id, {
          owned: player.inv[id],
          badge: eq ? 'equipado' : null,
          actions: [h('span', { class: 'price sell' }, `+🪙 ${it.sell}`),
            h('button', { class: 'sellbtn', disabled: locked, title: locked ? 'Tire ou troque este item antes de vender' : '', onclick: this.act(() => sell(id)) }, locked ? 'Equipado' : 'Vender')],
        });
      }));
    }
  }

  renderInventory(body) {
    const { player, use, equip, unequip, isEquipped, defense } = this.game;
    $('mtitle').innerHTML = `🎒 Inventário <span class="goldtag">🪙 ${player.gold}</span>`;

    // espaços de equipamento no topo
    const def = defense();
    const slot = (label, id, slotKey) => {
      const it = ITEMS[id];
      return h('div', { class: `slot ${it ? '' : 'empty'}`, style: `--c:${it?.color != null ? hex(it.color) : '#555'}` },
        h('div', { class: 'icon' }, it ? it.icon : '—'),
        h('div', { class: 'info' }, h('small', {}, label), h('b', {}, it ? it.name : 'Vazio'), it ? h('small', {}, itemStats(it)) : null),
        it && slotKey ? h('button', { class: 'mini secondary', onclick: this.act(() => unequip(slotKey)) }, 'Tirar') : null);
    };
    body.append(
      h('div', { class: 'slots' },
        slot('Arma', player.equipped, null),
        slot('Armadura', player.armor, 'armor'),
        slot('Capacete', player.helmet, 'helmet')),
      h('p', { class: 'defense' }, `🛡️ Defesa total ${def} → bloqueia ${Math.round(damageReduction(def) * 100)}% do dano recebido`),
    );

    const ids = Object.keys(player.inv).filter((id) => player.inv[id] > 0);
    if (!ids.length) body.append(h('p', { class: 'empty' }, 'Inventário vazio.'));
    body.append(...this.grouped(ids, (id) => {
      const it = ITEMS[id];
      const isEq = isEquipped(id);
      const btn = it.kind === 'consumable'
        ? h('button', { onclick: this.act(() => use(id)) }, 'Usar')
        : h('button', { disabled: isEq, onclick: this.act(() => equip(id)) }, isEq ? 'Equipado' : 'Equipar');
      return this.itemCard(id, { owned: player.inv[id], badge: isEq ? 'equipado' : null, actions: [btn] });
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
      ...(this.online ? [['Chat', [h('kbd', {}, 'Enter')]]] : []),
      ...ACTIONS.filter((a) => a.id !== 'help').map((a) => [a.label, caps(this.input.bindings[a.id])]),
    ];
    el.append(
      h('div', { class: 'chead' },
        h('b', {}, '⌨️ Controles'),
        h('button', { class: 'mini', onclick: () => this.openModal('keys') }, '⚙️ Personalizar'),
        h('button', { class: 'mini secondary', title: `Ocultar [${helpKey}]`, onclick: () => this.toggleHelp() }, '✕')),
      h('div', { class: 'cgrid' }, rows.map(([label, keys]) => h('div', { class: 'crow' }, h('span', {}, label), h('span', { class: 'ckeys' }, keys.length ? keys : h('kbd', { class: 'none' }, '—'))))),
    );
    if (this.sound) {
      const s = this.sound;
      const slider = h('input', { type: 'range', min: '0', max: '1', step: '0.05', class: 'vol' });
      slider.value = String(s.volume);
      slider.oninput = () => { s.setVolume(+slider.value); if (s.muted && +slider.value > 0) { s.setMuted(false); this.renderHelp(); } };
      slider.onchange = () => slider.blur(); // devolve o teclado pro jogo
      el.append(h('div', { class: 'cvol' },
        h('button', { class: 'mini secondary', title: 'Liga/desliga o som', onclick: () => { s.toggleMute(); this.renderHelp(); } }, s.muted ? '🔇' : '🔊'),
        h('span', {}, 'Volume'), slider));
    }
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
  minimap(player, enemies, npcs, target, loot = [], others = []) {
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
    for (const o of others) { // outros jogadores
      const [x, y] = toMap(o.pos.x, o.pos.z);
      g.fillStyle = '#4fc3ff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
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
