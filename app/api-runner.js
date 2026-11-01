// Runs a full council through the Anthropic API (no Claude Code needed). Used by the hosted
// team version. It follows the same protocol as .claude/skills/council/SKILL.md and writes the
// same events, so the room plays it back exactly like a Claude Code debate.
const fs = require('fs');
const path = require('path');
const C = require('./config');

const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'decision';
const stripFrontmatter = s => s.replace(/^---[\s\S]*?---\s*/, '');

// ---------- JSON schemas (structured outputs) ----------
const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const obj = (props, required = Object.keys(props)) => ({ type: 'object', properties: props, required, additionalProperties: false });
const scoresSchema = keys => obj(Object.fromEntries(keys.map(k => [k, { type: 'number' }])));

function briefSchema(seatIds) {
  return obj({
    title: str, question: str, context: str, lean: str,
    options: { type: 'array', items: obj({ key: str, label: str, detail: str }) },
    weights: obj(Object.fromEntries(seatIds.map(id => [id, { type: 'integer' }]))),
  });
}
const openingSchema = plan => obj({
  stance: { type: 'string', enum: ['Yes', 'No', 'Yes, if'] }, pick: str, headline: str, speech: str, weighing: str,
  ...(plan ? { moves: strArr } : {}),
});
const clashSchema = seatIds => obj({
  pushback: str,
  clashes: { type: 'array', items: obj({ question: str, sides: { type: 'array', items: obj({ label: str, seats: { type: 'array', items: { type: 'string', enum: seatIds } } }) } }) },
});
const rebuttalSchema = seatIds => obj({ target: { type: 'string', enum: seatIds }, headline: str, speech: str, changed_mind: { type: 'boolean' } });
const voteSchema = keys => obj({ scores: scoresSchema(keys), ruin: strArr, speech: str });
const verdictSchema = (keys, plan) => obj({
  headline: str, summary: str, conditions: strArr, next_steps: strArr, dissent: str,
  analysis: { type: 'array', items: obj({ option: str, for: str, against: str }) },
  risks: strArr,
  ...(plan ? {
    allocation: scoresSchema(keys),
    roadmap: { type: 'array', items: obj({ milestone: str, by: str, focus: str, moves: strArr, kpis: strArr }) },
  } : {}),
});

// ---------- the runner ----------
class CouncilRun {
  constructor({ question, options = [], context = '', lean = '', quick = false, mode = 'decision' }, { client, note, onSession }) {
    this.q = { question: question.trim(), options: options.map(o => String(o).trim()).filter(Boolean), context: context.trim(), lean: lean.trim(), quick: !!quick, plan: mode === 'plan' };
    this.client = client; this.note = note || (() => {}); this.onSession = onSession || (() => {});
    this.roster = JSON.parse(read(C.ROSTER));
    this.seats = this.roster.default_board.map(id => this.roster.seats.find(s => s.id === id)).filter(Boolean);
    this.seatIds = this.seats.map(s => s.id);
    this.company = read(C.COMPANY);
    this.industry = read(C.INDUSTRY);
    this.cancelled = false;
  }

  // --- infrastructure ---
  log(ev) {
    if (this.cancelled) throw new Error('cancelled');
    const list = Array.isArray(ev) ? ev : [ev];
    for (const e of list) fs.appendFileSync(path.join(this.dir, 'events.jsonl'), JSON.stringify({ ...e, t: new Date().toISOString() }) + '\n');
  }
  openSession(title) {
    const date = new Date().toISOString().slice(0, 10);
    let id = `${date}-${slugify(title)}`;
    for (let n = 2; fs.existsSync(path.join(C.SESSIONS, id)); n++) id = `${date}-${slugify(title)}-${n}`;
    this.id = id; this.dir = path.join(C.SESSIONS, id);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, 'meta.json'), JSON.stringify({ id, title, created: new Date().toISOString() }, null, 2));
    fs.writeFileSync(path.join(this.dir, 'events.jsonl'), '');
    this.onSession(id);
  }

  sharedContext() {
    return `# Company profile\n\n${this.company}\n\n# Industry brief (sourced benchmarks)\n\n${this.industry}`;
  }
  chairSystem() {
    return [
      { type: 'text', text: `You are the Chair of the Founder Council: five simulated advisors (${this.seats.map(s => `${s.name} – ${s.pillar}`).join('; ')}) who debate decisions for the company described below. You never argue a side. You frame decisions sharply, force real disagreement, and write clear, practical verdicts. The advisors are simulations built from public work; never present their words as real quotes. Keep the founder's numbers exact and state assumptions explicitly. Judge everything by how far and how safely it moves the company toward its North Star.` },
      { type: 'text', text: this.sharedContext(), cache_control: { type: 'ephemeral' } },
    ];
  }
  seatSystem(seat) {
    const agent = stripFrontmatter(read(path.join(C.AGENTS, `council-${seat.id}.md`)))
      .replace(/Before answering, Read[^\n]*\n?/, '')
      .replace(/Reply with \*\*only\*\* the JSON object[^\n]*/, '');
    const brain = read(path.join(C.BRAINS, `${seat.id}.md`));
    return [
      { type: 'text', text: `${agent.trim()}\n\nYour brain, company profile and the industry brief follow. Reason with them; cite only numbers that appear in them or in the brief.` },
      { type: 'text', text: `# Your brain\n\n${brain}\n\n${this.sharedContext()}`, cache_control: { type: 'ephemeral' } },
    ];
  }

  async ask(system, prompt, schema, effort = 'medium') {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.cancelled) throw new Error('cancelled');
      const res = await this.client.beta.messages.create({
        model: C.MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort, format: { type: 'json_schema', schema } },
      });
      if (res.stop_reason === 'refusal') throw new Error('The model declined this request' + (res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : '.'));
      const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
      try { return JSON.parse(text); } catch { if (attempt) throw new Error('The model returned an unreadable answer twice.'); }
    }
  }
  askSeat(seat, prompt, schema) {
    this.note(`Asking ${seat.name}`);
    return this.ask(this.seatSystem(seat), prompt, schema, 'medium');
  }

  // --- protocol ---
  briefText() {
    const b = this.brief;
    return `DECISION: ${b.question}\nCONTEXT: ${b.context}\nFOUNDER LEANS: ${b.lean || 'not stated'}\nOPTIONS:\n${b.options.map(o => `${o.key}. ${o.label} – ${o.detail}`).join('\n')}`;
  }
  transcript() {
    return (this.lines || []).join('\n');
  }

  async run() {
    const { q } = this;
    this.note('Framing the decision');
    this.brief = await this.ask(this.chairSystem(), [
      q.plan ? `Plan mode ("Road to 2,000"). Frame the growth plan as 3–4 strategic growth paths (options A–D) proposed from the company profile and industry brief (e.g. organic owner acquisition, buying small PM companies, hotel management contracts, a second market/MTR), unless the founder listed options.` : `Frame this decision for the council.`,
      `Founder's question: ${q.question}`,
      q.options.length ? `Founder's options (keep them, assign keys A, B, C…):\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : (q.plan ? '' : 'No options given: propose 2–4 concrete options.'),
      q.context ? `Founder's context and numbers: ${q.context}` : '',
      q.lean ? `Founder leans toward: ${q.lean}` : '',
      `Return: a short title (≤ 60 chars), the question, a context paragraph that includes the founder's numbers exactly plus any assumptions you had to make, the lean (option key or empty), the options (keys A, B, C…), and weights 1–3 per seat (${this.seatIds.join(', ')}) for how much each pillar matters to this decision.`,
    ].filter(Boolean).join('\n\n'), briefSchema(this.seatIds), 'high');
    const keys = this.brief.options.map(o => o.key);
    this.openSession(this.brief.title);
    this.log([
      { type: 'brief', title: this.brief.title, question: this.brief.question, context: this.brief.context, lean: this.brief.lean, options: this.brief.options },
      { type: 'seats', seats: this.seatIds, weights: this.brief.weights },
    ]);

    // Round 1: openings (in parallel, logged as each arrives)
    this.log({ type: 'round', n: 1, name: 'Openings' });
    this.lines = [];
    const openings = {};
    await Promise.all(this.seats.map(async seat => {
      const r = await this.askSeat(seat, `${this.briefText()}\n\nRound 1, Openings. Give your first position.${q.plan ? ' Also give exactly 3 concrete moves for your pillar (each ≤ 15 words).' : ''}\nheadline ≤ 12 words; speech ≤ 90 words, first person, in your voice; weighing ≤ 12 words; pick = one option key (${keys.join(', ')}).`, openingSchema(q.plan));
      openings[seat.id] = r;
      this.log({ type: 'opening', seat: seat.id, ...r });
      this.lines.push(`${seat.name} (opening, picks ${r.pick}, ${r.stance}): ${r.headline} — ${r.speech}${r.moves ? ` Moves: ${r.moves.join('; ')}` : ''}`);
    }));

    // Round 2: crossfire
    if (!q.quick) {
      this.log({ type: 'round', n: 2, name: 'Crossfire' });
      this.note('Finding where the council disagrees');
      const counts = {}; Object.values(openings).forEach(o => { counts[o.pick] = (counts[o.pick] || 0) + 1; });
      const consensus = Math.max(...Object.values(counts)) >= 4;
      const cf = await this.ask(this.chairSystem(), `${this.briefText()}\n\nOPENINGS:\n${this.transcript()}\n\n${consensus ? 'Four or more seats picked the same option. Write a one-sentence pushback starting "Too much agreement." that steelmans the strongest losing option, and make the clash questions test the consensus.' : 'Return pushback as an empty string.'}\nFind the 2–3 sharpest disagreements the answer actually turns on. For each, a short question and 2 sides, each with a short label and the seat ids on that side (every seat on at most one side per question).${q.plan ? ' Focus on sequencing and trade-offs: what comes first, capital vs capital-light, hotels now vs later, new market timing.' : ''}`, clashSchema(this.seatIds), 'high');
      if (cf.pushback && cf.pushback.trim()) this.log({ type: 'pushback', text: cf.pushback.trim() });
      for (const c of cf.clashes) this.log({ type: 'clash', question: c.question, sides: c.sides });
      const clashText = cf.clashes.map(c => `- ${c.question}`).join('\n');
      const rebuttals = [];
      await Promise.all(this.seats.map(async seat => {
        const r = await this.askSeat(seat, `${this.briefText()}\n\nOPENINGS:\n${this.transcript()}\n\n${cf.pushback ? `CHAIR: ${cf.pushback}\n` : ''}CLASH QUESTIONS:\n${clashText}\n\nRound 2, Crossfire. Answer the seat you most disagree with (target = their seat id, not your own: ${seat.id}). headline ≤ 12 words; speech ≤ 90 words. Set changed_mind true only if you now pick a different option.`, rebuttalSchema(this.seatIds.filter(id => id !== seat.id)));
        this.log({ type: 'rebuttal', seat: seat.id, ...r });
        rebuttals.push(`${seat.name} → ${(this.seats.find(s => s.id === r.target) || {}).name}: ${r.headline} — ${r.speech}`);
      }));
      this.lines.push('CROSSFIRE:', ...rebuttals);
    }

    // Round 3: final vote
    this.log({ type: 'round', n: 3, name: 'Final vote' });
    const votes = {};
    await Promise.all(this.seats.map(async seat => {
      const r = await this.askSeat(seat, `${this.briefText()}\n\nTRANSCRIPT:\n${this.transcript()}\n\nRound 3, Final vote. Score every option 0–10${q.plan ? ' for how much it should drive the plan' : ''}. List in ruin the option keys that risk ruin (usually none). speech ≤ 50 words, your closing line.`, voteSchema(keys));
      r.ruin = (r.ruin || []).filter(k => keys.includes(k));
      votes[seat.id] = r;
      this.log({ type: 'vote', seat: seat.id, ...r });
    }));

    // Score (deterministic): weighted average, ruin cap at 5.0, ties to the more reversible option
    const w = this.brief.weights, totalW = this.seatIds.reduce((t, id) => t + (Number(w[id]) || 1), 0);
    const scores = {}, capped = [];
    for (const k of keys) {
      let s = this.seatIds.reduce((t, id) => t + (Number(votes[id].scores[k]) || 0) * (Number(w[id]) || 1), 0) / totalW;
      if (this.seatIds.some(id => votes[id].ruin.includes(k))) { s = Math.min(s, 5); capped.push(k); }
      scores[k] = Math.round(s * 10) / 10;
    }
    const winner = keys.slice().sort((a, b) => scores[b] - scores[a])[0];

    // Verdict
    this.note('Writing the verdict');
    const voteText = this.seats.map(s => `${s.name}: ${keys.map(k => `${k}=${votes[s.id].scores[k]}`).join(', ')}${votes[s.id].ruin.length ? ` (ruin: ${votes[s.id].ruin.join(',')})` : ''} — ${votes[s.id].speech}`).join('\n');
    const v = await this.ask(this.chairSystem(), `${this.briefText()}\n\nTRANSCRIPT:\n${this.transcript()}\n\nVOTES:\n${voteText}\n\nWEIGHTED SCORES (final, after ruin caps): ${keys.map(k => `${k}=${scores[k]}`).join(', ')}${capped.length ? ` (capped: ${capped.join(',')})` : ''}. WINNER: ${winner}.\n\nWrite the verdict for the winner: a headline (≤ 12 words), a 2–3 sentence summary, 3 conditions, ${q.plan ? '5–6 next steps for the next 30 days' : '3–5 next steps for the next 7 days'}, a one-sentence dissent (who disagreed most and why), an option-by-option analysis (strongest case for and against each option, one sentence each) and the 2–3 biggest risks, each with how to de-risk it.${q.plan ? ' Also an allocation (share of effort per option key, summing to 100) and a roadmap of 4–5 milestones ending at 2,000 units, each with by-when, focus, moves (credit the pillar in parentheses, e.g. "(Martell)") and KPIs.' : ''}`, verdictSchema(keys, q.plan), 'high');
    this.log({ type: 'verdict', winner, scores, capped, ...v });
    fs.writeFileSync(path.join(this.dir, 'verdict.md'), verdictMarkdown(this, winner, scores, capped, votes, v));
    this.note('Done');
    return this.id;
  }
}

function verdictMarkdown(run, winner, scores, capped, votes, v) {
  const b = run.brief, label = k => (b.options.find(o => o.key === k) || {}).label || k;
  const rows = Object.keys(scores).sort((x, y) => scores[y] - scores[x]).map(k => `| ${k === winner ? '**' : ''}${k}: ${label(k)}${k === winner ? '**' : ''} | ${scores[k]}${capped.includes(k) ? ' (ruin cap)' : ''} |`);
  const out = [
    `# Verdict: ${b.title}`, '', `**Decision:** ${b.question}`, '', b.context, '',
    `## ${v.headline}`, '', v.summary, '', '| Option | Score |', '|---|---|', ...rows, '',
    '## Positions', ...run.seats.map(s => `- **${s.name}:** ${run.seatIds.length ? Object.keys(scores).map(k => `${k}=${votes[s.id].scores[k]}`).join(', ') : ''}. ${votes[s.id].speech}`), '',
    '## Option-by-option', ...v.analysis.map(a => `- **${a.option}: ${label(a.option)}.** For: ${a.for} Against: ${a.against}`), '',
    '## Biggest risks', ...v.risks.map(r => `- ${r}`), '',
    '## Conditions', ...v.conditions.map((c, i) => `${i + 1}. ${c}`), '',
    '## Next steps', ...v.next_steps.map(n => `- ${n}`), '',
  ];
  if (v.allocation) out.push('## Where the effort goes', ...Object.entries(v.allocation).map(([k, p]) => `- ${k}: ${label(k)}: ${p}%`), '');
  if (v.roadmap) out.push('## Roadmap', '| Milestone | By | Focus | KPIs |', '|---|---|---|---|', ...v.roadmap.map(m => `| ${m.milestone} | ${m.by} | ${m.focus} | ${m.kpis.join('; ')} |`), '');
  out.push('## Dissent', v.dissent, '', '---', `*${run.roster.disclaimer}*`, '');
  return out.join('\n');
}

function makeClient() {
  if (process.env.COUNCIL_FAKE_CLIENT) return require(process.env.COUNCIL_FAKE_CLIENT)(); // tests only
  const Anthropic = require('@anthropic-ai/sdk'); // loaded only in API mode, so local use needs no npm install
  return new (Anthropic.default || Anthropic)();
}

module.exports = { CouncilRun, makeClient };
