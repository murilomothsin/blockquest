// Comandos de chat da equipe (QA, moderador, admin). Tudo é checado aqui no servidor e registrado no staff_log.
import { q } from './db.js';
import { ROLES, ROLE_IDS, can, outranks, roleOf, tagged } from '../src/shared/roles.js';
import { ITEMS } from '../src/shared/items.js';
import { TYPES } from '../src/shared/mobs.js';
import { QUESTS } from '../src/shared/quests.js';
import { gainXp, setLevel, maxHpOf } from '../src/shared/progress.js';
import { CLASSES, CLASS_LEVEL } from '../src/shared/classes.js';
import { WORLD_RADIUS, MINE_ENTRY, MINE_ROOM_CENTERS, MINE_DOOR, HOME_ENTRY, DOOR_BY_ID, BOSS_ROOMS, CASTLE, CURSED, TOWER_DOOR } from '../src/shared/worldData.js';
import { mute, unmute, staffLog, fmtDur } from './moderation.js';

export const CLOSE = { kicked: 4005, banned: 4004 };
const PERMA = 9e15; // "para sempre"

/** comando → permissão necessária (comandos que não estão aqui não são da equipe) */
const NEEDS = {
  '/equipe': 'staffchat', '/aviso': 'announce',
  '/mutar': 'moderate', '/desmutar': 'moderate', '/expulsar': 'moderate', '/banir': 'moderate', '/desbanir': 'moderate',
  '/denuncias': 'reports', '/resolver': 'reports',
  '/tp': 'test', '/item': 'test', '/itens': 'test', '/ouro': 'test', '/xp': 'test', '/nivel': 'test', '/curar': 'test',
  '/imortal': 'test', '/spawn': 'test', '/matar': 'test', '/missao': 'test', '/classe': 'test',
  '/cargo': 'roles',
};

/**
 * Executa um comando da equipe. Retorna false se não é um comando da equipe (o servidor responde "desconhecido").
 * ctx = { players, send, broadcast, game }
 */
export function runCommand(me, cmd, args, ctx) {
  const { players, send, broadcast, game } = ctx;
  const perm = NEEDS[cmd];
  if (!perm) return false;
  const reply = (text) => send(me.ws, { t: 'sys', text });
  if (!can(me.role, perm)) { reply('Você não tem permissão para esse comando.'); return true; }

  const online = (name) => [...players.values()].find((p) => p.name.toLowerCase() === String(name || '').toLowerCase());
  /** alvo online ou só no banco: {id, name, role, p?} */
  const findTarget = (name) => {
    const p = online(name);
    if (p) return { id: p.id, name: p.name, role: p.role, p };
    const u = name && q.userByName.get(name);
    return u ? { id: u.id, name: u.username, role: ROLES[u.role] ? u.role : 'player' } : null;
  };
  /** checagem comum dos comandos de moderação */
  const modTarget = (name) => {
    if (!name) { reply('Falta o nome do jogador.'); return null; }
    const t = findTarget(name);
    if (!t) { reply(`Jogador "${name}" não encontrado.`); return null; }
    if (t.id === me.id) { reply('Você não pode fazer isso com você mesmo.'); return null; }
    if (!outranks(me.role, t.role)) { reply(`Você não pode punir ${t.name} (${roleOf(t.role).label}).`); return null; }
    return t;
  };
  const changed = (fx) => game.pushFx(me, fx);
  const n = (v, def) => { const x = Number(v); return Number.isFinite(x) ? x : def; };

  switch (cmd) {
    // ---------- equipe ----------
    case '/equipe': {
      const text = args.join(' ').trim().slice(0, 200);
      if (!text) return reply('Use: /equipe mensagem'), true;
      for (const p of players.values()) if (can(p.role, 'staffchat')) send(p.ws, { t: 'staff', from: me.name, role: me.role, text });
      return true;
    }
    case '/aviso': {
      const text = args.join(' ').trim().slice(0, 200);
      if (!text) return reply('Use: /aviso texto'), true;
      broadcast({ t: 'announce', from: tagged(me.name, me.role), text });
      staffLog(me, 'aviso', null, text);
      return true;
    }

    // ---------- moderação ----------
    case '/mutar': {
      const t = modTarget(args[0]); if (!t) return true;
      const min = Math.max(1, Math.min(7 * 24 * 60, n(args[1], 10)));
      const reason = args.slice(2).join(' ').slice(0, 120);
      mute(t.id, min * 60e3, reason, me.name);
      if (t.p) send(t.p.ws, { t: 'sys', text: `🔇 Você foi silenciado por ${fmtDur(min * 60e3)} por um moderador.${reason ? ` Motivo: ${reason}` : ''}` });
      reply(`${t.name} silenciado por ${fmtDur(min * 60e3)}.`);
      staffLog(me, 'mutar', t.name, `${min} min ${reason}`);
      return true;
    }
    case '/desmutar': {
      const t = findTarget(args[0]); if (!t) return reply('Jogador não encontrado.'), true;
      reply(unmute(t.id) ? `${t.name} pode falar de novo.` : `${t.name} não estava silenciado.`);
      if (t.p) send(t.p.ws, { t: 'sys', text: '🔊 Seu silêncio foi removido.' });
      staffLog(me, 'desmutar', t.name);
      return true;
    }
    case '/expulsar': {
      const t = modTarget(args[0]); if (!t) return true;
      if (!t.p) return reply(`${t.name} não está online.`), true;
      const reason = args.slice(1).join(' ').slice(0, 120);
      send(t.p.ws, { t: 'kicked', message: `Você foi desconectado por um moderador.${reason ? ` Motivo: ${reason}` : ''}` });
      t.p.ws.close(CLOSE.kicked, 'kick');
      reply(`${t.name} foi expulso.`);
      staffLog(me, 'expulsar', t.name, reason);
      return true;
    }
    case '/banir': {
      const t = modTarget(args[0]); if (!t) return true;
      const hours = Math.max(0, n(args[1], NaN));
      if (!Number.isFinite(hours)) return reply('Use: /banir nome horas [motivo]  (0 = permanente)'), true;
      const reason = args.slice(2).join(' ').slice(0, 120) || null;
      const until = hours === 0 ? PERMA : Date.now() + hours * 3600e3;
      q.setBan.run(until, reason, t.id);
      q.deleteUserSessions.run(t.id);
      const label = hours === 0 ? 'permanentemente' : `por ${fmtDur(hours * 3600e3)}`;
      if (t.p) {
        send(t.p.ws, { t: 'kicked', banned: true, message: `Sua conta foi suspensa ${label}.${reason ? ` Motivo: ${reason}` : ''}` });
        t.p.ws.close(CLOSE.banned, 'ban');
      }
      reply(`${t.name} suspenso ${label}.`);
      staffLog(me, 'banir', t.name, `${hours === 0 ? 'permanente' : `${hours} h`} ${reason || ''}`);
      return true;
    }
    case '/desbanir': {
      const t = findTarget(args[0]); if (!t) return reply('Jogador não encontrado.'), true;
      q.setBan.run(null, null, t.id);
      reply(`Suspensão de ${t.name} removida.`);
      staffLog(me, 'desbanir', t.name);
      return true;
    }
    case '/denuncias': {
      const rows = q.openReports.all(5);
      if (!rows.length) return reply('Nenhuma denúncia aberta. 🎉'), true;
      for (const r of rows.reverse()) {
        const ev = JSON.parse(r.evidence);
        const msgs = ev.messages.slice(-3).map((m) => `"${m.text}"`).join(' · ');
        reply(`#${r.id} ${r.reporter} → ${r.target} (${r.reason})${ev.note ? ` — ${ev.note}` : ''}${msgs ? ` | ${msgs}` : ''}`);
      }
      reply('Use /resolver id quando terminar. Lista completa: npm run denuncias');
      return true;
    }
    case '/resolver': {
      const id = Math.trunc(n(args[0], 0));
      reply(q.resolveReport.run(id).changes ? `Denúncia #${id} resolvida.` : `Denúncia #${id} não está aberta.`);
      staffLog(me, 'resolver denúncia', null, `#${id}`);
      return true;
    }

    // ---------- testes (QA) ----------
    case '/tp': {
      let x, z, label;
      // atalhos: /tp mina | chefe | porta | casa
      const places = {
        mina: MINE_ENTRY, chefe: MINE_ROOM_CENTERS.find((r) => r.id === 'chefe'), porta: { x: MINE_DOOR.x * 0.97, z: MINE_DOOR.z * 0.97 }, casa: HOME_ENTRY,
        castelo: { x: CASTLE.x, z: CASTLE.z + 14 }, ruinas: { x: CURSED.x, z: CURSED.z + 22 }, torre: { x: TOWER_DOOR.x, z: TOWER_DOOR.z - 3 },
        andar1: DOOR_BY_ID.tower_in.to, andar2: DOOR_BY_ID.tower_up1.to, andar3: DOOR_BY_ID.tower_up2.to, andar4: DOOR_BY_ID.tower_up3.to, necromante: BOSS_ROOMS.necromancer,
      };
      const place = args.length === 1 && places[args[0]?.toLowerCase()];
      const t = args.length === 1 && !place ? online(args[0]) : null;
      if (place) { ({ x, z } = place); label = args[0]; } else if (t) { ({ x, z } = t.lastPos); x += 2; label = t.name; } else {
        x = n(args[0], NaN); z = n(args[1], NaN);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return reply('Use: /tp x z  ou  /tp nome'), true;
        const r = Math.hypot(x, z);
        if (r > WORLD_RADIUS) { x *= WORLD_RADIUS / r; z *= WORLD_RADIUS / r; }
        label = `${x.toFixed(0)}, ${z.toFixed(0)}`;
      }
      game.teleport(me, x, z);
      staffLog(me, 'tp', null, label);
      return true;
    }
    case '/item': {
      const id = args[0], qty = Math.max(1, Math.min(99, Math.trunc(n(args[1], 1))));
      if (!ITEMS[id]) return reply(`Item "${id || ''}" não existe. Veja /itens`), true;
      me.c.inv[id] = (me.c.inv[id] || 0) + qty;
      changed([{ k: 'log', text: `🧪 [teste] +${qty} ${ITEMS[id].icon} ${ITEMS[id].name}`, cls: 'info' }]);
      staffLog(me, 'item', null, `${id} x${qty}`);
      return true;
    }
    case '/itens':
      reply(`Itens: ${Object.keys(ITEMS).join(', ')}`);
      return true;
    case '/ouro': {
      const g = Math.max(-1e6, Math.min(1e6, Math.trunc(n(args[0], 0))));
      me.c.gold = Math.max(0, me.c.gold + g);
      changed([{ k: 'log', text: `🧪 [teste] ${g >= 0 ? '+' : ''}${g} ouro`, cls: 'gold' }]);
      staffLog(me, 'ouro', null, g);
      return true;
    }
    case '/xp': {
      const x = Math.max(0, Math.min(1e6, Math.trunc(n(args[0], 0))));
      const fx = [];
      gainXp(me.c, x, fx);
      changed(fx);
      staffLog(me, 'xp', null, x);
      return true;
    }
    case '/nivel': {
      const lv = Math.trunc(n(args[0], 0));
      if (lv < 1) return reply('Use: /nivel n'), true;
      setLevel(me.c, lv);
      changed([{ k: 'log', text: `🧪 [teste] nível ${me.c.level}`, cls: 'info' }]);
      staffLog(me, 'nivel', null, me.c.level);
      return true;
    }
    case '/curar':
      me.c.hp = me.c.maxHp;
      changed([{ k: 'heal', n: me.c.maxHp, color: '#7dff7d' }]);
      return true;
    case '/imortal':
      me.god = !me.god;
      reply(me.god ? '🛡️ Imortal LIGADO (não leva dano).' : 'Imortal desligado.');
      staffLog(me, 'imortal', null, me.god ? 'on' : 'off');
      return true;
    case '/spawn': {
      const type = args[0];
      if (!TYPES[type]) return reply(`Tipos: ${Object.keys(TYPES).join(', ')}`), true;
      const qty = Math.max(1, Math.min(10, Math.trunc(n(args[1], 1))));
      game.spawnNear(me, type, qty);
      reply(`${qty}x ${TYPES[type].name} criado(s) perto de você.`);
      staffLog(me, 'spawn', null, `${type} x${qty}`);
      return true;
    }
    case '/matar': {
      const k = game.killNear(me);
      reply(`${k} monstro(s) derrotado(s).`);
      staffLog(me, 'matar', null, k);
      return true;
    }
    case '/classe': {
      const cls = args[0]?.toLowerCase();
      if (!CLASSES[cls]) return reply(`Classes: ${Object.keys(CLASSES).join(', ')}`), true;
      if (me.c.level < CLASS_LEVEL) setLevel(me.c, CLASS_LEVEL);
      me.c.cls = cls; me.c.skills = {};
      me.c.maxHp = maxHpOf(me.c); me.c.hp = Math.min(me.c.hp, me.c.maxHp);
      changed([{ k: 'classChosen', cls }, { k: 'log', text: `🧪 [teste] classe: ${CLASSES[cls].name}`, cls: 'info' }]);
      staffLog(me, 'classe', null, cls);
      return true;
    }
    case '/missao': {
      const i = Math.trunc(n(args[0], 0)) - 1;
      if (i < 0 || i >= QUESTS.length) return reply(`Use: /missao 1 a ${QUESTS.length}`), true;
      me.c.quest = { idx: i, status: 'available', progress: 0 };
      changed([{ k: 'log', text: `🧪 [teste] missão: ${QUESTS[i].title}`, cls: 'info' }]);
      staffLog(me, 'missao', null, i + 1);
      return true;
    }

    // ---------- admin ----------
    case '/cargo': {
      const [name, role] = args;
      if (!name || !ROLE_IDS.includes(role)) return reply(`Use: /cargo nome ${ROLE_IDS.join('|')}`), true;
      const t = findTarget(name);
      if (!t) return reply(`Jogador "${name}" não encontrado.`), true;
      if (t.id === me.id) return reply('Você não pode mudar o próprio cargo (peça para outro admin).'), true;
      q.setRole.run(role, t.id);
      if (t.p) {
        t.p.role = role;
        if (!can(role, 'test')) t.p.god = false;
        send(t.p.ws, { t: 'sys', text: `Seu cargo agora é: ${ROLES[role].label}.` });
      }
      broadcast({ t: 'role', id: t.id, role });
      reply(`${t.name} agora é ${ROLES[role].label}.`);
      staffLog(me, 'cargo', t.name, role);
      return true;
    }
    default: return false;
  }
}
