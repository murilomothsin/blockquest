export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.rmb = false; this.clicked = false;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.rmb = true;
      if (e.button === 0) this.clicked = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.rmb = false; });
    addEventListener('mousemove', (e) => {
      if (this.rmb) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  endFrame() {
    this.pressed.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0; this.clicked = false;
  }
}
