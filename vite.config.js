import { defineConfig } from 'vite';

// Em desenvolvimento o Vite (5173) repassa a API e o WebSocket para o servidor do jogo (3001)
const SERVER = `http://localhost:${process.env.SERVER_PORT || 3001}`;

export default defineConfig({
  server: {
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace('http', 'ws'), ws: true },
    },
  },
});
