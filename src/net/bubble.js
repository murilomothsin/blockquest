// Balões de fala em cima da cabeça (estilo Roblox)
import * as THREE from 'three';

const LIFE = 7; // segundos na tela
const MAX_CHARS = 24; // por linha
const MAX_LINES = 4;

function wrap(text) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > MAX_CHARS) { // palavra gigante: quebra no meio
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, MAX_CHARS)); w = w.slice(MAX_CHARS);
    }
    if ((cur + ' ' + w).trim().length > MAX_CHARS) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > MAX_LINES) { lines.length = MAX_LINES; lines[MAX_LINES - 1] = lines[MAX_LINES - 1].slice(0, MAX_CHARS - 1) + '…'; }
  return lines;
}

function makeBubble(text, whisper) {
  const lines = wrap(text);
  const font = 'bold 30px system-ui, sans-serif';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 36;
  const lh = 36, h = lines.length * lh + 24, tail = 16;
  c.width = w; c.height = h + tail;
  g.font = font;
  g.fillStyle = whisper ? 'rgba(255,230,250,0.96)' : 'rgba(255,255,255,0.96)';
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
  const r = 16;
  g.beginPath();
  g.moveTo(r, 1.5); g.lineTo(w - r, 1.5); g.quadraticCurveTo(w - 1.5, 1.5, w - 1.5, r);
  g.lineTo(w - 1.5, h - r); g.quadraticCurveTo(w - 1.5, h, w - r, h);
  g.lineTo(w / 2 + 12, h); g.lineTo(w / 2, h + tail - 2); g.lineTo(w / 2 - 12, h);
  g.lineTo(r, h); g.quadraticCurveTo(1.5, h, 1.5, h - r);
  g.lineTo(1.5, r); g.quadraticCurveTo(1.5, 1.5, r, 1.5);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1b1f2b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, 12 + lh * i + lh / 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true }));
  const k = 0.012; // pixels → metros
  sprite.scale.set(c.width * k, c.height * k, 1);
  sprite.center.set(0.5, 0); // ancora pela ponta de baixo
  sprite.renderOrder = 20;
  return sprite;
}

export class Bubbles {
  constructor(scene) { this.scene = scene; this.map = new Map(); }

  /** key = quem fala; anchor = Object3D que o balão segue; height = altura acima do anchor */
  say(key, anchor, text, { height = 3.75, whisper = false } = {}) {
    this.remove(key);
    const sprite = makeBubble(text, whisper);
    this.scene.add(sprite);
    this.map.set(key, { sprite, anchor, height, t: 0 });
  }

  remove(key) {
    const b = this.map.get(key);
    if (!b) return;
    this.scene.remove(b.sprite);
    b.sprite.material.map.dispose(); b.sprite.material.dispose();
    this.map.delete(key);
  }

  update(dt) {
    for (const [key, b] of this.map) {
      b.t += dt;
      if (b.t > LIFE || !b.anchor.parent) { this.remove(key); continue; }
      b.sprite.position.set(b.anchor.position.x, b.anchor.position.y + b.height, b.anchor.position.z);
      b.sprite.material.opacity = Math.min(1, (LIFE - b.t) / 0.6);
    }
  }
}
