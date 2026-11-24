// Conexão em tempo real com o servidor (WebSocket)
export class Net {
  constructor(token) {
    this.token = token;
    this.handlers = new Map();
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.pendingSave = null;
    this.lastState = 0;
    this.stopped = false;
    this.connect();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, msg) { for (const fn of this.handlers.get(type) || []) fn(msg); }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: this.token }));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'welcome') {
        this.connected = true;
        this.id = msg.id;
        if (this.pendingSave) { this.send({ t: 'save', data: this.pendingSave }); this.pendingSave = null; }
      }
      this.emit(msg.t, msg);
    };
    ws.onclose = (ev) => {
      const was = this.connected;
      this.connected = false;
      this.emit('disconnect', { code: ev.code, was });
      // 4001 = conta entrou em outro lugar, 4003 = sessão inválida: não reconecta
      if (this.stopped || ev.code === 4001 || ev.code === 4003) return;
      setTimeout(() => this.connect(), 3000);
    };
  }

  send(msg) {
    if (this.connected && this.ws?.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  /** posição/animação do jogador, no máximo 10x por segundo */
  sendState(state) {
    const now = performance.now();
    if (now - this.lastState < 100) return;
    this.lastState = now;
    this.send({ t: 'state', ...state });
  }

  save(data) { if (!this.send({ t: 'save', data })) this.pendingSave = data; }
  chat(text, to = null) { this.send(to ? { t: 'chat', text, to } : { t: 'chat', text }); }
  close() { this.stopped = true; this.ws?.close(); }
}
