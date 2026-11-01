#!/usr/bin/env node
// The Room: a zero-dependency viewer server. It makes no AI calls.
// It serves app/public and exposes the session files the Chair writes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { withPortraits } = require('./portraits');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 4730;
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(__dirname, 'public');
const SESSIONS = path.join(ROOT, 'sessions');
const ROSTER = path.join(ROOT, '.claude', 'skills', 'council', 'roster.json');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

// ---------- "New debate" from the browser: runs Claude Code headless on your Claude plan ----------
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const ALLOWED_TOOLS = [
  'Read', 'Write', 'Agent', 'Task', 'Skill',
  'Bash(node app/log.js:*)', 'Bash(node app/export.js:*)', 'Bash(curl -s localhost:*)', 'Bash(curl -s http://localhost:*)',
];
let job = null; // { status: 'running'|'done'|'failed', started, finished, log, title }

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function buildPrompt(q) {
  const lines = [`/council ${q.quick ? '--quick ' : ''}${q.question.trim()}`];
  const opts = (q.options || []).map(o => String(o).trim()).filter(Boolean);
  if (opts.length) lines.push('', 'Options:', ...opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`));
  else lines.push('', 'Options: none given. Propose 2-4 concrete options yourself.');
  if (q.context && q.context.trim()) lines.push('', 'Context and numbers:', q.context.trim());
  if (q.lean && q.lean.trim()) lines.push('', 'I am leaning toward: ' + q.lean.trim());
  lines.push('', 'This run was started from the room\'s "New debate" form and is NON-INTERACTIVE: do not ask follow-up questions.',
    'If details are missing, make conservative assumptions and list them in the brief\'s context.',
    'The room server is already running at http://localhost:' + PORT + '. Do not start it.',
    'Follow .claude/skills/council/SKILL.md exactly, including logging every event with node app/log.js and writing the verdict and analysis.');
  return lines.join('\n');
}

function startJob(q, res) {
  if (job && job.status === 'running') return send(res, 409, { error: 'A debate is already running. Wait for its verdict first.' });
  const logFile = path.join(SESSIONS, '.last-run.log');
  fs.mkdirSync(SESSIONS, { recursive: true });
  const out = fs.openSync(logFile, 'w');
  const args = ['-p', buildPrompt(q), '--allowedTools', ...ALLOWED_TOOLS];
  let child;
  try {
    child = spawn(CLAUDE_BIN, args, { cwd: ROOT, stdio: ['ignore', out, out], env: process.env });
  } catch (e) {
    return send(res, 500, { error: 'Could not start Claude Code: ' + e.message });
  }
  job = { status: 'running', started: Date.now(), title: q.question.slice(0, 120), log: logFile };
  child.on('error', e => {
    job.status = 'failed';
    job.error = e.code === 'ENOENT'
      ? 'Claude Code is not installed or not on your PATH. Install it with: npm install -g @anthropic-ai/claude-code'
      : e.message;
  });
  child.on('exit', code => {
    fs.closeSync(out);
    if (job.status !== 'running') return;
    job.status = code === 0 ? 'done' : 'failed';
    job.finished = Date.now();
    if (code !== 0) job.error = 'Claude Code exited with code ' + code + '. If it says you are not logged in, run `claude` once in Terminal and sign in.';
  });
  console.log('  ▶ New debate started: ' + job.title);
  send(res, 202, { ok: true });
}

function jobStatus() {
  if (!job) return { status: 'idle' };
  let tail = '';
  try { tail = fs.readFileSync(job.log, 'utf8').slice(-1500); } catch {}
  return { status: job.status, title: job.title, started: job.started, finished: job.finished, error: job.error, tail };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/health') return send(res, 200, { ok: true, ask: true });
  if (p === '/api/job') return send(res, 200, jobStatus());
  if (p === '/api/ask' && req.method === 'POST') {
    return readBody(req).then(raw => {
      let q; try { q = JSON.parse(raw); } catch { return send(res, 400, { error: 'Bad request' }); }
      if (!q || typeof q.question !== 'string' || q.question.trim().length < 10)
        return send(res, 400, { error: 'Describe the decision in at least a sentence.' });
      startJob(q, res);
    }).catch(() => send(res, 413, { error: 'Too much text' }));
  }
  if (p === '/api/roster') return send(res, 200, withPortraits(readJSON(ROSTER, { seats: [] })));
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
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Founder Council room is open → http://localhost:${PORT}\n  Leave this running. Click "+ New debate" in the room, or type /council <your decision> in Claude Code.\n`);
});
