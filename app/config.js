// Shared paths and settings for local and hosted use.
//
// Local (your Mac): everything lives in the repo folder, debates run through Claude Code.
// Hosted (team server): set DATA_DIR to a persistent disk; sessions, portraits and the
// company profile live there, so they survive redeploys. The repo copies are the seed.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;
const COUNCIL = path.join(ROOT, '.claude', 'skills', 'council');

const cfg = {
  ROOT,
  PUBLIC: path.join(__dirname, 'public'),
  COUNCIL,
  ROSTER: path.join(COUNCIL, 'roster.json'),
  INDUSTRY: path.join(COUNCIL, 'industry.md'),
  BRAINS: path.join(COUNCIL, 'brains'),
  AGENTS: path.join(ROOT, '.claude', 'agents'),
  SESSIONS: DATA_DIR ? path.join(DATA_DIR, 'sessions') : path.join(ROOT, 'sessions'),
  PORTRAITS: DATA_DIR ? path.join(DATA_DIR, 'portraits') : path.join(__dirname, 'public', 'portraits'),
  COMPANY: DATA_DIR ? path.join(DATA_DIR, 'company.md') : path.join(COUNCIL, 'company.md'),
  HOSTED: !!DATA_DIR,
  PORT: Number(process.env.PORT) || 4730,
  HOST: process.env.HOST || '127.0.0.1',
  TEAM_PASSWORD: process.env.TEAM_PASSWORD || '',
  // 'api' runs debates through the Anthropic API (needs ANTHROPIC_API_KEY); 'claude' uses Claude Code.
  RUNNER: process.env.COUNCIL_RUNNER || (process.env.ANTHROPIC_API_KEY ? 'api' : 'claude'),
  MODEL: process.env.COUNCIL_MODEL || 'claude-opus-5-5',
};

// First boot on a fresh disk: copy the repo's company profile and example debates.
function seedDataDir() {
  if (!DATA_DIR) return;
  fs.mkdirSync(cfg.SESSIONS, { recursive: true });
  fs.mkdirSync(cfg.PORTRAITS, { recursive: true });
  if (!fs.existsSync(cfg.COMPANY)) fs.copyFileSync(path.join(COUNCIL, 'company.md'), cfg.COMPANY);
  const repoSessions = path.join(ROOT, 'sessions');
  for (const d of fs.existsSync(repoSessions) ? fs.readdirSync(repoSessions, { withFileTypes: true }) : []) {
    const dest = path.join(cfg.SESSIONS, d.name);
    if (d.isDirectory() && !fs.existsSync(dest)) fs.cpSync(path.join(repoSessions, d.name), dest, { recursive: true });
  }
}

module.exports = { ...cfg, seedDataDir };
