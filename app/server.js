#!/usr/bin/env node
// The Room: a zero-dependency viewer server. It makes no AI calls.
// It serves app/public and exposes the session files the Chair writes.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4730;
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(__dirname, 'public');
const SESSIONS = path.join(ROOT, 'sessions');
const ROSTER = path.join(ROOT, '.claude', 'skills', 'council', 'roster.json');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function readEvents(dir) {
  let raw = '';
  try { raw = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8'); } catch { return []; }
  return raw.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}

function listSessions() {
  if (!fs.existsSync(SESSIONS)) return [];
  return fs.readdirSync(SESSIONS, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(SESSIONS, d.name);
      const meta = readJSON(path.join(dir, 'meta.json'), { id: d.name, title: d.name });
      const events = readEvents(dir);
      const stat = fs.statSync(path.join(dir, 'events.jsonl'), { throwIfNoEntry: false });
      return { id: d.name, title: meta.title, created: meta.created, example: !!meta.example,
               done: events.some(e => e.type === 'verdict'), updated: stat ? stat.mtimeMs : 0 };
    })
    .sort((a, b) => (a.example - b.example) || (b.updated - a.updated));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/health') return send(res, 200, { ok: true });
  if (p === '/api/roster') return send(res, 200, readJSON(ROSTER, { seats: [] }));
  if (p === '/api/sessions') return send(res, 200, listSessions());

  const m = p.match(/^\/api\/sessions\/([a-z0-9-]+)(\/verdict\.md)?$/);
  if (m) {
    const dir = path.join(SESSIONS, m[1]);
    if (!fs.existsSync(dir)) return send(res, 404, { error: 'not found' });
    if (m[2]) {
      try { return send(res, 200, fs.readFileSync(path.join(dir, 'verdict.md')), 'text/markdown'); }
      catch { return send(res, 404, 'no verdict yet', 'text/plain'); }
    }
    return send(res, 200, { meta: readJSON(path.join(dir, 'meta.json'), { id: m[1] }), events: readEvents(dir) });
  }

  // static files
  const file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}).listen(PORT, () => {
  console.log(`\n  Founder Council room is open → http://localhost:${PORT}\n  Leave this running, then type /council <your decision> in Claude Code.\n`);
});
