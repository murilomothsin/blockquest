// Login / criação de conta / modo offline / troca de senha
import { MIN_AGE } from '../shared/legal.js';

const TOKEN_KEY = 'blockquest-token';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Servidor indisponível. Você pode jogar offline.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw new ApiError(res.status, data.error || (res.status >= 500 || res.status === 404 ? 'Servidor indisponível. Você pode jogar offline.' : `Erro ${res.status}`));
  return data;
}

const $ = (id) => document.getElementById(id);

/**
 * Resolve com { online: true, token, user, save } ou { online: false }.
 * Usa o token salvo se ainda for válido; senão mostra a tela de login.
 */
export async function startSession() {
  // prévia do painel admin: sempre offline, sem tela de login
  if (new URLSearchParams(location.search).has('preview')) return { online: false, preview: true };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      const { user, save } = await api('/me', { token });
      if (user.mustChange) await changePasswordDialog(token, { forced: true });
      return { online: true, token, user, save };
    } catch (err) {
      if (err.status === 401 || err.status === 403) localStorage.removeItem(TOKEN_KEY);
      return showLogin(err.status === 401 ? 'Sua sessão expirou. Entre de novo.' : err.message); // 403 = conta suspensa
    }
  }
  return showLogin();
}

function showLogin(message = '') {
  return new Promise((resolve) => {
    const el = $('login');
    el.classList.remove('hidden');
    for (const s of el.querySelectorAll('[data-minage]')) s.textContent = MIN_AGE;
    let mode = 'login';

    const render = () => {
      $('ltab-login').classList.toggle('active', mode === 'login');
      $('ltab-register').classList.toggle('active', mode === 'register');
      $('lconfirm-row').classList.toggle('hidden', mode !== 'register');
      $('lage-row').classList.toggle('hidden', mode !== 'register');
      $('lsubmit').textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
      $('lpass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    };
    const setError = (msg) => { $('lerror').textContent = msg || ''; };
    setError(message);
    render();
    $('ltab-login').onclick = () => { mode = 'login'; setError(''); render(); };
    $('ltab-register').onclick = () => { mode = 'register'; setError(''); render(); };
    setTimeout(() => $('luser').focus(), 50);

    $('lform').onsubmit = async (ev) => {
      ev.preventDefault();
      const username = $('luser').value.trim();
      const password = $('lpass').value;
      if (mode === 'register' && password !== $('lconfirm').value) return setError('As senhas não conferem.');
      if (mode === 'register' && !$('lage').checked) return setError(`Para criar a conta, confirme que você tem ${MIN_AGE} anos ou mais.`);
      $('lsubmit').disabled = true;
      setError('');
      try {
        const body = mode === 'login' ? { username, password } : { username, password, ageOk: true };
        const data = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body });
        localStorage.setItem(TOKEN_KEY, data.token);
        // senha temporária (gerada pelo admin): troca antes de entrar
        if (data.user.mustChange) { el.classList.add('hidden'); await changePasswordDialog(data.token, { forced: true, old: password }); }
        // o progresso offline NÃO vai para a conta: online tudo é validado pelo servidor
        el.classList.add('hidden');
        resolve({ online: true, token: data.token, user: data.user, save: data.save });
      } catch (err) {
        setError(err.message);
      } finally {
        $('lsubmit').disabled = false;
      }
    };

    $('loffline').onclick = () => {
      el.classList.add('hidden');
      resolve({ online: false });
    };
  });
}

/**
 * Janela de troca de senha. forced = depois de uma senha temporária (sem Cancelar);
 * old = senha atual já conhecida (acabou de digitar no login), aí o campo some.
 * Resolve true se trocou, false se cancelou.
 */
export function changePasswordDialog(token, { forced = false, old = null } = {}) {
  return new Promise((resolve) => {
    const box = $('pwbox');
    box.classList.remove('hidden');
    $('pwinfo').textContent = forced ? 'Você entrou com uma senha temporária. Crie uma senha nova para continuar.' : 'Escolha uma senha nova (mínimo 6 caracteres).';
    $('pwold').closest('label').classList.toggle('hidden', !!old);
    $('pwold').required = !old;
    $('pwcancel').classList.toggle('hidden', forced);
    for (const id of ['pwold', 'pwnew', 'pwnew2']) $(id).value = '';
    $('pwerror').textContent = '';
    setTimeout(() => (old ? $('pwnew') : $('pwold')).focus(), 50);
    const done = (v) => { box.classList.add('hidden'); resolve(v); };
    $('pwcancel').onclick = () => done(false);
    $('pwform').onsubmit = async (ev) => {
      ev.preventDefault();
      const password = $('pwnew').value;
      if (password !== $('pwnew2').value) { $('pwerror').textContent = 'As senhas novas não conferem.'; return; }
      $('pwsubmit').disabled = true;
      try {
        await api('/password', { method: 'POST', token, body: { old: old ?? $('pwold').value, password } });
        done(true);
      } catch (err) {
        $('pwerror').textContent = err.message;
      } finally {
        $('pwsubmit').disabled = false;
      }
    };
  });
}

export async function logoutSession(token) {
  try { await api('/logout', { method: 'POST', token }); } catch { /* tanto faz */ }
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}
