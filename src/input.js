export const ACTIONS = [
  { id: 'attack', label: 'Atacar', defaults: ['Mouse0', 'KeyF'] },
  { id: 'run', label: 'Correr', defaults: ['ShiftLeft', 'ShiftRight'] },
  { id: 'jump', label: 'Pular', defaults: ['Space', null] },
  { id: 'talk', label: 'Falar / Interagir', defaults: ['KeyE', null] },
  { id: 'potion', label: 'Poção de Vida', defaults: ['Digit1', null] },
  { id: 'bigPotion', label: 'Poção Grande', defaults: ['Digit2', null] },
  { id: 'target', label: 'Trocar alvo', defaults: ['Tab', null] },
  { id: 'inventory', label: 'Inventário', defaults: ['KeyI', null] },
  { id: 'camLeft', label: 'Girar câmera ←', defaults: ['KeyQ', null] },
  { id: 'camRight', label: 'Girar câmera →', defaults: ['KeyR', null] },
  { id: 'help', label: 'Mostrar controles', defaults: ['KeyH', null] },
];

export const RESERVED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Mouse2'];

const KEYS_STORAGE = 'blockquest-keys-v1';

const NAMES = {
  Mouse0: 'Clique esq.', Mouse1: 'Clique meio', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt', AltRight: 'Alt dir.', MetaLeft: 'Cmd', MetaRight: 'Cmd dir.', Tab: 'Tab', Enter: 'Enter',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: 'Ç', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', CapsLock: 'Caps',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code];
  return code;
}

function defaultBindings() {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.defaults]]));
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.rmb = false;
    this.click = null; // {x, y} do último clique esquerdo no canvas
    this.capture = null;
    this.swallowClick = false;
    this.bindings = defaultBindings();
    try {
      const saved = JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}');
      for (const a of ACTIONS) if (Array.isArray(saved[a.id])) this.bindings[a.id] = saved[a.id].slice(0, 2);
    } catch { /* usa padrão */ }

    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); this.finishCapture(e.code); return; }
      if (e.code === 'Tab' || e.code === 'Space' || this.isBound(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.rmb = false; });

    // Captura de tecla/botão do mouse para remapear (fase de captura, antes do canvas)
    addEventListener('mousedown', (e) => {
      if (!this.capture || e.button === 2) return;
      e.preventDefault(); e.stopPropagation();
      this.swallowClick = true;
      this.finishCapture(`Mouse${e.button}`);
    }, true);
    addEventListener('click', (e) => {
      if (this.swallowClick) { e.stopPropagation(); e.preventDefault(); this.swallowClick = false; }
    }, true);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.rmb = true; return; }
      const code = `Mouse${e.button}`;
      this.pressed.add(code); this.keys.add(code);
      if (e.button === 0) this.click = { x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rmb = false;
      else this.keys.delete(`Mouse${e.button}`);
    });
    addEventListener('mousemove', (e) => {
      if (this.rmb) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  isBound(code) { return Object.values(this.bindings).some((b) => b.includes(code)); }

  /** ação mantida pressionada */
  held(action) { return this.bindings[action].some((c) => c && this.keys.has(c)); }
  /** ação pressionada neste frame */
  hit(action) { return this.bindings[action].some((c) => c && this.pressed.has(c)); }
  /** tecla física (movimento fixo) */
  down(code) { return this.keys.has(code); }
  tapped(code) { return this.pressed.has(code); }

  startCapture(cb) { this.capture = cb; this.keys.clear(); }
  finishCapture(code) { const cb = this.capture; this.capture = null; cb(code); }

  /** Retorna o nome da ação de onde a tecla foi removida (conflito), se houver */
  setBinding(action, slot, code) {
    let moved = null;
    if (code) {
      for (const a of ACTIONS) {
        const b = this.bindings[a.id];
        const i = b.indexOf(code);
        if (i >= 0 && !(a.id === action && i === slot)) { b[i] = null; moved = a.label; }
      }
    }
    this.bindings[action][slot] = code;
    this.saveBindings();
    return moved;
  }

  resetBindings() { this.bindings = defaultBindings(); this.saveBindings(); }
  saveBindings() { localStorage.setItem(KEYS_STORAGE, JSON.stringify(this.bindings)); }

  endFrame() {
    this.pressed.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0; this.click = null;
  }
}
