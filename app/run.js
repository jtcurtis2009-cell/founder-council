#!/usr/bin/env node
// Keeps the room running. If the server exits with code 75 (after an in-room "Update"),
// it is restarted automatically so the new code takes effect.
const { spawn } = require('child_process');
const path = require('path');

const RESTART = 75;
function start() {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit', env: process.env });
  child.on('exit', code => {
    if (code === RESTART) { console.log('\n  ↻ Restarting with the new version…'); setTimeout(start, 300); }
    else process.exit(code ?? 0);
  });
  const stop = () => child.kill('SIGINT');
  process.removeAllListeners('SIGINT'); process.removeAllListeners('SIGTERM');
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
start();
