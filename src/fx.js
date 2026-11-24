// Efeitos de partícula (sprites) configurados no painel admin: golpe, crítico, magia, morte, cura, nível.
// Os sprites do pacote Kenney são brancos em fundo preto: usamos mistura aditiva (o preto some) e a cor do painel.
import * as THREE from 'three';
import { loadTexture } from './assets.js';

const MAX = 260;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.cfg = {};
    this.tex = {};
    this.live = [];
    this.free = [];
  }

  /** efeitos = assets.efeitos (painel admin) */
  async setConfig(efeitos = {}) {
    this.cfg = efeitos;
    const entries = await Promise.all(Object.entries(efeitos).map(async ([id, e]) => {
      if (!e.ativo || !e.tex) return [id, null];
      try { return [id, await loadTexture(e.tex, { alpha: true, filtro: 'suave' })]; } catch { return [id, null]; }
    }));
    this.tex = Object.fromEntries(entries);
  }

  sprite() {
    let s = this.free.pop();
    if (!s) {
      if (this.live.length >= MAX) return null;
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.renderOrder = 4;
    }
    this.scene.add(s);
    return s;
  }

  /** dispara o efeito `kind` em pos (THREE.Vector3 ou {x,y,z}). opts.h = altura do centro */
  emit(kind, pos, opts = {}) {
    const e = this.cfg[kind], tex = this.tex[kind];
    if (!e?.ativo || !tex || !pos) return 0;
    const color = new THREE.Color(e.cor);
    const n = Math.max(1, Math.round(e.qtd * (opts.mul || 1)));
    const up = kind === 'cura' || kind === 'nivel';
    let made = 0;
    for (let i = 0; i < n; i++) {
      const s = this.sprite();
      if (!s) break;
      const a = Math.random() * Math.PI * 2, sp = (up ? 0.6 : 2.2) * (0.5 + Math.random());
      s.material.map = tex;
      s.material.color.copy(color);
      s.material.opacity = 1;
      s.material.rotation = Math.random() * Math.PI * 2;
      s.position.set(pos.x + Math.cos(a) * (up ? 0.6 : 0.2), (opts.h ?? pos.y ?? 1) + (up ? Math.random() * 0.4 : Math.random() * 0.5), pos.z + Math.sin(a) * (up ? 0.6 : 0.2));
      const size = e.tamanho * (kind === 'morte' ? 1.4 : kind === 'nivel' ? 1.1 : 0.7) * (0.6 + Math.random() * 0.7);
      s.scale.setScalar(size);
      s.userData = {
        v: new THREE.Vector3(Math.cos(a) * sp, up ? 1.6 + Math.random() * 1.6 : 1 + Math.random() * 2.2, Math.sin(a) * sp),
        life: 0, max: (up ? 1.1 : kind === 'morte' ? 0.9 : 0.45) * (0.7 + Math.random() * 0.6), size, grow: kind === 'morte' ? 1.8 : up ? 0.4 : 0.9,
        spin: (Math.random() - 0.5) * 4, grav: up ? 0 : kind === 'morte' ? -1 : 6,
      };
      this.live.push(s);
      made++;
    }
    return made;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i], u = s.userData;
      u.life += dt;
      const k = u.life / u.max;
      if (k >= 1) {
        this.scene.remove(s);
        this.live.splice(i, 1);
        this.free.push(s);
        continue;
      }
      u.v.y -= u.grav * dt;
      s.position.addScaledVector(u.v, dt);
      s.material.rotation += u.spin * dt;
      s.material.opacity = 1 - k * k;
      s.scale.setScalar(u.size * (1 + u.grow * k));
    }
  }
}
