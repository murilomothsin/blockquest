// Página de privacidade: números das regras e contato configurado no painel admin
import { MIN_AGE, RETENTION_DAYS } from './shared/legal.js';

for (const e of document.querySelectorAll('[data-minage]')) e.textContent = MIN_AGE;
for (const e of document.querySelectorAll('[data-days]')) e.textContent = RETENTION_DAYS;
fetch('/api/config').then((r) => r.json()).then(({ settings }) => {
  if (settings?.responsavel) document.getElementById('resp').textContent = settings.responsavel;
  if (settings?.contato) {
    const c = settings.contato;
    const el = document.getElementById('contact');
    el.textContent = '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) { const a = document.createElement('a'); a.href = `mailto:${c}`; a.textContent = c; el.append(a); } else el.textContent = c;
  }
}).catch(() => { /* sem servidor: fica o texto padrão */ });
