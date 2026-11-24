// Mundo compartilhado no servidor: monstros, personagens, combate, recompensas e baús.
// O servidor é a fonte da verdade do progresso: o cliente só manda posição e PEDIDOS
// ("acertei o monstro 12", "comprar espada", "pegar baú 3") e recebe o resultado.
import { MobSim, TYPES } from '../src/shared/mobs.js';
import { buildLayout, createWorldQueries, WORLD_RADIUS, SPAWN_POINT } from '../src/shared/worldData.js';
import { ITEMS, ATTACK } from '../src/shared/items.js';
import {
  LootBag, act, kill, hurt, rollDamage, weaponOf, publicCharacter,
} from '../src/shared/progress.js';
import { saveCharacter } from './auth.js';

const TICK_MS = 50; // simulação a 20 Hz
const SNAP_EVERY = 2; // estado dos monstros a 10 Hz
const VIEW = 110; // só manda o que está a até 110 m do jogador
const MELEE_SLACK = 2; // tolerância de distância (latência) para golpe corpo a corpo
const RANGED_SLACK = 8; // idem para flechas
const CD_SLACK = 0.75; // aceita golpes até 25% mais rápido que o cooldown (jitter de rede)
const MAX_SPEED = 21; // m/s aceitos (correr = 13 m/s, + folga para lag)
const SPEED_SLACK = 3; // m extras por mensagem
const SAVE_EVERY_MS = 10_000;

/**
 * players: Map userId → sessão { id, name, role, ws, state, c (personagem), loot, god, ... }
 * send(ws, msg)
 */
export function createGame({ players, send }) {
  const world = createWorldQueries(buildLayout());
  const sim = new MobSim(world, { emit: route });
  const nowS = () => Date.now() / 1000;
  const inView = (p, x, z, r = VIEW) => p.state && Math.hypot(p.state.x - x, p.state.z - z) < r;

  /** manda o personagem atualizado + efeitos para o jogador */
  function pushFx(p, fx) {
    p.dirty = true;
    send(p.ws, { t: 'fx', c: { ...publicCharacter(p.c), dead: !!p.c.dead }, fx });
  }
  const ctxOf = (p) => ({ pos: p.lastPos, now: nowS(), rand: Math.random, loot: p.loot, god: p.god });

  function route(ev) {
    if (ev.e === 'hurtPlayer') { // dano no jogador: o servidor aplica (armadura, morte, perda de ouro)
      const p = players.get(ev.pid);
      if (!p || p.c.dead) return;
      const fx = [];
      hurt(p.c, ev.dmg, ev.type, ctxOf(p), fx);
      if (fx.length) pushFx(p, fx);
      return;
    }
    if (ev.e === 'killed') { // recompensa para todo mundo que ajudou
      for (const pid of ev.credit) {
        const p = players.get(pid);
        if (!p) continue;
        const fx = [];
        kill(p.c, ev.type, { x: ev.x, z: ev.z }, ctxOf(p), fx);
        pushFx(p, fx);
      }
    }
    const msg = { t: 'mev', ...ev };
    for (const p of players.values()) {
      const credited = ev.e === 'killed' && ev.credit.includes(p.id);
      if (ev.e === 'removed' || credited || ev.x == null || inView(p, ev.x, ev.z)) send(p.ws, msg);
    }
  }

  let tick = 0;
  let lastSave = Date.now();
  const timer = setInterval(() => {
    const list = [];
    for (const p of players.values()) if (p.state) list.push({ id: p.id, x: p.state.x, z: p.state.z, dead: !!p.c.dead });
    if (list.length) sim.update(TICK_MS / 1000, list); // ninguém online: mundo pausado
    tick++;
    if (tick % 100 === 0) { // a cada 5 s: baús vencidos
      for (const p of players.values()) { const fx = []; p.loot.expire(nowS(), fx); if (fx.length) send(p.ws, { t: 'fx', fx }); }
    }
    if (Date.now() - lastSave > SAVE_EVERY_MS) { lastSave = Date.now(); saveAll(); }
    if (tick % SNAP_EVERY) return;
    for (const p of players.values()) {
      if (!p.state) continue;
      const m = [];
      for (const mob of sim.mobs) if (inView(p, mob.x, mob.z)) m.push(sim.snapshot(mob));
      send(p.ws, { t: 'mobs', m });
    }
  }, TICK_MS);

  function saveAll(force = false) {
    for (const p of players.values()) if (p.dirty || force) { saveCharacter(p.id, p.c); p.dirty = false; }
  }

  /** Jogador entrou (ou reconectou): começa onde parou o personagem. Retorna os baús ainda abertos. */
  function join(p) {
    p.loot ||= new LootBag();
    const [x, , z] = p.c.pos;
    p.lastPos = { x, z };
    p.lastPosT = Date.now();
    return p.loot.list().map((l) => ({ k: 'loot', lid: l.lid, item: l.item, x: l.x, z: l.z }));
  }

  function leave(p) { saveCharacter(p.id, p.c); }

  /** Posição vinda do cliente: recusa velocidade impossível (teleporte/speed hack) */
  function handleState(p, s) {
    const now = Date.now();
    const r = Math.hypot(s.x, s.z);
    if (r > WORLD_RADIUS + 1) { s.x *= WORLD_RADIUS / r; s.z *= WORLD_RADIUS / r; }
    if (p.c.dead) { // morto não anda: devolve para onde morreu
      if (Math.hypot(s.x - p.lastPos.x, s.z - p.lastPos.z) > 0.5) send(p.ws, { t: 'setpos', x: p.lastPos.x, z: p.lastPos.z });
      s.x = p.lastPos.x; s.z = p.lastPos.z;
    }
    const d = Math.hypot(s.x - p.lastPos.x, s.z - p.lastPos.z);
    const budget = ((now - p.lastPosT) / 1000) * MAX_SPEED + SPEED_SLACK;
    if (d > budget) {
      p.speedFlags = (p.speedFlags || 0) + 1;
      send(p.ws, { t: 'setpos', x: p.lastPos.x, z: p.lastPos.z });
      return false;
    }
    p.lastPos = { x: s.x, z: s.z };
    p.lastPosT = now;
    p.c.pos = [s.x, 0, s.z];
    // o que os outros veem vem do servidor, não do que o cliente disse
    s.w = p.c.equipped; s.a = p.c.armor || ''; s.hm = p.c.helmet || '';
    s.lv = p.c.level; s.hp = Math.ceil(p.c.hp); s.mhp = p.c.maxHp; s.d = !!p.c.dead;
    p.state = s;
    return true;
  }

  /** Teleporte iniciado pelo servidor (respawn, /tp) */
  function teleport(p, x, z) {
    p.lastPos = { x, z };
    p.lastPosT = Date.now();
    p.c.pos = [x, 0, z];
    if (p.state) { p.state.x = x; p.state.z = z; }
    send(p.ws, { t: 'setpos', x, z });
  }

  /** Pedido do jogador (loja, equipar, poção, missão, baú, poço, renascer) */
  function handleAct(p, a) {
    const fx = [];
    const changed = act(p.c, a, ctxOf(p), fx);
    if (a.a === 'respawn' && changed) teleport(p, SPAWN_POINT[0], SPAWN_POINT[2]);
    if (changed || fx.length) pushFx(p, fx);
  }

  /** Cliente diz que acertou monstros. Servidor confere arma, distância e cooldown, e rola o dano. */
  function handleHit(p, msg) {
    if (!p.state || p.c.dead) return;
    const w = weaponOf(p.c);
    const style = msg.kind === 'arrow' ? 'ranged' : 'melee';
    if (w.style !== style) return;
    const now = Date.now();
    if (now - (p.lastAttack || 0) < ATTACK[style].cooldown * 1000 * CD_SLACK) return;
    p.lastAttack = now;

    const ids = Array.isArray(msg.ids) ? [...new Set(msg.ids.filter(Number.isInteger))].slice(0, 8) : [];
    const maxD = style === 'melee' ? ATTACK.melee.range + MELEE_SLACK : (w.range || 22) + RANGED_SLACK;
    const { x, z } = p.lastPos;
    for (const id of ids) {
      const m = sim.byId.get(id);
      if (!m || m.state === 'dead') continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d > maxD + m.def.radius) continue;
      const { dmg, crit } = rollDamage(p.c); // nível e arma do SERVIDOR
      sim.damage(m, dmg, crit, (m.x - x) / (d || 1), (m.z - z) / (d || 1), style === 'melee' ? 0.8 : 0.4, p.id);
    }
  }

  // ---------- ferramentas de teste (QA) ----------
  function spawnNear(p, type, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      sim.spawn(type, p.lastPos.x + Math.cos(a) * 6, p.lastPos.z + Math.sin(a) * 6, { wild: true }); // some ao morrer
    }
  }
  function killNear(p, r = 15) {
    let n = 0;
    for (const m of [...sim.mobs]) {
      if (m.state === 'dead' || Math.hypot(m.x - p.lastPos.x, m.z - p.lastPos.z) > r) continue;
      sim.damage(m, m.hp, false, 0, 0, 0, p.id);
      n++;
    }
    return n;
  }

  return {
    sim, TYPES, ITEMS, join, leave, handleState, handleAct, handleHit, teleport, pushFx, spawnNear, killNear, saveAll,
    stop: () => { clearInterval(timer); saveAll(true); },
  };
}
