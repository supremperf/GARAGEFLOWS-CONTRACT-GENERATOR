import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
// Shared only by the Node API and Vite proxy, never exposed as a VITE_ value.
process.env.GARAGEFLOWS_LOCAL_CAPABILITY = randomBytes(32).toString('hex');

const api = spawn('npx', ['tsx', 'scripts/serve-api.ts'], { stdio: 'inherit', shell: true });
const web = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5173'], { stdio: 'inherit', shell: true });

function stop() {
  api.kill();
  web.kill();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
