// Moderação: filtro do chat, silêncio (automático e por moderador), histórico para provas, denúncias e log da equipe.
import { filterText } from './filter.js';
import { q } from './db.js';

const STRIKES_TO_MUTE = 3; // palavrões dentro da janela → silêncio automático
const STRIKE_WINDOW = 60e3;
const AUTO_MUTE_MS = 60e3;
const HISTORY = 20; // últimas mensagens por jogador (anexadas às denúncias)
export const REPORT_REASONS = ['ofensa', 'assedio', 'spam', 'trapaca', 'nome', 'outro'];

const histories = new Map(); // userId → [{at, to, text}] (fica na memória depois que o jogador sai)
const mutes = new Map(); // userId → {until, reason, by}  (sobrevive a reconexão)
const strikes = new Map(); // userId → [timestamps]

export const historyOf = (id) => { if (!histories.has(id)) histories.set(id, []); return histories.get(id); };

/** esquece tudo que está na memória sobre um jogador (conta excluída) */
export function forget(id) { histories.delete(id); mutes.delete(id); strikes.delete(id); }

export function mute(id, ms, reason = '', by = 'sistema') { mutes.set(id, { until: Date.now() + ms, reason, by }); }
export function unmute(id) { return mutes.delete(id); }
export function muteLeft(id) {
  const m = mutes.get(id);
  if (!m) return 0;
  const left = m.until - Date.now();
  if (left <= 0) { mutes.delete(id); return 0; }
  return left;
}

/**
 * Passa a mensagem pelo filtro. Retorna {text} pronto para enviar, ou {blocked: 'motivo'}.
 * Também grava a mensagem original no histórico (prova para denúncias).
 */
export function checkChat(p, raw, to = null) {
  const now = Date.now();
  const left = muteLeft(p.id);
  if (left) return { blocked: `🔇 Você está silenciado. Aguarde ${fmtDur(left)}.` };
  const h = historyOf(p.id);
  h.push({ at: now, to, text: raw });
  if (h.length > HISTORY) h.shift();
  // texto original no banco (apagado depois de RETENTION_DAYS, ver purgeOldRecords)
  try { q.logChat.run(p.id, to, raw, now); } catch (e) { console.error('[chat] falhou ao gravar:', e.message); }
  const f = filterText(raw);
  let notice = null;
  if (f.hits) {
    const list = (strikes.get(p.id) || []).filter((t) => now - t < STRIKE_WINDOW);
    for (let i = 0; i < f.hits; i++) list.push(now);
    if (list.length >= STRIKES_TO_MUTE) {
      mute(p.id, AUTO_MUTE_MS, 'linguagem ofensiva (automático)');
      strikes.delete(p.id);
      notice = `🔇 Você foi silenciado por ${AUTO_MUTE_MS / 1000} s por linguagem ofensiva.`;
    } else strikes.set(p.id, list);
  }
  return { text: f.text, notice };
}

export function fmtDur(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  return `${Math.round(s / 360) / 10} h`;
}

/** Cria uma denúncia. Retorna o texto de resposta para quem denunciou. */
export function report(me, target, reason, note) {
  const now = Date.now();
  if (target.id === me.id) return 'Você não pode denunciar a si mesmo.';
  if (q.recentReport.get(me.id, target.id, now - 10 * 60e3).n) return `Você já denunciou ${target.name} há pouco. Nossa equipe vai analisar.`;
  if (q.reportsBy.get(me.id, now - 60 * 60e3).n >= 10) return 'Limite de denúncias por hora atingido. Tente mais tarde.';
  const evidence = JSON.stringify({ note, messages: historyOf(target.id) });
  q.insertReport.run(me.id, target.id, REPORT_REASONS.includes(reason) ? reason : 'outro', evidence, now);
  console.log(`[denúncia] ${me.name} → ${target.name} (${reason})`);
  return `✅ Denúncia de ${target.name} enviada. Obrigado! As mensagens recentes foram anexadas como prova.`;
}

/** Registra uma ação da equipe (quem, o quê, em quem) */
export function staffLog(actor, action, targetName = null, details = null) {
  q.staffLog.run(actor?.id ?? null, actor?.name ?? 'console', action, targetName, details == null ? null : String(details).slice(0, 300), Date.now());
  console.log(`[equipe] ${actor?.name ?? 'console'} ${action}${targetName ? ` → ${targetName}` : ''}${details ? ` (${details})` : ''}`);
}
