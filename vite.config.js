import { defineConfig } from 'vite';

// Em desenvolvimento o Vite (5173) repassa a API e o WebSocket para o servidor do jogo (3001)
const SERVER = `http://localhost:${process.env.SERVER_PORT || 3001}`;

/** /admin (sem .html) também abre o painel no modo desenvolvimento */
const adminRoute = {
  name: 'admin-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => { if (/^\/admin\/?(\?|$)/.test(req.url)) req.url = req.url.replace(/^\/admin\/?/, '/admin.html'); next(); });
  },
};

export default defineConfig({
  plugins: [adminRoute],
  // duas páginas: o jogo (index.html) e o painel admin (admin.html → /admin)
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
  server: {
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace('http', 'ws'), ws: true },
    },
  },
});
