#!/usr/bin/env node
// The Room: a zero-dependency viewer server. It makes no AI calls.
// It serves app/public and exposes the session files the Chair writes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { withPortraits, setMouth } = require('./portraits');
const { spawn, execFile } = require('child_process');

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
  'Bash(node app/log.js:*)', 'Bash(node app/log.js *)', 'Bash(node ./app/log.js:*)', 'Bash(node app/export.js:*)',
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
  const lines = [`/council ${q.mode === 'plan' ? 'plan ' : ''}${q.quick ? '--quick ' : ''}${q.question.trim()}`];
  const opts = (q.options || []).map(o => String(o).trim()).filter(Boolean);
  if (opts.length) lines.push('', 'Options:', ...opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`));
  else lines.push('', 'Options: none given. Propose 2-4 concrete options yourself.');
  if (q.context && q.context.trim()) lines.push('', 'Context and numbers:', q.context.trim());
  if (q.lean && q.lean.trim()) lines.push('', 'I am leaning toward: ' + q.lean.trim());
  lines.push('', 'This run was started from the room\'s "New debate" form and is NON-INTERACTIVE: do not ask follow-up questions.',
    'If details are missing, make conservative assumptions and list them in the brief\'s context.',
    'The room server is already running at http://localhost:' + PORT + '. Do not start it.',
    'Follow .claude/skills/council/SKILL.md exactly, including logging every event with node app/log.js and writing the verdict and analysis.',
    'Command form (background mode only allows this): every Bash call must START with `node app/log.js` and use the literal session id, e.g. node app/log.js add 2026-01-01-my-topic <<\'EOF\' ... EOF. Never use shell variables like $ID, cd, &&, or pipes.');
  return lines.join('\n');
}

function describe(tool, input, roster) {
  const base = f => String(f || '').split('/').pop();
  if (tool === 'Bash') {
    const c = String(input.command || '');
    if (/app\/log\.js new/.test(c)) return 'Opening the session';
    if (/app\/log\.js verdict/.test(c)) return 'Saving the verdict write-up';
    if (/app\/log\.js add/.test(c)) {
      const m = c.match(/"type"\s*:\s*"(\w+)"/); return 'Sending to the room' + (m ? ` (${m[1]})` : '');
    }
    return 'Running: ' + c.slice(0, 70);
  }
  if (tool === 'Read') {
    const f = base(input.file_path);
    return f === 'company.md' ? 'Reading your company profile' : f === 'industry.md' ? 'Reading the industry brief' : 'Reading ' + f;
  }
  if (tool === 'Agent' || tool === 'Task') {
    const id = String(input.subagent_type || '').replace('council-', '');
    const seat = (roster.seats || []).find(s => s.id === id);
    return seat ? `Asking ${seat.name}` : 'Asking an advisor';
  }
  if (tool === 'Write') return 'Writing ' + base(input.file_path);
  if (tool === 'Skill') return 'Loading the council protocol';
  return tool;
}

let child = null;
function startJob(q, res) {
  if (job && job.status === 'running') return send(res, 409, { error: 'A debate is already running. Wait for its verdict, or cancel it.' });
  const logFile = path.join(SESSIONS, '.last-run.log');
  fs.mkdirSync(SESSIONS, { recursive: true });
  const out = fs.createWriteStream(logFile);
  const args = ['-p', buildPrompt(q), '--output-format', 'stream-json', '--verbose', '--allowedTools', ...ALLOWED_TOOLS];
  try {
    child = spawn(CLAUDE_BIN, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  } catch (e) {
    return send(res, 500, { error: 'Could not start Claude Code: ' + e.message });
  }
  const roster = readJSON(ROSTER, { seats: [] });
  job = { status: 'running', started: Date.now(), lastOutput: Date.now(), title: q.question.slice(0, 120), log: logFile,
          activity: [], blocked: [], result: '' };
  const note = text => { job.activity.push({ t: Date.now(), text }); if (job.activity.length > 40) job.activity.shift(); };
  note('Starting Claude Code');
  let buf = '';
  child.stdout.on('data', chunk => {
    out.write(chunk); job.lastOutput = Date.now(); buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'assistant' && e.message && Array.isArray(e.message.content)) {
        for (const c of e.message.content) {
          if (c.type === 'tool_use' && !e.parent_tool_use_id) note(describe(c.name, c.input || {}, roster));
          if (c.type === 'text' && !e.parent_tool_use_id && c.text.trim()) job.result = c.text.trim();
        }
      } else if (e.type === 'user' && e.message && Array.isArray(e.message.content)) {
        for (const c of e.message.content) {
          const txt = typeof c.content === 'string' ? c.content : JSON.stringify(c.content || '');
          if (c.type === 'tool_result' && c.is_error && /permission|approv|not allowed/i.test(txt)) {
            job.blocked.push(txt.slice(0, 200)); note('Blocked: a command needed approval');
          }
        }
      } else if (e.type === 'result') {
        job.result = String(e.result || job.result || '');
        (e.permission_denials || []).forEach(d => job.blocked.push(`${d.tool_name}: ${JSON.stringify(d.tool_input).slice(0, 160)}`));
        if (e.is_error) job.error = job.result || 'Claude Code reported an error.';
      }
    }
  });
  child.stderr.on('data', chunk => { out.write(chunk); job.lastOutput = Date.now(); job.stderr = ((job.stderr || '') + chunk).slice(-1500); });
  child.on('error', e => {
    job.status = 'failed';
    job.error = e.code === 'ENOENT'
      ? 'Claude Code is not installed or not on your PATH. Install it with: npm install -g @anthropic-ai/claude-code'
      : e.message;
  });
  child.on('exit', (code, signal) => {
    out.end(); child = null;
    if (job.status !== 'running') return;
    job.finished = Date.now();
    const raw = (job.stderr || '') + ' ' + (job.result || '');
    if (signal === 'SIGTERM' && job.cancelled) { job.status = 'cancelled'; return; }
    if (/not logged in|please run \/login/i.test(raw)) {
      job.status = 'failed'; job.error = 'Claude Code is not signed in. Open Terminal, run `claude`, sign in, then type /exit and try again.'; return;
    }
    const gotVerdict = fs.readdirSync(SESSIONS, { withFileTypes: true }).some(d => {
      if (!d.isDirectory()) return false;
      const f = path.join(SESSIONS, d.name, 'events.jsonl');
      try { return fs.statSync(f).mtimeMs >= job.started && fs.readFileSync(f, 'utf8').includes('"type":"verdict"'); } catch { return false; }
    });
    if (code === 0 && gotVerdict) { job.status = 'done'; return; }
    job.status = 'failed';
    job.error = job.error || (code !== 0 ? `Claude Code stopped unexpectedly (code ${code}).` : 'The Chair finished without reaching a verdict.');
    if (job.blocked.length) job.error += '\n\nBlocked steps:\n- ' + job.blocked.slice(-3).join('\n- ');
    if (job.result) job.error += '\n\nThe Chair said:\n' + job.result.slice(-600);
  });
  console.log('  ▶ New debate started: ' + job.title);
  send(res, 202, { ok: true });
}

function cancelJob(res) {
  if (!job || job.status !== 'running' || !child) return send(res, 400, { error: 'No debate is running.' });
  job.cancelled = true; child.kill('SIGTERM');
  send(res, 200, { ok: true });
}

function jobStatus() {
  if (!job) return { status: 'idle' };
  return { status: job.status, title: job.title, started: job.started, finished: job.finished, error: job.error,
           activity: job.activity.slice(-6), quietFor: Date.now() - job.lastOutput, tail: job.result ? job.result.slice(-600) : '' };
}

// ---------- In-room "Update" and "Company" editor ----------
const COMPANY = path.join(ROOT, '.claude', 'skills', 'council', 'company.md');
const git = (args) => new Promise(resolve =>
  execFile('git', args, { cwd: ROOT, timeout: 120000 }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout + stderr).trim() })));

async function update(res) {
  if (job && job.status === 'running') return send(res, 409, { error: 'A debate is running. Update after it finishes.' });
  if (!fs.existsSync(path.join(ROOT, '.git'))) return send(res, 400, { error: 'This folder was not downloaded with git, so it cannot update itself. Download it again with: git clone https://github.com/jtcurtis2009-cell/founder-council.git' });
  const before = await git(['rev-parse', 'HEAD']);
  // keep any local edits (e.g. your company profile): commit them locally first, then rebase onto the new version
  const dirty = await git(['status', '--porcelain']);
  if (dirty.out) {
    await git(['add', '-A']);
    await git(['-c', 'user.name=Founder Council', '-c', 'user.email=council@localhost', 'commit', '-q', '-m', 'Local edits (saved before update)']);
  }
  const pull = await git(['pull', '--rebase', '--autostash']);
  if (!pull.ok) {
    await git(['rebase', '--abort']);
    return send(res, 500, { error: 'Update failed. Your files were left as they were.\n\n' + pull.out.slice(-800) });
  }
  const after = await git(['rev-parse', 'HEAD']);
  const changed = before.out !== after.out;
  const log = changed ? (await git(['log', '--oneline', '--no-decorate', before.out + '..' + after.out])).out : '';
  send(res, 200, { ok: true, changed, log });
  if (changed) { console.log('  ⬇ Updated:\n' + log); setTimeout(() => process.exit(75), 400); }
}

// ---------- Faces: upload portrait images from the browser ----------
const PORTRAITS = path.join(__dirname, 'public', 'portraits');
function imageExt(buf) {
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function portraitTarget(url) {
  const seat = url.searchParams.get('seat') || '', kind = url.searchParams.get('kind') || 'base';
  const roster = readJSON(ROSTER, { seats: [] });
  if (!roster.seats.some(s => s.id === seat) || !['base', 'talk', 'blink'].includes(kind)) return null;
  return kind === 'base' ? seat : `${seat}-${kind}`;
}
function removePortrait(name) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) { try { fs.unlinkSync(path.join(PORTRAITS, `${name}.${ext}`)); } catch {} }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/health') return send(res, 200, { ok: true, ask: true, manage: true });
  if (p === '/api/job') return send(res, 200, jobStatus());
  if (p === '/api/job/cancel' && req.method === 'POST') return cancelJob(res);
  if (p === '/api/update' && req.method === 'POST') return update(res);
  if (p === '/api/mouth' && req.method === 'POST') {
    const seat = url.searchParams.get('seat'), x = Number(url.searchParams.get('x')), y = Number(url.searchParams.get('y'));
    if (!readJSON(ROSTER, { seats: [] }).seats.some(s => s.id === seat) || !(x >= 0 && x <= 100 && y >= 0 && y <= 100))
      return send(res, 400, { error: 'Bad mouth position.' });
    setMouth(seat, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/portrait' && (req.method === 'POST' || req.method === 'DELETE')) {
    const name = portraitTarget(url);
    if (!name) return send(res, 400, { error: 'Unknown advisor or frame.' });
    if (req.method === 'DELETE') { removePortrait(name); return send(res, 200, { ok: true }); }
    return readRaw(req, 10 * 1024 * 1024).then(buf => {
      const ext = imageExt(buf);
      if (!ext) return send(res, 400, { error: 'Please use a PNG, JPG or WebP image.' });
      fs.mkdirSync(PORTRAITS, { recursive: true });
      removePortrait(name);
      fs.writeFileSync(path.join(PORTRAITS, `${name}.${ext}`), buf);
      send(res, 200, { ok: true });
    }).catch(() => send(res, 413, { error: 'Image is too large (max 10 MB).' }));
  }
  if (p === '/api/company' && req.method === 'GET') {
    try { return send(res, 200, { text: fs.readFileSync(COMPANY, 'utf8') }); } catch { return send(res, 200, { text: '' }); }
  }
  if (p === '/api/company' && req.method === 'POST') {
    return readBody(req, 100000).then(raw => {
      let b; try { b = JSON.parse(raw); } catch { return send(res, 400, { error: 'Bad request' }); }
      if (typeof b.text !== 'string' || b.text.trim().length < 20) return send(res, 400, { error: 'The profile looks empty.' });
      fs.writeFileSync(COMPANY, b.text.replace(/\r\n/g, '\n'));
      send(res, 200, { ok: true });
    }).catch(() => send(res, 413, { error: 'Too much text' }));
  }
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
