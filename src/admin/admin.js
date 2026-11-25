// Painel admin do BlockQuest: visual (texturas, ícones, efeitos, vegetação), regras, estatísticas e resets.
import {
  TEXTURE_SLOTS, EFFECTS, PRESETS, DEFAULT_ASSETS, PACK_CATEGORIES, sanitizeAssets, iconPath, ICON_DEFAULTS,
} from '../shared/assetConfig.js';
import { ITEMS } from '../shared/items.js';
import { ROLES } from '../shared/roles.js';

const TOKEN_KEY = 'blockquest-token'; // a mesma sessão do jogo
const $ = (id) => document.getElementById(id);
const url = (p) => `/packs/${p}`;
const clone = (o) => structuredClone(o);

/** cria elemento: el('div', {class, onclick, ...}, filhos...) — texto sempre por textContent */
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e[k] = v;
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}

let token = localStorage.getItem(TOKEN_KEY);
async function api(path, body) {
  const res = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* vazio */ }
  if (!res.ok) { const e = new Error(data.error || `Erro ${res.status}`); e.status = res.status; throw e; }
  return data;
}

function toast(text, bad = false) {
  const t = $('toast');
  t.textContent = text; t.className = bad ? 'bad' : '';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ---------- login ----------
async function boot() {
  if (token) {
    try { const me = await api('/admin/me'); return start(me); } catch (e) {
      if (e.status === 403) $('lerror').textContent = e.message;
    }
  }
  $('login').classList.remove('hidden');
  $('lform').onsubmit = async (ev) => {
    ev.preventDefault();
    $('lerror').textContent = '';
    try {
      const d = await api('/login', { username: $('luser').value.trim(), password: $('lpass').value });
      token = d.token;
      localStorage.setItem(TOKEN_KEY, token);
      const me = await api('/admin/me');
      $('login').classList.add('hidden');
      start(me);
    } catch (e) { $('lerror').textContent = e.message; }
  };
}

const S = { me: null, saved: null, assets: null, packs: {}, settingDefs: {}, settings: {}, stats: null };

async function start(me) {
  S.me = me;
  S.settingDefs = me.settingDefs;
  $('app').classList.remove('hidden');
  $('tabs').classList.remove('hidden');
  $('who').replaceChildren(`👑 ${me.user.name} · `, el('a', { href: '#', onclick: (e) => { e.preventDefault(); localStorage.removeItem(TOKEN_KEY); location.reload(); }, style: 'color:var(--acc)' }, 'Sair'));
  for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => showTab(b.dataset.tab);
  const [cfg, packs] = await Promise.all([api('/admin/config'), api('/admin/packs')]);
  S.packs = packs;
  S.saved = sanitizeAssets(cfg.assets);
  S.assets = clone(S.saved);
  S.settings = cfg.settings;
  renderVisual();
  renderRules();
  setupPreview();
  setupResets();
  $('save').onclick = saveAssets;
  $('discard').onclick = () => { S.assets = clone(S.saved); changed(); renderVisual(); };
  const tab = location.hash.slice(1);
  if (['visual', 'regras', 'stats', 'reset'].includes(tab)) showTab(tab);
}

function showTab(id) {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === id);
  for (const p of document.querySelectorAll('.pane')) p.classList.toggle('hidden', p.dataset.pane !== id);
  $('savebar').classList.toggle('hidden', id !== 'visual');
  history.replaceState(null, '', `#${id}`);
  if (id === 'stats') loadStats();
}

// ---------- prévia (iframe com o jogo offline) ----------
const PLACES = [['🏘️ Vila', 0, 8], ['🌲 Floresta', -35, -35], ['🏰 Castelo', 48, -188], ['👻 Ruínas', 60, 172], ['🏜️ Deserto', 150, -40], ['🐸 Pântano', -130, 80], ['⛰️ Pedreira', -140, -90], ['⛏️ Mina', 418, -30], ['🗼 Torre', 642, 10]];
let previewReady = false;
function post(msg) { const w = $('pframe').contentWindow; if (w && previewReady) w.postMessage(msg, location.origin); }
function setupPreview() {
  $('pbar').replaceChildren(...PLACES.map(([n, x, z]) => el('button', { class: 'mini secondary', onclick: () => post({ t: 'preview-tp', x, z }) }, n)));
  addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.data?.t !== 'preview-ready') return;
    previewReady = true;
    post({ t: 'preview-assets', assets: S.assets });
  });
}
let pushT = 0;
function changed() {
  const dirty = JSON.stringify(S.assets) !== JSON.stringify(S.saved);
  $('dirty').textContent = dirty ? '● Alterações só na prévia — salve para os jogadores verem.' : 'Sem alterações.';
  $('savebar').classList.toggle('on', dirty);
  $('save').disabled = !dirty;
  clearTimeout(pushT);
  pushT = setTimeout(() => post({ t: 'preview-assets', assets: S.assets }), 120);
}
async function saveAssets() {
  try {
    const r = await api('/admin/config', { assets: S.assets });
    S.saved = sanitizeAssets(r.assets);
    S.assets = clone(S.saved);
    changed();
    toast('✅ Visual salvo e enviado para todos os jogadores online.');
  } catch (e) { toast(e.message, true); }
}

// ---------- seletor de imagens ----------
/** abre a grade de imagens de uma categoria. opts: {title, current, multi, onPick(path|null), selected:Set} */
function pick(cat, opts) {
  const packs = S.packs[cat] || [];
  if (!packs.length) return toast(`Nenhum pacote de ${PACK_CATEGORIES[cat]} encontrado.`, true);
  $('picker').classList.remove('hidden');
  $('ptitle').textContent = opts.title;
  const curPack = opts.current?.split('/')[1];
  $('ppack').replaceChildren(...packs.map((p) => el('option', { value: p.id }, `${p.name} (${p.files.length})`)));
  $('ppack').value = packs.some((p) => p.id === curPack) ? curPack : opts.pack && packs.some((p) => p.id === opts.pack) ? opts.pack : packs[0].id;
  $('psearch').value = '';
  const sel = opts.selected || new Set(opts.current ? [opts.current] : []);
  const draw = () => {
    const p = packs.find((x) => x.id === $('ppack').value);
    const f = $('psearch').value.trim().toLowerCase();
    $('pinfo').textContent = `${p.author ? `Autor: ${p.author} · ` : ''}${p.license || ''}${opts.multi ? ' · clique para marcar/desmarcar' : ''}`;
    const cells = [];
    if (!opts.multi) cells.push(el('div', { class: 'pcell', onclick: () => { opts.onPick(null); close(); } }, el('div', { style: 'height:64px;display:grid;place-items:center;font-size:22px' }, '∅'), el('span', {}, 'Nenhuma (original)')));
    for (const file of p.files) {
      if (f && !file.toLowerCase().includes(f)) continue;
      const path = `${cat}/${p.id}/${file}`;
      const c = el('div', { class: `pcell ${sel.has(path) ? 'sel' : ''} ${cat === 'particles' ? 'dark' : ''} ${cat === 'foliage' ? 'fol' : ''}`, title: file },
        el('img', { src: url(path), loading: 'lazy', alt: file }), el('span', {}, file.replace(/\.png$/, '')));
      c.onclick = () => {
        if (opts.multi) { if (sel.has(path)) sel.delete(path); else sel.add(path); c.classList.toggle('sel'); opts.onPick([...sel]); } else { opts.onPick(path); close(); }
      };
      cells.push(c);
    }
    $('pgrid').replaceChildren(...cells);
  };
  const close = () => { $('picker').classList.add('hidden'); opts.onClose?.(); };
  $('ppack').onchange = draw;
  $('psearch').oninput = draw;
  $('pclose').onclick = close;
  $('picker').onclick = (e) => { if (e.target === $('picker')) close(); };
  draw();
}

// ---------- aba Visual ----------
function section(title, open, ...body) {
  return el('details', { class: 'sec', open }, el('summary', {}, title), el('div', { class: 'body' }, ...body));
}
const range = (value, min, max, step, oninput) => el('input', { type: 'range', min, max, step, value, oninput });
const thumb = (path, cat, onclick) => el('div', { class: `thumb ${cat === 'particles' ? 'dark' : ''}`, style: path ? `background-image:url('${url(path)}')` : '', onclick, title: path || 'sem textura' }, path ? '' : 'cor');

function renderVisual() {
  const A = S.assets;
  const box = $('vcontrols');
  const presets = section('✨ Predefinições (um clique e depois ajuste)', true,
    el('div', { class: 'presets' }, ...PRESETS.map((p) => el('button', { class: 'secondary', onclick: () => { S.assets = sanitizeAssets(clone(p.assets)); changed(); renderVisual(); toast(`Predefinição "${p.label}" na prévia. Salve para aplicar.`); } }, p.label))),
    el('p', { class: 'muted small' }, 'Todos os pacotes baixados são gratuitos com licença CC0 (pode usar comercialmente).'),
    el('label', {}, 'Filtro das texturas ', el('select', { onchange: (e) => { A.filtro = e.target.value; changed(); } },
      el('option', { value: 'pixel', selected: A.filtro === 'pixel' }, 'Pixel nítido (pixel art)'), el('option', { value: 'suave', selected: A.filtro === 'suave' }, 'Suave'))));

  const slots = TEXTURE_SLOTS.map((s) => {
    const t = A.texturas[s.id];
    const row = el('div', { class: 'slot' });
    const redraw = () => row.replaceChildren(
      thumb(t.tex, 'textures', () => pick('textures', { title: `Textura: ${s.label}`, current: t.tex, onPick: (p) => { t.tex = p; changed(); redraw(); } })),
      el('div', {},
        el('div', { class: 'name' }, s.label), s.hint ? el('div', { class: 'muted small' }, s.hint) : null,
        el('div', { class: 'ctl' },
          el('select', { onchange: (e) => { t.modo = e.target.value; changed(); } },
            el('option', { value: 'detalhe', selected: t.modo === 'detalhe' }, 'Detalhe (mantém a cor)'), el('option', { value: 'original', selected: t.modo === 'original' }, 'Cor da textura')),
          el('span', {}, 'Escala ', range(t.escala, 0.25, 8, 0.25, (e) => { t.escala = +e.target.value; e.target.nextSibling.textContent = ` ${t.escala} m`; changed(); }), ` ${t.escala} m`),
          el('span', {}, 'Força ', range(t.forca, 0, 2, 0.1, (e) => { t.forca = +e.target.value; changed(); })),
          t.tex ? el('button', { class: 'mini secondary', onclick: () => { t.tex = null; changed(); redraw(); } }, 'Tirar') : null)));
    redraw();
    return row;
  });

  // ícones
  const iconPacks = S.packs.icons || [];
  const itemsBox = el('div', { class: 'items' });
  const drawItems = () => itemsBox.replaceChildren(...Object.entries(ITEMS).map(([id, it]) => {
    const p = iconPath(A, id);
    return el('div', { class: 'item', title: `${it.name} — clique para trocar`, onclick: () => pick('icons', { title: `Ícone: ${it.name}`, current: p, pack: A.icones.pack, onPick: (np) => { if (np) A.icones.map[id] = np; else delete A.icones.map[id]; changed(); drawItems(); } }) },
      el('div', { class: 'ic' }, p ? el('img', { src: url(p), alt: '' }) : it.icon), el('span', {}, it.name));
  }));
  drawItems();
  const icons = section('🎒 Ícones dos itens', false,
    el('label', {}, 'Pacote padrão ', el('select', { onchange: (e) => { A.icones.pack = e.target.value || null; changed(); drawItems(); } },
      el('option', { value: '' }, 'Emojis (original)'),
      ...iconPacks.map((p) => el('option', { value: p.id, selected: A.icones.pack === p.id }, `${p.name}${ICON_DEFAULTS[p.id] ? ' (mapeado)' : ''}`)))),
    el('p', { class: 'muted small' }, 'Clique num item para escolher o ícone dele. "Nenhuma" volta para o padrão do pacote.'),
    el('div', { class: 'row' }, el('button', { class: 'mini secondary', onclick: () => { A.icones.map = {}; changed(); drawItems(); } }, 'Limpar escolhas manuais')),
    itemsBox);

  // efeitos
  const fx = EFFECTS.map((f) => {
    const e = A.efeitos[f.id];
    const row = el('div', { class: 'slot' });
    const redraw = () => row.replaceChildren(
      thumb(e.tex, 'particles', () => pick('particles', { title: `Efeito: ${f.label}`, current: e.tex, onPick: (p) => { e.tex = p; if (p) e.ativo = true; changed(); redraw(); } })),
      el('div', {},
        el('div', { class: 'name' }, el('label', { style: 'display:inline;margin:0' }, el('input', { type: 'checkbox', checked: e.ativo, onchange: (ev) => { e.ativo = ev.target.checked; changed(); } }), ` ${f.label}`)),
        el('div', { class: 'ctl' },
          el('input', { type: 'color', value: e.cor, oninput: (ev) => { e.cor = ev.target.value; changed(); } }),
          el('span', {}, 'Tamanho ', range(e.tamanho, 0.2, 5, 0.1, (ev) => { e.tamanho = +ev.target.value; changed(); })),
          el('span', {}, 'Qtd ', range(e.qtd, 1, 30, 1, (ev) => { e.qtd = +ev.target.value; changed(); })),
          el('button', { class: 'mini secondary', onclick: () => post({ t: 'preview-fx', kind: f.id }) }, '▶ Testar'))));
    redraw();
    return row;
  });

  // vegetação
  const V = A.vegetacao;
  const chips = el('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren(...(V.sprites.length ? V.sprites.map((p) => el('div', { class: 'chip', style: `background-image:url('${url(p)}')`, title: p })) : [el('span', { class: 'muted small' }, 'Nenhum sprite escolhido.')]));
  drawChips();
  const veg = section('🌿 Vegetação (tufos de grama)', false,
    el('label', {}, el('input', { type: 'checkbox', checked: V.ativo, onchange: (e) => { V.ativo = e.target.checked; changed(); } }), ' Mostrar vegetação no mapa'),
    el('div', { class: 'ctl row' }, 'Densidade ', range(V.densidade, 0.1, 4, 0.1, (e) => { V.densidade = +e.target.value; changed(); }),
      ' Tamanho ', range(V.tamanho, 0.3, 3, 0.1, (e) => { V.tamanho = +e.target.value; changed(); })),
    chips,
    el('button', { class: 'mini secondary', onclick: () => pick('foliage', { title: 'Sprites de vegetação (vários)', multi: true, current: V.sprites[0], selected: new Set(V.sprites), onPick: (list) => { V.sprites = list.slice(0, 12); if (list.length) V.ativo = true; changed(); drawChips(); } }) }, 'Escolher sprites…'),
    el('p', { class: 'muted small' }, 'Os sprites são pintados com a cor do bioma (grama verde, pântano escuro...). Máximo 12.'));

  // upload
  const upCat = el('select', {}, ...Object.entries(PACK_CATEGORIES).map(([k, v]) => el('option', { value: k }, v)));
  const upPack = el('input', { placeholder: 'nome-do-pacote', maxlength: 40 });
  const upFiles = el('input', { type: 'file', accept: 'image/png', multiple: true });
  const upMsg = el('div', { class: 'muted small' });
  const upload = section('📤 Enviar meus próprios PNGs (pacotes comprados)', false,
    el('label', {}, 'Categoria', upCat), el('label', {}, 'Pacote (letras minúsculas, números, - e _)', upPack), upFiles,
    el('div', { class: 'row' }, el('button', { onclick: async () => {
      const files = [...upFiles.files];
      if (!files.length) return toast('Escolha os arquivos PNG.', true);
      let ok = 0;
      for (const [i, f] of files.entries()) {
        upMsg.textContent = `Enviando ${i + 1}/${files.length}: ${f.name}`;
        try {
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
          await api('/admin/upload', { category: upCat.value, pack: upPack.value.trim().toLowerCase(), name: f.name, data });
          ok++;
        } catch (e) { upMsg.textContent = `${f.name}: ${e.message}`; toast(e.message, true); break; }
      }
      S.packs = await api('/admin/packs');
      if (ok) { upMsg.textContent = `✅ ${ok} arquivo(s) enviados para ${upCat.value}/${upPack.value}. Já aparecem nas opções.`; renderVisual(); }
    } }, 'Enviar')), upMsg);

  box.replaceChildren(presets, section('🧱 Texturas do mundo', true, ...slots), icons, section('💥 Efeitos (partículas)', false, ...fx), veg, upload);
  changed();
}

// ---------- aba Regras ----------
function renderRules() {
  const defs = S.settingDefs;
  const vals = { ...S.settings };
  const f = $('rform');
  const draw = () => f.replaceChildren(...Object.entries(defs).map(([k, d]) => el('label', { class: d.text ? 'full' : '' },
    d.label, d.hint ? el('small', {}, d.hint) : null,
    d.text ? el('input', { value: vals[k] ?? '', maxlength: d.max, oninput: (e) => { vals[k] = e.target.value; } })
      : el('input', { type: 'number', min: d.min, max: d.max, step: d.step, value: vals[k], oninput: (e) => { vals[k] = +e.target.value; } }))));
  draw();
  $('rdefault').onclick = () => { for (const [k, d] of Object.entries(defs)) vals[k] = d.def; draw(); $('rmsg').textContent = 'Padrão restaurado (ainda não salvo).'; };
  $('rsave').onclick = async () => {
    try {
      const r = await api('/admin/config', { settings: vals });
      S.settings = r.settings; Object.assign(vals, r.settings); draw();
      $('rmsg').textContent = `✅ Salvo às ${new Date().toLocaleTimeString('pt-BR')}.`;
    } catch (e) { $('rmsg').textContent = e.message; }
  };
}

// ---------- aba Estatísticas ----------
const fmt = (n) => (n ?? 0).toLocaleString('pt-BR');
function table(cols, rows, initial) {
  let sortKey = initial, dir = -1;
  const wrap = el('div', { class: 'tscroll' });
  const draw = () => {
    const sorted = [...rows].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      return (typeof x === 'string' ? x.localeCompare(y) : (x ?? 0) - (y ?? 0)) * dir;
    });
    wrap.replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', { class: c.num ? 'num' : '', onclick: () => { if (sortKey === c.k) dir = -dir; else { sortKey = c.k; dir = c.num ? -1 : 1; } draw(); } }, c.label + (sortKey === c.k ? (dir < 0 ? ' ▾' : ' ▴') : ''))))),
      el('tbody', {}, ...sorted.map((r) => el('tr', {}, ...cols.map((c) => el('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : c.num ? fmt(r[c.k]) : r[c.k] ?? '—')))))));
  };
  draw();
  return rows.length ? wrap : el('p', { class: 'muted' }, 'Ainda sem dados.');
}
const icon = (id, emoji) => { const p = iconPath(S.saved, id); return p ? el('img', { class: 'ico', src: url(p), alt: '' }) : emoji || ''; };

async function loadStats() {
  try { S.stats = await api('/admin/stats'); } catch (e) { return toast(e.message, true); }
  const st = S.stats, T = st.totals;
  $('sgen').textContent = `Atualizado às ${new Date(st.generated).toLocaleTimeString('pt-BR')}`;
  const card = (v, label) => el('div', { class: 'stat' }, el('b', {}, fmt(v)), el('span', {}, label));
  $('scards').replaceChildren(card(T.accounts, 'contas'), card(T.online, 'online agora'), card(T.dmg, 'dano causado pelos jogadores'), card(T.taken, 'dano recebido pelos jogadores'),
    card(T.kills, 'monstros derrotados'), card(T.deaths, 'mortes de jogadores'), card(T.goldNow, 'ouro em circulação'), card(T.goldLost, 'ouro perdido em mortes'));
  const maxW = Math.max(1, ...st.dmgByWeapon.map((w) => w.dmg));
  $('sweapons').replaceChildren(table([
    { k: 'name', label: 'Arma', render: (r) => el('span', {}, icon(r.id, r.icon), ' ', r.name) },
    { k: 'dmg', label: 'Dano', num: true },
    { k: 'dmg', label: '', render: (r) => el('div', { class: 'bar', style: `width:${Math.round((r.dmg / maxW) * 120)}px` }) },
  ], st.dmgByWeapon, 'dmg'));
  $('smobs').replaceChildren(table([
    { k: 'name', label: 'Monstro' }, { k: 'dmgTaken', label: 'Dano recebido', num: true }, { k: 'kills', label: 'Abates', num: true },
    { k: 'dmgDealt', label: 'Dano nos jogadores', num: true }, { k: 'playerKills', label: 'Jogadores mortos', num: true },
  ], st.mobs, 'dmgTaken'));
  $('sranking').replaceChildren(table([
    { k: 'name', label: 'Jogador', render: (r) => el('span', {}, r.online ? el('span', { class: 'on', title: 'online' }, '● ') : '', r.name, ' ', r.role !== 'player' ? el('span', { class: 'role', style: `color:${ROLES[r.role]?.color}` }, ROLES[r.role]?.tag || r.role) : '') },
    { k: 'level', label: 'Nível', num: true }, { k: 'cls', label: 'Classe' }, { k: 'xp', label: 'XP', num: true },
    { k: 'gold', label: 'Ouro', num: true }, { k: 'safe', label: 'Cofre', num: true }, { k: 'kills', label: 'Abates', num: true },
    { k: 'bossKills', label: 'Chefes', num: true }, { k: 'deaths', label: 'Mortes', num: true }, { k: 'dmg', label: 'Dano causado', num: true },
    { k: 'taken', label: 'Dano recebido', num: true }, { k: 'goldEarned', label: 'Ouro ganho', num: true }, { k: 'items', label: 'Itens pegos', num: true },
    { k: 'lastLogin', label: 'Último login', num: true, render: (r) => (r.lastLogin ? new Date(r.lastLogin).toLocaleString('pt-BR') : '—') },
  ], st.ranking, 'level'));
  $('sitems').replaceChildren(table([
    { k: 'name', label: 'Item', render: (r) => el('span', {}, icon(r.id, r.icon), ' ', r.name) },
    { k: 'owned', label: 'Com os jogadores', num: true }, { k: 'players', label: 'Jogadores que têm', num: true },
    { k: 'drops', label: 'Caíram', num: true }, { k: 'buys', label: 'Comprados', num: true }, { k: 'sells', label: 'Vendidos', num: true },
  ], st.items, 'owned'));
  $('xnames').replaceChildren(...st.ranking.map((r) => el('option', { value: r.name })));
}

// ---------- aba Resets ----------
function setupResets() {
  const LABEL = {
    player_stats: (n) => `Zerar as estatísticas de ${n}?`, player_char: (n) => `Reiniciar o personagem de ${n}? Ele volta para o nível 1 e perde itens, ouro e a casa. Não tem desfazer.`,
    world: () => 'Reiniciar o mundo (monstros e baús)?', all_stats: () => 'Zerar as estatísticas de TODOS os jogadores e os contadores do mundo?', all_chars: () => 'Reiniciar TODOS os personagens? Todo mundo volta para o nível 1. Não tem desfazer.',
  };
  for (const b of document.querySelectorAll('[data-reset]')) {
    b.onclick = async () => {
      const scope = b.dataset.reset;
      const name = $('xname').value.trim();
      if (scope.startsWith('player') && !name) return toast('Digite o nome do jogador.', true);
      if (!scope.startsWith('player') && $('xconfirm').value.trim() !== 'RESETAR') return toast('Digite RESETAR no campo para liberar.', true);
      if (!confirm(LABEL[scope](name))) return;
      try {
        const r = await api('/admin/reset', { scope, name, confirm: $('xconfirm').value.trim() });
        $('xmsg').classList.remove('hidden');
        $('xmsg').textContent = `✅ ${r.message}`;
        $('xconfirm').value = '';
        toast(r.message);
      } catch (e) { toast(e.message, true); }
    };
  }
  $('apass').onclick = async () => {
    const name = $('xname').value.trim();
    if (!name) return toast('Digite o nome do jogador.', true);
    if (!confirm(`Gerar uma senha temporária para ${name}? A senha atual dele deixa de funcionar.`)) return;
    try {
      const r = await api('/admin/account', { action: 'password', name });
      $('apwname').textContent = name; $('apw').textContent = r.password;
      $('apwbox').classList.remove('hidden');
      toast(r.message);
    } catch (e) { toast(e.message, true); }
  };
  $('apwcopy').onclick = () => navigator.clipboard?.writeText($('apw').textContent).then(() => toast('Copiada.'), () => toast('Selecione e copie manualmente.', true));
  $('adel').onclick = async () => {
    const name = $('xname').value.trim();
    if (!name) return toast('Digite o nome do jogador.', true);
    const typed = prompt(`Excluir a conta ${name} para sempre (personagem, mensagens e denúncias)?\nPara confirmar, digite o nome da conta:`);
    if (typed == null) return;
    try {
      const r = await api('/admin/account', { action: 'delete', name, confirm: typed.trim() });
      $('xmsg').classList.remove('hidden'); $('xmsg').textContent = `✅ ${r.message}`;
      $('apwbox').classList.add('hidden');
      toast(r.message);
    } catch (e) { toast(e.message, true); }
  };
  api('/admin/stats').then((st) => { $('xnames').replaceChildren(...st.ranking.map((r) => el('option', { value: r.name }))); }).catch(() => {});
}

boot();
