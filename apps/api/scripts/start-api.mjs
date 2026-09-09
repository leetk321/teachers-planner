import { spawn, spawnSync } from 'child_process';

const preflight = spawnSync(process.execPath, ['scripts/verify-data-volume.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
if (preflight.status !== 0) process.exit(preflight.status || 1);

const child = spawn(process.execPath, ['src/index-local.js'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

let stopping = false;
const forwardSignal = (signal) => {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) child.kill(signal);
};
process.on('SIGTERM', () => forwardSignal('SIGTERM'));
process.on('SIGINT', () => forwardSignal('SIGINT'));
child.on('error', (error) => {
  console.error(`[start-api] ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) console.error(`[start-api] API stopped by ${signal}`);
  process.exit(code ?? 1);
});
