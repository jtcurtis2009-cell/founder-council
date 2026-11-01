// Finds portrait images for each seat in app/public/portraits/.
//   <id>.png|jpg|jpeg|webp         main portrait (required to switch a seat to portrait mode)
//   <id>-talk.png|jpg|jpeg|webp    optional mouth-open frame (alternates while speaking)
//   <id>-blink.png|jpg|jpeg|webp   optional eyes-closed frame
const fs = require('fs');
const path = require('path');

const DIR = require('./config').PORTRAITS;
const EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function find(name) {
  for (const ext of EXTS) {
    const file = path.join(DIR, `${name}.${ext}`);
    if (fs.existsSync(file)) return { file, ext, url: `portraits/${name}.${ext}` };
  }
  return null;
}

// inline=true embeds images as data: URIs (for the single-file export)
const MOUTHS = path.join(DIR, 'mouth.json');
function readMouths() { try { return JSON.parse(fs.readFileSync(MOUTHS, 'utf8')); } catch { return {}; } }
function setMouth(seat, x, y) {
  const m = readMouths(); m[seat] = { x, y };
  fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(MOUTHS, JSON.stringify(m, null, 2));
}

function withPortraits(roster, inline = false) {
  const mouths = readMouths();
  const src = f => (inline ? `data:${MIME[f.ext]};base64,${fs.readFileSync(f.file).toString('base64')}` : f.url);
  return {
    ...roster,
    seats: (roster.seats || []).map(seat => {
      const base = find(seat.id);
      if (!base) return seat;
      const talk = find(`${seat.id}-talk`), blink = find(`${seat.id}-blink`);
      return { ...seat, portrait: src(base), portraitTalk: talk ? src(talk) : undefined, portraitBlink: blink ? src(blink) : undefined, mouth: mouths[seat.id] || seat.mouth };
    }),
  };
}

module.exports = { withPortraits, setMouth };
