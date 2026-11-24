// Sobe o servidor do jogo e o Vite juntos: `npm run dev`
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', ...process.argv.slice(2)], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
