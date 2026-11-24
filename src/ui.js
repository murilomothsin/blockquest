import * as THREE from 'three';
import { ZONES, WORLD_RADIUS } from './world.js';
import { ITEMS, SHOP, CATEGORIES, category, itemStats, damageReduction } from './items.js';
import { ACTIONS, RESERVED, keyLabel } from './input.js';
import { roleOf } from './shared/roles.js';
import { BIOMES, biomeBlend, MINE, MINE_GRID, HOME_FURNITURE, inMine, inHome } from './shared/worldData.js';
import {
  CLASSES, CLASS_IDS, CLASS_LEVEL, TREES, SKILLS, RESPEC_COST, skillPointsFree, skillPointsTotal, canRaise, statsOf, activeSkillOf,
} from './shared/classes.js';

const $ = (id) => document.getElementById(id);
const tmp = new THREE.Vector3();
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
/** moeda dourada desenhada em CSS (o emoji 🪙 sai prateado em alguns sistemas) */
const coinEl = () => { const i = document.createElement('i'); i.className = 'coin'; return i; };
/** texto com 🪙 trocado pela moeda dourada (sem nunca interpretar HTML) */
export function rich(text) {
  const parts = String(text).split('🪙');
  const out = [];
  parts.forEach((t, i) => { if (i) out.push(coinEl()); if (t) out.push(document.createTextNode(t)); });
  return out;
}
const setRich = (el, text) => el.replaceChildren(...rich(text));
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') el.onclick = v;
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null) continue;
    if (c instanceof Node) el.append(c);
    else el.append(...rich(c));
  }
  return el;
};
const fmtTime = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
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
    this.maps = buildMapImages();
    this.homeTab = 'rack';
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
    // classe e pontos livres
    const cl = CLASSES[p.cls];
    const free = skillPointsFree(p);
    const treeKey = keyLabel(this.input.bindings.tree.find(Boolean));
    const ck = `${p.cls}|${free}|${p.level}|${treeKey}`;
    if (ck !== this._clsKey) {
      this._clsKey = ck;
      const el = $('pclass');
      el.replaceChildren();
      if (cl) {
        el.append(h('span', { class: 'clsname', style: `color:${cl.color}` }, `${cl.icon} ${cl.name}`));
        if (free > 0) el.append(h('button', { class: 'pts', onclick: () => this.openModal('tree') }, `⭐ ${free} ponto${free > 1 ? 's' : ''} [${treeKey}]`));
      } else if (p.level >= CLASS_LEVEL) {
        el.append(h('button', { class: 'pts pulse', onclick: () => this.openModal('class') }, `⭐ Escolher classe [${treeKey}]`));
      } else el.append(h('small', { class: 'muted' }, `Classe no nível ${CLASS_LEVEL}`));
    }
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
    setRich(d, msg); d.className = cls;
    box.appendChild(d);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; }, 5000);
    setTimeout(() => d.remove(), 5600);
  }

  prompt(text) {
    const el = $('prompt');
    if (text === this._prompt) return;
    this._prompt = text;
    if (text) { setRich(el, text); el.classList.remove('hidden'); } else el.classList.add('hidden');
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
    setRich($('dtext'), text);
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

  /** info = { by, lost, pct, items, nextPct, resetAt } */
  death(show, onRespawn, info = null) {
    $('death').classList.toggle('hidden', !show);
    if (onRespawn) $('respawn').onclick = onRespawn;
    if (!show) return;
    const box = $('deathinfo');
    box.replaceChildren();
    if (!info) return;
    box.append(
      h('p', {}, `Derrotado por ${info.by}.`),
      h('p', { class: 'bad' }, info.items ? `Você perdeu tudo o que carregava (${info.items} ${info.items > 1 ? 'itens' : 'item'}).` : 'Você não carregava itens.'),
      h('p', { class: 'bad' }, `−${info.lost} 🪙 (${info.pct}% do ouro na mão)`),
      h('p', { class: 'tip' }, `A próxima morte custa ${info.nextPct}%. O contador zera em ${fmtTime(info.resetAt - Date.now())} (meia-noite UTC, a cada 2 dias).`),
      h('p', { class: 'tip' }, '💡 Guarde equipamento no armário, poções no baú e ouro no cofre da sua casa: o que está lá nunca se perde.'),
    );
  }

  /** botão da habilidade ativa com a recarga */
  skillButton(p, readyAt, now) {
    const id = activeSkillOf(p);
    const btn = $('skillbtn');
    if (!id) { btn.classList.add('hidden'); return; }
    const S = SKILLS[id];
    btn.classList.remove('hidden');
    btn.title = `${S.name}: ${S.desc}`;
    btn.querySelector('.sicon').textContent = S.icon;
    btn.querySelector('.skey').textContent = keyLabel(this.input.bindings.skill.find(Boolean));
    const left = Math.max(0, readyAt - now);
    btn.querySelector('.scd').textContent = left > 0 ? Math.ceil(left) : '';
    btn.classList.toggle('cooling', left > 0);
    btn.style.setProperty('--cd', `${left > 0 ? (left / S.cd) * 100 : 0}%`);
  }

  /** nome da região/bioma embaixo do minimapa */
  region(text) { if (text !== this._region) { this._region = text; $('region').textContent = text || ''; } }

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
    $('modal').className = this.modal || '';
    if (this.modal === 'shop') this.renderShop(body, tabs);
    else if (this.modal === 'inventory') this.renderInventory(body);
    else if (this.modal === 'keys') this.renderKeys(body);
    else if (this.modal === 'class') this.renderClass(body);
    else if (this.modal === 'tree') this.renderTree(body);
    else if (this.modal === 'home') this.renderHome(body, tabs);
  }

  setTitle(text) { setRich($('mtitle'), text); }

  // ---------- Escolha de classe ----------
  renderClass(body) {
    const { player, chooseClass } = this.game;
    this.setTitle('⭐ Escolha sua classe');
    body.append(h('p', { class: 'hint' }, `A escolha é permanente. Cada classe tem um bônus fixo e uma árvore com 5 habilidades: você ganha 1 ponto por nível (a partir do ${CLASS_LEVEL}).`));
    if (player.level < CLASS_LEVEL) body.append(h('p', { class: 'empty' }, `Chegue ao nível ${CLASS_LEVEL} para escolher.`));
    body.append(h('div', { class: 'classes' }, CLASS_IDS.map((id) => {
      const c = CLASSES[id];
      const act = TREES[id].find((n) => n.active);
      return h('div', { class: 'ccard', style: `--c:${c.color}` },
        h('div', { class: 'cicon' }, c.icon),
        h('b', {}, c.name),
        h('small', { class: 'from' }, c.from),
        h('p', {}, c.desc),
        h('p', { class: 'pas' }, `✔ ${c.passive}`),
        h('p', { class: 'pas' }, `⚔️ Melhor com: ${c.weapon}`),
        h('p', { class: 'pas' }, `${SKILLS[act.active].icon} Habilidade: ${SKILLS[act.active].name}`),
        h('p', { class: 'pas' }, `🎁 Ganha: ${ITEMS[c.starter].icon} ${ITEMS[c.starter].name}`),
        h('button', { disabled: player.level < CLASS_LEVEL || !!player.cls, onclick: () => chooseClass(id) }, `Ser ${c.name}`));
    })));
  }

  // ---------- Árvore de habilidades ----------
  renderTree(body) {
    const { player, skillUp, respec } = this.game;
    const cl = CLASSES[player.cls];
    if (!cl) { this.modal = 'class'; return this.renderModal(); }
    const free = skillPointsFree(player);
    this.setTitle(`${cl.icon} ${cl.name} — Habilidades`);
    const s = statsOf(player);
    const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    body.append(
      h('p', { class: 'hint' }, `Pontos livres: ${free} de ${skillPointsTotal(player.level)} · 1 ponto por nível · bônus da classe: ${cl.passive}`),
      h('div', { class: 'statline' },
        h('span', {}, `❤️ Vida ${pct(s.hpMul - 1)}`), h('span', {}, `🛡️ Defesa +${s.def}`),
        h('span', {}, `⚔️ Corpo a corpo ${pct(s.dmg.melee - 1)}`), h('span', {}, `🏹 Distância ${pct(s.dmg.ranged - 1)}`),
        h('span', {}, `🔮 Magia ${pct(s.dmg.magic - 1)}`), h('span', {}, `💥 Crítico ${Math.round(s.crit * 100)}% (x${s.critMul.toFixed(2)})`),
        s.dodge ? h('span', {}, `💨 Esquiva ${Math.round(s.dodge * 100)}%`) : null),
    );
    // 3 nós de base em cima; habilidade ativa e o nó final embaixo (ligados)
    const node = (n) => {
      const have = player.skills[n.id] || 0;
      const why = canRaise(player, n.id);
      const locked = Object.entries(n.req || {}).some(([r, need]) => (player.skills[r] || 0) < need);
      return h('div', { class: `node ${have ? 'have' : ''} ${locked ? 'locked' : ''} ${n.active ? 'active' : ''}`, style: `--c:${cl.color}` },
        h('div', { class: 'nicon' }, n.icon),
        h('b', {}, n.name),
        h('small', {}, n.desc),
        h('div', { class: 'pips' }, Array.from({ length: n.max }, (_, i) => h('i', { class: i < have ? 'on' : '' }))),
        h('button', { class: 'mini', disabled: !!why, title: why || '', onclick: () => skillUp(n.id) }, have >= n.max ? 'Máximo' : '+1'));
    };
    const tree = TREES[player.cls];
    body.append(h('div', { class: 'tree' },
      h('div', { class: 'trow' }, tree.slice(0, 3).map(node)),
      h('div', { class: 'tlink' }, `↓ ${tree[3].name} precisa de ${Object.keys(tree[3].req).map((r) => tree.find((t) => t.id === r).name).join(', ')}`),
      h('div', { class: 'trow' }, node(tree[3]), h('span', { class: 'arrow' }, '→'), node(tree[4])),
    ));
    const spent = Object.values(player.skills).reduce((a, b) => a + b, 0);
    if (spent) body.append(h('div', { class: 'kfoot' }, h('button', { class: 'secondary', onclick: () => respec() }, `↺ Redistribuir pontos (${RESPEC_COST(player.level)} 🪙, com o Ancião Bento)`)));
  }

  // ---------- Casa: armário, baú, cofre, espelho ----------
  renderHome(body, tabs) {
    const { player, store, take, deposit, withdraw } = this.game;
    const F = HOME_FURNITURE;
    const tab = this.homeTab;
    this.setTitle(`🏠 Sua Casa — ${F[tab].icon} ${F[tab].name}`);
    for (const id of ['rack', 'chest', 'safe', 'mirror']) {
      tabs.appendChild(h('button', { class: `tab ${tab === id ? 'active' : ''}`, onclick: () => { this.homeTab = id; this.renderModal(); } }, `${F[id].icon} ${F[id].name}`));
    }
    body.append(h('p', { class: 'hint' }, `${F[tab].desc} O que fica guardado em casa não se perde quando você morre.`));
    if (tab === 'safe') {
      const amt = h('input', { type: 'number', min: '1', value: String(Math.max(1, player.gold)), class: 'amt' });
      const n = () => Math.max(1, Math.trunc(+amt.value || 1));
      body.append(
        h('div', { class: 'safe' },
          h('div', { class: 'sbox' }, h('small', {}, 'Na mão'), h('b', {}, `🪙 ${player.gold}`)),
          h('div', { class: 'sbox' }, h('small', {}, 'No cofre'), h('b', {}, `🪙 ${player.home.safe}`))),
        h('div', { class: 'safeact' }, amt,
          h('button', { disabled: !player.gold, onclick: () => deposit(n()) }, 'Guardar'),
          h('button', { disabled: !player.gold, onclick: () => deposit(-1) }, 'Guardar tudo'),
          h('button', { class: 'secondary', disabled: !player.home.safe, onclick: () => withdraw(n()) }, 'Retirar'),
          h('button', { class: 'secondary', disabled: !player.home.safe, onclick: () => withdraw(-1) }, 'Retirar tudo')),
      );
      return;
    }
    if (tab === 'mirror') {
      body.append(h('p', { class: 'empty' }, '🪞 Em breve: cor de cabelo, roupas e acessórios do personagem.'));
      return;
    }
    const fits = (id) => (tab === 'rack' ? ITEMS[id].kind !== 'consumable' : ITEMS[id].kind === 'consumable');
    const carried = Object.keys(player.inv).filter((id) => player.inv[id] > 0 && fits(id));
    const stored = Object.keys(player.home[tab]).filter((id) => player.home[tab][id] > 0);
    body.append(h('div', { class: 'cols' },
      h('div', {}, h('h4', {}, '🎒 Com você'),
        carried.length ? h('div', { class: 'grid one' }, carried.map((id) => {
          const eqWeapon = player.equipped === id && player.inv[id] <= 1;
          return this.itemCard(id, {
            owned: player.inv[id], badge: this.game.isEquipped(id) ? 'equipado' : null,
            actions: [h('button', { disabled: eqWeapon, title: eqWeapon ? 'Equipe outra arma antes' : '', onclick: () => store(tab, id, 1) }, 'Guardar'),
              player.inv[id] > 1 ? h('button', { class: 'secondary', onclick: () => store(tab, id, -1) }, 'Todos') : null],
          });
        })) : h('p', { class: 'empty' }, 'Nada para guardar.')),
      h('div', {}, h('h4', {}, `${F[tab].icon} Guardado`),
        stored.length ? h('div', { class: 'grid one' }, stored.map((id) => this.itemCard(id, {
          owned: player.home[tab][id],
          actions: [h('button', { onclick: () => take(tab, id, 1) }, 'Pegar'),
            player.home[tab][id] > 1 ? h('button', { class: 'secondary', onclick: () => take(tab, id, -1) }, 'Todos') : null],
        }))) : h('p', { class: 'empty' }, 'Vazio.')),
    ));
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
    $('mtitle').replaceChildren(h('span', {}, '🛒 Mercadora Lia '), h('span', { class: 'goldtag' }, `🪙 ${player.gold}`));
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
    $('mtitle').replaceChildren(h('span', {}, '🎒 Inventário '), h('span', { class: 'goldtag' }, `🪙 ${player.gold}`), h('span', { class: 'warn' }, '⚠️ itens carregados se perdem ao morrer'));

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
    el.className = 'float'; setRich(el, text);
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
  minimap(player, enemies, npcs, target, loot = [], others = [], marks = []) {
    const g = this.mini, W = 170;
    const mine = inMine(player.pos.x, player.pos.z), home = inHome(player.pos.x, player.pos.z);
    const R = mine ? 36 : home ? 12 : 60, sc = W / 2 / R;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = mine ? '#1a1410' : home ? '#6b4a2b' : '#3f7d34'; g.fillRect(0, 0, W, W);
    const toMap = (x, z) => [W / 2 + (x - player.pos.x) * sc, W / 2 + (z - player.pos.z) * sc];
    if (mine) {
      const m = this.maps.mine;
      g.imageSmoothingEnabled = false;
      g.drawImage(m.img, ...toMap(m.x0, m.z0), m.w * sc, m.h * sc);
    } else if (!home) {
      const m = this.maps.world;
      g.drawImage(m.img, ...toMap(m.x0, m.z0), m.w * sc, m.h * sc);
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3;
      g.beginPath(); g.arc(...toMap(0, 0), WORLD_RADIUS * sc, 0, Math.PI * 2); g.stroke();
      for (const z of ZONES) {
        g.fillStyle = z.color + '88';
        g.beginPath(); g.arc(...toMap(z.x, z.z), z.r * sc, 0, Math.PI * 2); g.fill();
      }
    }
    for (const mk of marks) { // baús de tesouro, portas
      const [x, y] = toMap(mk.x, mk.z);
      g.font = '12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = mk.dim ? 0.4 : 1;
      g.fillText(mk.icon, x, y);
      g.globalAlpha = 1;
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

/** imagens pré-desenhadas do minimapa: superfície (cores dos biomas) e planta da mina */
function buildMapImages() {
  const R = WORLD_RADIUS + 20, step = 2, n = Math.ceil((R * 2) / step);
  const wc = document.createElement('canvas'); wc.width = wc.height = n;
  const g = wc.getContext('2d');
  const img = g.createImageData(n, n);
  const base = new THREE.Color(0x3f7d34), c = new THREE.Color(), tmpC = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -R + i * step, z = -R + j * step;
      const b = biomeBlend(x, z);
      c.copy(base);
      if (b.k > 0) c.lerp(tmpC.setHex(BIOMES[b.id].map ?? BIOMES[b.id].ground), b.k);
      const o = (j * n + i) * 4;
      img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const mc = document.createElement('canvas'); mc.width = MINE.cols; mc.height = MINE.rows;
  const mg = mc.getContext('2d');
  for (let z = 0; z < MINE.rows; z++) for (let x = 0; x < MINE.cols; x++) {
    mg.fillStyle = MINE_GRID[z][x] ? '#2a221c' : '#8a7660';
    mg.fillRect(x, z, 1, 1);
  }
  return {
    world: { img: wc, x0: -R, z0: -R, w: n * step, h: n * step },
    mine: { img: mc, x0: MINE.x0, z0: MINE.z0, w: MINE.cols * MINE.tile, h: MINE.rows * MINE.tile },
  };
}
