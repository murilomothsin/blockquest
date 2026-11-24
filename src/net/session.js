// Login / criação de conta / modo offline
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
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      const { user, save } = await api('/me', { token });
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
    let mode = 'login';

    const render = () => {
      $('ltab-login').classList.toggle('active', mode === 'login');
      $('ltab-register').classList.toggle('active', mode === 'register');
      $('lconfirm-row').classList.toggle('hidden', mode !== 'register');
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
      $('lsubmit').disabled = true;
      setError('');
      try {
        const data = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body: { username, password } });
        localStorage.setItem(TOKEN_KEY, data.token);
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

export async function logoutSession(token) {
  try { await api('/logout', { method: 'POST', token }); } catch { /* tanto faz */ }
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}
