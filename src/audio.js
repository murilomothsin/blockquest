/**
 * Sons do jogo. Por padrão tudo é sintetizado com Web Audio (sem arquivos).
 * Para trocar por arquivos reais: coloque o áudio em public/sounds/ e mapeie em
 * public/sounds/sounds.json, ex.: { "swing": "espada.mp3", "slimeDie": "slime-morte.ogg" }.
 * Qualquer nome listado em SOUND_NAMES pode ser substituído.
 */

const MUTE_KEY = 'blockquest-muted';
const VOL_KEY = 'blockquest-volume';
const MAX_DIST = 50;

// ---------- Receitas sintetizadas ----------
const SYNTH = {
  // jogador
  swing: (s, o, t) => s.noise(o, t, { dur: 0.2, vol: 0.45, type: 'bandpass', f0: 500, f1: 2800, q: 1.4, attack: 0.03 }),
  hit: (s, o, t) => {
    s.tone(o, t, { type: 'square', f0: 190, f1: 60, dur: 0.09, vol: 0.28, lp: 1400 });
    s.noise(o, t, { dur: 0.07, vol: 0.45, f0: 1600 });
  },
  crit: (s, o, t) => {
    SYNTH.hit(s, o, t);
    s.tone(o, t + 0.02, { type: 'triangle', f0: 1300, f1: 1900, dur: 0.16, vol: 0.18 });
  },
  bow: (s, o, t) => {
    s.tone(o, t, { type: 'triangle', f0: 440, f1: 150, dur: 0.16, vol: 0.38 });
    s.noise(o, t, { dur: 0.06, vol: 0.18, type: 'highpass', f0: 3000 });
  },
  arrowHit: (s, o, t) => {
    s.noise(o, t, { dur: 0.08, vol: 0.4, f0: 900 });
    s.tone(o, t, { f0: 160, f1: 90, dur: 0.08, vol: 0.3 });
  },
  playerHurt: (s, o, t) => s.tone(o, t, { type: 'square', f0: 240, f1: 110, dur: 0.14, vol: 0.22, lp: 1200 }),
  playerDie: (s, o, t) => s.tone(o, t, { type: 'triangle', f0: 420, f1: 70, dur: 0.9, vol: 0.4 }),
  jump: (s, o, t) => s.tone(o, t, { f0: 260, f1: 520, dur: 0.1, vol: 0.12 }),

  // slime
  slimeAggro: (s, o, t) => s.tone(o, t, { f0: 280, f1: 620, dur: 0.16, vol: 0.28 }),
  slimeAttack: (s, o, t) => s.tone(o, t, { f0: 200, f1: 480, dur: 0.12, vol: 0.28 }),
  slimeHurt: (s, o, t) => {
    s.tone(o, t, { f0: 520, f1: 210, dur: 0.13, vol: 0.32 });
    s.noise(o, t, { dur: 0.08, vol: 0.2, f0: 700 });
  },
  slimeDie: (s, o, t) => {
    s.tone(o, t, { f0: 460, f1: 55, dur: 0.4, vol: 0.4 });
    s.noise(o, t + 0.05, { dur: 0.3, vol: 0.25, f0: 500, f1: 150 });
  },

  // goblin
  goblinAggro: (s, o, t) => s.tone(o, t, { type: 'sawtooth', f0: 170, f1: 120, dur: 0.3, vol: 0.2, lp: 900 }),
  goblinAttack: (s, o, t) => {
    s.tone(o, t, { type: 'sawtooth', f0: 240, f1: 160, dur: 0.13, vol: 0.16, lp: 1100 });
    SYNTH.swing(s, o, t + 0.05);
  },
  goblinHurt: (s, o, t) => s.tone(o, t, { type: 'square', f0: 760, f1: 360, dur: 0.12, vol: 0.16, lp: 2200 }),
  goblinDie: (s, o, t) => s.tone(o, t, { type: 'square', f0: 640, f1: 140, dur: 0.45, vol: 0.18, lp: 1800 }),
  // monstro pulando do mato: farfalhar de folhas + "!" agudo
  ambush: (s, o, t) => {
    s.noise(o, t, { dur: 0.35, vol: 0.5, type: 'bandpass', f0: 2500, f1: 5000, q: 0.8, attack: 0.02 });
    s.noise(o, t + 0.12, { dur: 0.25, vol: 0.35, type: 'bandpass', f0: 3500, f1: 1800, q: 0.8 });
    s.tone(o, t + 0.05, { type: 'square', f0: 1046, dur: 0.07, vol: 0.12 });
    s.tone(o, t + 0.13, { type: 'square', f0: 1568, dur: 0.12, vol: 0.12 });
    SYNTH.goblinAggro(s, o, t + 0.2);
  },

  // golem
  golemAggro: (s, o, t) => {
    s.tone(o, t, { type: 'sawtooth', f0: 75, f1: 45, dur: 1.1, vol: 0.55, lp: 380, attack: 0.08 });
    s.noise(o, t, { dur: 1.1, vol: 0.35, f0: 320, f1: 120, attack: 0.08 });
  },
  golemHurt: (s, o, t) => {
    s.tone(o, t, { f0: 95, f1: 50, dur: 0.22, vol: 0.5 });
    s.noise(o, t, { dur: 0.15, vol: 0.3, f0: 500 });
  },
  golemSlam: (s, o, t) => {
    s.noise(o, t, { dur: 0.55, vol: 0.9, f0: 260, f1: 60 });
    s.tone(o, t, { f0: 65, f1: 28, dur: 0.55, vol: 0.8 });
  },
  golemWindup: (s, o, t) => s.tone(o, t, { type: 'sawtooth', f0: 55, f1: 90, dur: 0.7, vol: 0.35, lp: 300, attack: 0.1 }),
  golemThrow: (s, o, t) => s.noise(o, t, { dur: 0.45, vol: 0.55, type: 'bandpass', f0: 250, f1: 900, q: 1.2, attack: 0.05 }),
  rockImpact: (s, o, t) => {
    s.noise(o, t, { dur: 0.7, vol: 1.0, f0: 420, f1: 60 });
    s.tone(o, t, { f0: 80, f1: 30, dur: 0.6, vol: 0.9 });
  },
  golemDie: (s, o, t) => {
    s.tone(o, t, { type: 'sawtooth', f0: 90, f1: 25, dur: 1.8, vol: 0.6, lp: 400 });
    s.noise(o, t + 0.2, { dur: 1.6, vol: 0.6, f0: 600, f1: 60 });
  },

  // interface / recompensas
  coin: (s, o, t) => {
    s.tone(o, t, { type: 'square', f0: 1480, dur: 0.06, vol: 0.09 });
    s.tone(o, t + 0.06, { type: 'square', f0: 1980, dur: 0.14, vol: 0.09 });
  },
  pickup: (s, o, t) => [660, 880, 1320].forEach((f, i) => s.tone(o, t + i * 0.07, { type: 'triangle', f0: f, dur: 0.12, vol: 0.22 })),
  potion: (s, o, t) => [0, 0.08, 0.16].forEach((d) => s.tone(o, t + d, { f0: 300 + Math.random() * 100, f1: 700, dur: 0.07, vol: 0.2 })),
  levelUp: (s, o, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone(o, t + i * 0.09, { type: 'triangle', f0: f, dur: 0.25, vol: 0.25 })),
  quest: (s, o, t) => [392, 523, 659, 784].forEach((f, i) => s.tone(o, t + i * 0.12, { type: 'triangle', f0: f, dur: 0.3, vol: 0.22 })),
  drop: (s, o, t) => [880, 1175, 1568].forEach((f, i) => s.tone(o, t + i * 0.1, { f0: f, dur: 0.3, vol: 0.18 })),
  ui: (s, o, t) => s.tone(o, t, { f0: 900, f1: 700, dur: 0.04, vol: 0.12 }),
  // vestir armadura: "clanc" metálico
  equip: (s, o, t) => {
    s.noise(o, t, { dur: 0.12, vol: 0.35, type: 'bandpass', f0: 2600, q: 3 });
    s.tone(o, t, { type: 'square', f0: 1250, f1: 1180, dur: 0.18, vol: 0.08 });
    s.tone(o, t + 0.07, { type: 'triangle', f0: 840, dur: 0.22, vol: 0.12 });
  },
  deny: (s, o, t) => s.tone(o, t, { type: 'square', f0: 150, dur: 0.14, vol: 0.15, lp: 900 }),
};

export const SOUND_NAMES = Object.keys(SYNTH);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    this.volume = +(localStorage.getItem(VOL_KEY) ?? 0.8);
    this.samples = {};
    this.last = {};
    this.listener = null;
    this.right = null;
    // navegadores só liberam áudio depois de uma interação do usuário
    const unlock = () => this.init();
    addEventListener('keydown', unlock);
    addEventListener('pointerdown', unlock);
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
  }

  async loadSamples() {
    let map;
    try {
      const res = await fetch('/sounds/sounds.json');
      if (!res.ok) return;
      map = await res.json();
    } catch { return; }
    await Promise.all(Object.entries(map).map(async ([name, file]) => {
      if (!file || name.startsWith('_')) return;
      try {
        const buf = await (await fetch(`/sounds/${file}`)).arrayBuffer();
        this.samples[name] = await this.ctx.decodeAudioData(buf);
      } catch (err) { console.warn(`[som] não consegui carregar ${name} (${file})`, err); }
    }));
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  setVolume(v) {
    this.volume = v;
    localStorage.setItem(VOL_KEY, String(v));
    if (this.master && !this.muted) this.master.gain.value = v;
  }

  /** posição do ouvinte (jogador) e vetor "direita" da câmera, para volume e pan */
  setListener(pos, right) { this.listener = pos; this.right = right; }

  play(name, pos = null, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.last[name] != null && now - this.last[name] < 0.04) return; // evita empilhar o mesmo som
    this.last[name] = now;

    let gain = vol, pan = 0;
    if (pos && this.listener) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      if (d > MAX_DIST) return;
      gain *= Math.pow(1 - d / MAX_DIST, 1.6);
      if (d > 0.5 && this.right) pan = Math.max(-0.8, Math.min(0.8, (dx * this.right.x + dz * this.right.z) / d));
    }
    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(this.master);

    if (this.samples[name]) {
      const src = ctx.createBufferSource();
      src.buffer = this.samples[name];
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      src.connect(out);
      src.start();
      return;
    }
    SYNTH[name]?.(this, out, now + 0.005);
  }

  // ---------- blocos de síntese ----------
  envelope(t, vol, attack, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  tone(out, t, { type = 'sine', f0, f1 = f0, dur, vol = 0.3, attack = 0.005, lp = null }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    let node = o;
    if (lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lp;
      o.connect(f); node = f;
    }
    node.connect(this.envelope(t, vol, attack, dur)).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(out, t, { dur, vol = 0.3, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, attack = 0.005 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    src.connect(f).connect(this.envelope(t, vol, attack, dur)).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
}
