#!/usr/bin/env node
// Session logger used by the Chair (Claude Code). Zero dependencies.
//
//   node app/log.js new "Should I launch a paid mastermind?"   -> prints the session id
//   node app/log.js add <session-id> <<'EOF'
//   {"type":"opening","seat":"hormozi", ...}
//   EOF
//   node app/log.js verdict <session-id> < verdict.md           -> saves verdict.md
//
// Each event is appended as one line to sessions/<id>/events.jsonl.
// The room (app/server.js) streams that file to the browser.

const fs = require('fs');
const path = require('path');

const SESSIONS = path.join(__dirname, '..', 'sessions');
const TYPES = new Set(['brief', 'seats', 'round', 'opening', 'pushback', 'clash', 'rebuttal', 'vote', 'verdict', 'note']);

function die(msg) { console.error('log.js: ' + msg); process.exit(1); }
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'decision';
}
function sessionDir(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) die('bad session id: ' + id);
  const dir = path.join(SESSIONS, id);
  if (!fs.existsSync(dir)) die('no such session: ' + id);
  return dir;
}

const [cmd, arg, ...rest] = process.argv.slice(2);

if (cmd === 'new') {
  const title = [arg, ...rest].join(' ').trim();
  if (!title) die('usage: log.js new "<decision title>"');
  const date = new Date().toISOString().slice(0, 10);
  let id = `${date}-${slugify(title)}`;
  for (let n = 2; fs.existsSync(path.join(SESSIONS, id)); n++) id = `${date}-${slugify(title)}-${n}`;
  fs.mkdirSync(path.join(SESSIONS, id), { recursive: true });
  fs.writeFileSync(path.join(SESSIONS, id, 'meta.json'), JSON.stringify({ id, title, created: new Date().toISOString() }, null, 2));
  fs.writeFileSync(path.join(SESSIONS, id, 'events.jsonl'), '');
  console.log(id);
} else if (cmd === 'add') {
  const dir = sessionDir(arg);
  const raw = readStdin().trim();
  if (!raw) die('pipe one JSON event (or a JSON array of events) on stdin');
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { die('invalid JSON: ' + e.message); }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  for (const ev of events) {
    if (!ev || !TYPES.has(ev.type)) die('event.type must be one of: ' + [...TYPES].join(', '));
    ev.t = new Date().toISOString();
    fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(ev) + '\n');
  }
  console.log(`logged ${events.length} event(s) to ${arg}`);
} else if (cmd === 'verdict') {
  const dir = sessionDir(arg);
  const md = readStdin();
  if (!md.trim()) die('pipe the verdict markdown on stdin');
  fs.writeFileSync(path.join(dir, 'verdict.md'), md);
  console.log('saved verdict.md');
} else {
  die('usage: log.js new "<title>" | add <id> < event.json | verdict <id> < verdict.md');
}
