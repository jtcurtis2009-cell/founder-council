// The Room: plays back sessions/<id>/events.jsonl as an animated council.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SPEEDS = [1, 2, 4];

  const S = {
    roster: null, seatsById: {}, id: null, events: [], idx: 0, gen: 0, running: false,
    speed: 1, instant: false, done: false, options: [], timer: null,
  };

  // ---------- helpers ----------
  const sleep = (ms, gen) => new Promise(r => setTimeout(r, S.instant ? 0 : ms / S.speed)).then(() => { if (gen !== S.gen) throw 'cancel'; });
  const seat = id => S.seatsById[id] || { id, name: id, color: '#94a3b8', pillar: '' };
  const face = id => `<span class="face" style="--seat:${seat(id).color}">${avatarSVG(seat(id))}</span>`;
  const optLabel = k => (S.options.find(o => o.key === k) || {}).label || k;

  async function typeText(el, text, gen) {
    el.textContent = '';
    if (S.instant) { el.textContent = text; return; }
    el.classList.add('typing');
    const words = String(text).split(/(\s+)/);
    for (const w of words) { el.textContent += w; if (w.trim()) await sleep(Math.min(55, 18 + w.length * 6), gen); }
    el.classList.remove('typing');
  }

  function setPhase(name) {
    const order = ['brief', 'Openings', 'Crossfire', 'Final vote', 'verdict'];
    const at = order.indexOf(name);
    document.querySelectorAll('#phases span').forEach(s => {
      const i = order.indexOf(s.dataset.phase);
      s.classList.toggle('active', i === at);
      s.classList.toggle('done', i < at);
    });
  }

  function setStatus(kind, text) { $('status').className = 'status ' + kind; $('statusText').textContent = text; }

  function log(html, color, cls = '') {
    const li = document.createElement('li');
    li.className = cls; li.innerHTML = html;
    if (color) li.style.setProperty('--seat', color);
    $('log').appendChild(li);
    li.scrollIntoView({ block: 'nearest', behavior: S.instant ? 'auto' : 'smooth' });
  }

  // ---------- table ----------
  function renderTable(ids) {
    $('table').innerHTML = ids.map((id, i) => {
      const s = seat(id);
      return `<div class="seat" id="seat-${esc(id)}" style="--seat:${s.color};--blink:${(i * 1.37) % 4}s">
        <div class="ring">${avatarSVG(s)}</div>
        <div class="plate"><div class="name">${esc(s.name)}</div><div class="pillar">${esc(s.pillar)}</div>
        <div class="badge" id="badge-${esc(id)}"></div></div></div>`;
    }).join('');
  }
  function setBadge(id, html) {
    const b = $('badge-' + id); if (!b) return;
    b.innerHTML = html; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  function spotlight(id) {
    document.querySelectorAll('.seat').forEach(el => {
      el.classList.toggle('speaking', id && el.id === 'seat-' + id);
      el.classList.toggle('dim', !!id && el.id !== 'seat-' + id);
    });
  }

  async function speak(id, who, head, body, gen) {
    const s = id ? seat(id) : null;
    $('speech').style.setProperty('--seat', s ? s.color : 'var(--accent)');
    $('speechWho').textContent = who;
    $('speechHead').textContent = head || '';
    spotlight(id);
    await typeText($('speechBody'), body || '', gen);
    await sleep(900, gen);
    spotlight(null);
  }

  // ---------- event handlers ----------
  const H = {
    async brief(e, gen) {
      setPhase('brief');
      $('title').textContent = e.title || e.question || 'Untitled decision';
      S.options = e.options || [];
      $('options').innerHTML = S.options.map(o => `<div class="opt" title="${esc(o.detail)}"><b>${esc(o.key)}</b>${esc(o.label)}</div>`).join('');
      log(`<b>Brief.</b> ${esc(e.question || e.title)}${e.lean ? ` <i>(leaning ${esc(e.lean)})</i>` : ''}`, null);
      await speak(null, 'The Chair · Brief', e.question || e.title,
        [e.context, S.options.map(o => `${o.key}: ${o.label}${o.detail ? ' (' + o.detail + ')' : ''}`).join('\n')].filter(Boolean).join('\n\n'), gen);
    },
    async seats(e) { renderTable(e.seats); },
    async round(e, gen) {
      setPhase(e.name);
      log(`Round ${esc(e.n)} · ${esc(e.name)}`, null, 'round');
      $('speech').style.setProperty('--seat', 'var(--accent)');
      $('speechWho').textContent = 'The Chair';
      $('speechHead').textContent = `Round ${e.n}: ${e.name}`;
      $('speechBody').textContent = e.note || '';
      await sleep(1100, gen);
    },
    async opening(e, gen) {
      const s = seat(e.seat);
      setBadge(e.seat, `${esc(e.stance)} <span class="pick">${esc(e.pick)}</span>`);
      log(`<b>${esc(s.name)}</b> · ${esc(e.stance)} ${esc(e.pick)}: ${esc(e.headline)}`, s.color);
      await speak(e.seat, `${s.name} · ${e.weighing || s.pillar}`, e.headline, e.speech, gen);
    },
    async pushback(e, gen) {
      $('pushback').textContent = e.text || 'Too much agreement. The Chair pushes back.';
      $('pushback').classList.remove('hidden');
      log(`<b>Chair:</b> ${esc(e.text)}`, '#fbbf24');
      await sleep(1500, gen);
    },
    async clash(e, gen) {
      const div = document.createElement('div');
      div.className = 'clash';
      div.innerHTML = `<div class="q">${esc(e.question)}</div><div class="sides">${(e.sides || []).map(sd =>
        `<div class="side"><span class="faces">${(sd.seats || []).map(face).join('')}</span>${esc(sd.label)}</div>`).join('')}</div>`;
      $('clashes').appendChild(div);
      log(`<b>Clash:</b> ${esc(e.question)}`, '#fbbf24');
      await sleep(1800, gen);
    },
    async rebuttal(e, gen) {
      const s = seat(e.seat);
      const at = e.target ? ` → ${seat(e.target).name}` : '';
      if (e.changed_mind) setBadge(e.seat, `changed mind`);
      log(`<b>${esc(s.name)}</b>${esc(at)}: ${esc(e.headline)}`, s.color);
      await speak(e.seat, `${s.name}${at}`, e.headline, e.speech, gen);
    },
    async vote(e, gen) {
      const s = seat(e.seat);
      const sc = e.scores || {};
      const best = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
      setBadge(e.seat, Object.keys(sc).map(k => `<span class="${k === best ? 'pick' : ''}">${esc(k)}${esc(sc[k])}</span>`).join(' ')
        + ((e.ruin || []).length ? ` <span style="color:var(--bad)">⚠${esc(e.ruin.join(''))}</span>` : ''));
      log(`<b>${esc(s.name)}</b> votes ${Object.keys(sc).map(k => esc(k) + '=' + esc(sc[k])).join(', ')}`, s.color);
      await speak(e.seat, `${s.name} · final vote`, `Backs ${best}: ${optLabel(best)}`, e.speech, gen);
    },
    async verdict(e, gen) {
      setPhase('verdict');
      const scores = e.scores || {};
      const keys = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
      const v = $('verdict');
      v.innerHTML = `<div class="kicker">Verdict · Option ${esc(e.winner)}</div>
        <h2>${esc(e.headline)}</h2><div class="summary">${esc(e.summary)}</div>
        <div class="bars">${keys.map(k => `<div class="bar ${k === e.winner ? 'win' : ''}">
          <span><b>${esc(k)}</b> ${esc(optLabel(k))}${(e.capped || []).includes(k) ? '<span class="cap">ruin cap</span>' : ''}</span>
          <span class="track"><span class="fill" data-w="${Number(scores[k]) * 10}"></span></span><b>${esc(scores[k])}</b></div>`).join('')}</div>
        <div class="cols">
          <div><h3>Conditions</h3><ul>${(e.conditions || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
          <div><h3>Next steps</h3><ul>${(e.next_steps || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
        </div>
        ${e.dissent ? `<div class="dissent"><b>Dissent:</b> ${esc(e.dissent)}</div>` : ''}
        <div class="vactions"><a href="/api/sessions/${esc(S.id)}/verdict.md" target="_blank">⬇ verdict.md</a>
        <button onclick="window.print()">🖨 Save as PDF</button></div>`;
      v.classList.remove('hidden');
      requestAnimationFrame(() => v.querySelectorAll('.fill').forEach(f => { f.style.width = f.dataset.w + '%'; }));
      log(`<b>Verdict:</b> ${esc(e.winner)}: ${esc(e.headline)}`, '#4ade80');
      await speak(null, 'The Chair · Verdict', e.headline, e.summary, gen);
      if (!S.instant) v.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    async note(e, gen) { log(esc(e.text), null); await sleep(400, gen); },
  };

  // ---------- player ----------
  async function run() {
    if (S.running) return;
    S.running = true;
    const gen = S.gen;
    try {
      while (S.idx < S.events.length) {
        const e = S.events[S.idx++];
        if (H[e.type]) await H[e.type](e, gen);
        if (gen !== S.gen) return;
      }
      S.instant = false;
      if (S.done) setStatus('done', 'verdict in');
      else setStatus('live', 'live · waiting for the Chair…');
    } catch (err) { if (err !== 'cancel') console.error(err); }
    finally { if (gen === S.gen) S.running = false; }
  }

  function reset() {
    S.gen++; S.running = false; S.idx = 0; S.options = [];
    ['options', 'clashes', 'log'].forEach(id => { $(id).innerHTML = ''; });
    $('pushback').classList.add('hidden'); $('verdict').classList.add('hidden');
    $('speechWho').textContent = 'The Chair'; $('speechHead').textContent = ''; $('speechBody').textContent = '';
    renderTable(S.roster.default_board);
    setPhase('');
  }

  async function fetchSession(id) {
    const r = await fetch('/api/sessions/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('session not found');
    return r.json();
  }

  async function load(id) {
    clearInterval(S.timer);
    S.id = id; S.instant = false;
    reset();
    const data = await fetchSession(id);
    S.events = data.events;
    S.done = S.events.some(e => e.type === 'verdict');
    $('title').textContent = data.meta.title || id;
    setStatus(S.done ? 'replay' : 'live', S.done ? 'replaying' : 'live');
    $('sessionSelect').value = id;
    run();
    S.timer = setInterval(poll, 1500);
  }

  async function poll() {
    if (!S.id) return;
    try {
      const data = await fetchSession(S.id);
      if (data.events.length > S.events.length) {
        S.events = data.events;
        S.done = S.events.some(e => e.type === 'verdict');
        run();
      }
    } catch { /* room keeps running */ }
    refreshList();
  }

  let lastList = '';
  async function refreshList(selectNewest) {
    const list = await (await fetch('/api/sessions')).json();
    const sig = JSON.stringify(list.map(s => s.id + s.done));
    if (sig !== lastList) {
      lastList = sig;
      $('sessionSelect').innerHTML = list.map(s =>
        `<option value="${esc(s.id)}">${s.done ? '✓' : '●'} ${esc(s.title)}${s.example ? ' (example)' : ''}</option>`).join('')
        || '<option>No sessions yet</option>';
      if (S.id) $('sessionSelect').value = S.id;
    }
    // jump to a brand-new live session automatically
    const newestLive = list.find(s => !s.done && !s.example);
    if (newestLive && newestLive.id !== S.id && (selectNewest || !S.running)) location.hash = newestLive.id;
    return list;
  }

  // ---------- controls ----------
  $('sessionSelect').onchange = e => { location.hash = e.target.value; };
  $('replayBtn').onclick = () => { if (S.id) load(S.id); };
  $('skipBtn').onclick = () => { S.instant = true; };
  $('speedBtn').onclick = () => {
    S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length];
    $('speedBtn').textContent = S.speed + '×';
  };
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== S.id) load(id); });

  // ---------- boot ----------
  (async function boot() {
    S.roster = await (await fetch('/api/roster')).json();
    S.roster.seats.forEach(s => { S.seatsById[s.id] = s; });
    if (S.roster.disclaimer) $('disclaimer').textContent = S.roster.disclaimer;
    renderTable(S.roster.default_board);
    const list = await refreshList();
    const id = location.hash.slice(1) || (list[0] && list[0].id);
    if (id) load(id);
    else setInterval(() => refreshList(true), 2000);
  })();
})();
