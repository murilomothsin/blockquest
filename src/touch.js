// Controles de toque (celular/tablet): joystick virtual, botões de ação, câmera por arraste e pinça.
// Liga sozinho em telas de toque (pointer: coarse) ou com ?touch=1 na URL (para testar no PC).
// Não mexe nas regras: só alimenta o Input com ações "virtuais" (input.vheld / input.vpressed / input.move).

export const isTouchDevice = () => new URLSearchParams(location.search).has('touch')
  || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && matchMedia('(hover: none)').matches;

const JOY_R = 56; // raio do joystick (px)
const RUN_AT = 0.85; // empurrar o joystick até a borda = correr

export class TouchControls {
  /** opts: { online, onChat, onInventory, onTree, onMenu } */
  constructor(input, canvas, opts = {}) {
    this.input = input;
    this.canvas = canvas;
    this.opts = opts;
    this.joy = null; // { id, x0, y0 }
    this.cams = new Map(); // dedos girando a câmera: id → { x, y, t, x0, y0, moved }
    this.pinch = null;
    document.body.classList.add('touch');
    this.build();
    this.bindCanvas();
  }

  build() {
    const el = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
    const root = el('div', 'touchui');
    root.id = 'touch';
    // joystick (aparece onde o polegar encosta, na metade esquerda)
    this.joyBase = el('div', 'joy hidden');
    this.joyKnob = el('div', 'knob');
    this.joyBase.append(this.joyKnob);
    root.append(this.joyBase);

    // botões: [ação, ícone, classe, segurar repete?]
    const pad = el('div', 'tpad');
    const btn = (action, icon, cls, label) => {
      const b = el('button', `tbtn ${cls}`, `<span class="ti">${icon}</span>${label ? `<small>${label}</small>` : ''}`);
      b.dataset.action = action;
      pad.append(b);
      return b;
    };
    this.btnAttack = btn('attack', '⚔️', 'big attack');
    this.btnJump = btn('jump', '⤒', 'jump', 'Pular');
    this.btnTalk = btn('talk', '✋', 'talk', 'Usar');
    this.btnTarget = btn('target', '🎯', 'target', 'Alvo');
    this.btnPotion = btn('potion', '🧪', 'potion');
    root.append(pad);

    // barra do topo: inventário, classe, chat, tela cheia
    const top = el('div', 'ttop');
    const tbtn = (icon, title, fn) => { const b = el('button', 'tsmall', icon); b.title = title; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); top.append(b); return b; };
    tbtn('🎒', 'Inventário', () => this.opts.onInventory?.());
    tbtn('⭐', 'Classe e habilidades', () => this.opts.onTree?.());
    if (this.opts.online) tbtn('💬', 'Chat', () => this.opts.onChat?.());
    if (document.documentElement.requestFullscreen) tbtn('⛶', 'Tela cheia', () => this.fullscreen());
    root.append(top);
    document.body.append(root);

    // pressionar botões: ação virtual enquanto o dedo estiver em cima
    pad.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.tbtn');
      if (!b) return;
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('on');
      this.input.pressVirtual(b.dataset.action);
      const up = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        b.classList.remove('on');
        this.input.releaseVirtual(b.dataset.action);
        b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up);
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });

    // o botão de habilidade do HUD (G) também vira botão de toque
    const sk = document.getElementById('skillbtn');
    sk?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.pressVirtual('skill'); });
    sk?.addEventListener('pointerup', () => this.input.releaseVirtual('skill'));
  }

  bindCanvas() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      // metade esquerda (parte de baixo): joystick
      if (!this.joy && e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.35) {
        this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        Object.assign(this.joyBase.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
        this.joyBase.classList.remove('hidden');
        this.setKnob(0, 0);
        return;
      }
      // resto da tela: câmera (1 dedo gira, 2 dedos = pinça/zoom); toque curto = travar alvo
      this.cams.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false });
      if (this.cams.size === 2) {
        const [a, b] = [...this.cams.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }, { passive: false });

    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      if (this.joy && e.pointerId === this.joy.id) {
        let dx = e.clientX - this.joy.x0, dy = e.clientY - this.joy.y0;
        const d = Math.hypot(dx, dy);
        if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
        this.setKnob(dx, dy);
        return;
      }
      const f = this.cams.get(e.pointerId);
      if (!f) return;
      const mx = e.clientX - f.x, my = e.clientY - f.y;
      f.x = e.clientX; f.y = e.clientY;
      if (Math.hypot(f.x - f.x0, f.y - f.y0) > 10) f.moved = true;
      if (this.cams.size === 2) { // pinça: aproxima/afasta a câmera
        const [a, b] = [...this.cams.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.input.wheel += (this.pinch - d) / 40;
        this.pinch = d;
        return;
      }
      this.input.dx += mx * 1.6; this.input.dy += my * 1.6;
      this.input.touchCam = true;
    });

    const end = (e) => {
      if (e.pointerType === 'mouse') return;
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy = null;
        this.input.move = null;
        this.input.releaseVirtual('run');
        this.joyBase.classList.add('hidden');
        return;
      }
      const f = this.cams.get(e.pointerId);
      if (!f) return;
      this.cams.delete(e.pointerId);
      if (this.cams.size < 2) this.pinch = null;
      if (!this.cams.size) this.input.touchCam = false;
      // toque rápido sem arrastar: igual a clicar (trava o alvo se tocar num monstro)
      if (!f.moved && performance.now() - f.t < 300) this.input.click = { x: f.x, y: f.y };
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  setKnob(dx, dy) {
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.hypot(dx, dy) / JOY_R;
    this.input.move = mag > 0.12 ? { x: dx / JOY_R, y: dy / JOY_R, mag } : null;
    if (mag >= RUN_AT) this.input.vheld.add('run'); else this.input.vheld.delete('run');
  }

  /** atualiza o visual dos botões a cada frame (ex.: "Usar" acende quando há algo para interagir) */
  update({ canTalk, potions, ranged, blocked, dead }) {
    // janela/diálogo/chat aberto ou morto: some com os controles de jogo (senão cobrem os botões da janela)
    const hide = !!(blocked || dead);
    if (hide !== this.hidden) {
      this.hidden = hide;
      document.getElementById('touch').classList.toggle('hidden', hide);
      document.body.classList.toggle('touch-hidden', hide);
      if (hide) { this.joy = null; this.input.move = null; this.joyBase.classList.add('hidden'); this.input.vheld.clear(); }
    }
    this.btnTalk.classList.toggle('glow', !!canTalk);
    this.btnPotion.querySelector('.ti').textContent = '🧪';
    this.btnPotion.dataset.n = potions;
    this.btnPotion.classList.toggle('empty', !potions);
    this.btnAttack.querySelector('.ti').textContent = ranged === 'magic' ? '🔮' : ranged === 'ranged' ? '🏹' : '⚔️';
  }

  async fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        await screen.orientation?.lock?.('landscape').catch(() => {});
      }
    } catch { /* iPhone não deixa: tudo bem */ }
  }
}
