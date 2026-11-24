// Mede o custo do "tick" do servidor: simulação dos monstros com N jogadores espalhados pelo mapa.
// Uso: node scripts/bench-server.mjs [jogadores=20] [ticks=2000]
import { MobSim } from '../src/shared/mobs.js';
import { buildLayout, createWorldQueries, DUNGEON_SPAWNS } from '../src/shared/worldData.js';

const N = +process.argv[2] || 20, TICKS = +process.argv[3] || 2000;
const world = createWorldQueries(buildLayout());
const sim = new MobSim(world);
const spots = [[0, 8], [-35, -35], [65, -15], [0, -95], [150, -40], [-130, 80], [-140, -90], [48, -190], [60, 170], ...DUNGEON_SPAWNS.slice(0, 6).map((s) => [s.x, s.z])];
const players = Array.from({ length: N }, (_, i) => {
  const [x, z] = spots[i % spots.length];
  return { id: i + 1, x: x + (i % 3), z: z + 2, dead: false };
});
const t0 = performance.now();
for (let i = 0; i < TICKS; i++) {
  for (const p of players) { p.x += Math.sin(i * 0.1 + p.id) * 0.2; p.z += Math.cos(i * 0.1 + p.id) * 0.2; }
  sim.update(0.05, players);
}
const ms = (performance.now() - t0) / TICKS;
console.log(`${sim.mobs.length} monstros, ${N} jogadores: ${ms.toFixed(3)} ms por tick (orçamento a 20 Hz: 50 ms → ${((ms / 50) * 100).toFixed(1)}% de um núcleo)`);
