#!/usr/bin/env node
// Export the room + sessions as ONE self-contained HTML file you can open anywhere
// (double-click it, email it, open it on a phone). No server needed.
//
//   node app/export.js                 -> exports every session to founder-council.html
//   node app/export.js <session-id>    -> exports just that session
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(__dirname, 'public');
const SESSIONS = path.join(ROOT, 'sessions');
const read = f => fs.readFileSync(f, 'utf8');
const readJSON = (f, d) => { try { return JSON.parse(read(f)); } catch { return d; } };

const only = process.argv[2];
const sessions = {};
for (const id of fs.readdirSync(SESSIONS)) {
  const dir = path.join(SESSIONS, id);
  if (!fs.statSync(dir).isDirectory() || (only && id !== only)) continue;
  const events = (fs.existsSync(path.join(dir, 'events.jsonl')) ? read(path.join(dir, 'events.jsonl')) : '')
    .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  sessions[id] = {
    meta: readJSON(path.join(dir, 'meta.json'), { id, title: id }),
    events,
    verdict: fs.existsSync(path.join(dir, 'verdict.md')) ? read(path.join(dir, 'verdict.md')) : null,
  };
}
if (!Object.keys(sessions).length) { console.error('No sessions found' + (only ? ' for ' + only : '')); process.exit(1); }

const data = { roster: readJSON(path.join(ROOT, '.claude/skills/council/roster.json'), { seats: [] }), sessions };

// Serve /api/* from the embedded data, so room.js runs unchanged.
const shim = `window.__COUNCIL__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};
(function () {
  const D = window.__COUNCIL__;
  const ok = (body, type) => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': type || 'application/json' } }));
  window.fetch = function (url) {
    const p = String(url);
    if (p === '/api/roster') return ok(D.roster);
    if (p === '/api/sessions') return ok(Object.entries(D.sessions).map(([id, s]) => ({
      id, title: s.meta.title, example: !!s.meta.example, done: s.events.some(e => e.type === 'verdict'), updated: 0 })));
    const m = p.match(/^\\/api\\/sessions\\/([^/]+)(\\/verdict\\.md)?$/);
    if (m) { const s = D.sessions[decodeURIComponent(m[1])];
      if (!s) return Promise.resolve(new Response('not found', { status: 404 }));
      if (m[2]) return ok(s.verdict || 'No verdict yet', 'text/markdown');
      return ok({ meta: s.meta, events: s.events }); }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  // verdict.md link -> download from embedded data
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href$="/verdict.md"]'); if (!a) return;
    e.preventDefault();
    const id = decodeURIComponent(a.getAttribute('href').split('/')[3]);
    const blob = new Blob([(D.sessions[id] || {}).verdict || 'No verdict yet'], { type: 'text/markdown' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = id + '-verdict.md'; link.click();
  });
})();`;

let html = read(path.join(PUB, 'index.html'))
  .replace('<link rel="stylesheet" href="room.css">', `<style>\n${read(path.join(PUB, 'room.css'))}\n</style>`)
  .replace('<script src="avatar.js"></script>', `<script>\n${shim}\n</script>\n<script>\n${read(path.join(PUB, 'avatar.js'))}\n</script>`)
  .replace('<script src="room.js"></script>', `<script>\n${read(path.join(PUB, 'room.js')).replace(/<\/script/g, '<\\/script')}\n</script>`);

const out = path.join(ROOT, only ? `founder-council-${only}.html` : 'founder-council.html');
fs.writeFileSync(out, html);
console.log('Wrote ' + path.relative(process.cwd(), out) + ` (${Object.keys(sessions).length} session(s)). Open it in any browser.`);
