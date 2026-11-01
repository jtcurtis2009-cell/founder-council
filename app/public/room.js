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
    document.querySelectorAll('#phases [data-phase]').forEach(s => {
      const i = order.indexOf(s.dataset.phase);
      s.classList.toggle('active', i === at);
      s.classList.toggle('done', i < at);
      if (i === at) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
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
    if (window.Lip) Lip.bind(ids.map(seat));
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
    $('srLive').textContent = `${who}: ${head || ''}`;
    spotlight(id);
    const words = String(body || '').split(/\s+/).filter(Boolean);
    const ms = words.reduce((t, w) => t + Math.min(55, 18 + w.length * 6), 0) / S.speed;
    if (id && !S.instant && window.Lip) Lip.say(id, body || '', ms);
    try { await typeText($('speechBody'), body || '', gen); }
    finally { if (id && window.Lip) Lip.stop(id); }
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
      log(`<b>${esc(s.name)}</b> · ${esc(e.stance)} ${esc(e.pick)}: ${esc(e.headline)}` +
        ((e.moves || []).length ? `<ul style="margin:4px 0 0;padding-left:16px">${e.moves.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''), s.color);
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
        ${e.allocation ? (() => { const cols = ['#B08D57', '#9DB38A', '#C8A982', '#7FA7A3', '#A99BC0'];
          const ks = Object.keys(e.allocation);
          return `<div class="cols"><div style="grid-column:1/-1"><h3>Where the effort goes</h3>
            <div class="alloc">${ks.map((k, i) => `<span style="width:${Number(e.allocation[k])}%;background:${cols[i % 5]}">${Number(e.allocation[k]) >= 8 ? esc(k) + ' ' + esc(e.allocation[k]) + '%' : ''}</span>`).join('')}</div>
            <div class="alloc-legend">${ks.map((k, i) => `<span><b style="color:${cols[i % 5]}">■ ${esc(k)}</b> ${esc(optLabel(k))} · ${esc(e.allocation[k])}%</span>`).join('')}</div></div></div>`; })() : ''}
        ${(e.roadmap || []).length ? `<div class="cols"><div style="grid-column:1/-1"><h3>Roadmap</h3><div class="roadmap">${e.roadmap.map(m =>
          `<div class="milestone"><div class="when"><b>${esc(m.milestone)}</b><span>${esc(m.by)}</span></div><div>
            <div class="focus">${esc(m.focus)}</div><ul>${(m.moves || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            ${(m.kpis || []).length ? `<div class="kpis">KPIs: ${m.kpis.map(esc).join(' · ')}</div>` : ''}</div></div>`).join('')}</div></div></div>` : ''}
        ${(e.analysis || []).length ? `<div class="cols"><div style="grid-column:1/-1"><h3>Option-by-option analysis</h3><div class="analysis">${e.analysis.map(a =>
          `<div class="item"><b>${esc(a.option)}: ${esc(optLabel(a.option))}</b><span class="pro">▲ ${esc(a.for)}</span><span class="con">▼ ${esc(a.against)}</span></div>`).join('')}</div></div></div>` : ''}
        ${e.risks && e.risks.length ? `<div class="cols"><div style="grid-column:1/-1"><h3>Biggest risks</h3><ul>${e.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div></div>` : ''}
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
    if (window.Lip) Lip.stopAll();
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
        `<option value="${esc(s.id)}">${s.done ? '' : '● Live · '}${esc(s.title)}${s.example ? ' · example' : (s.created ? ' · ' + new Date(s.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')}</option>`).join('')
        || '<option>No sessions yet</option>';
      if (S.id) $('sessionSelect').value = S.id;
    }
    // after "New debate", jump to the session it creates, even if another one is still playing
    if (S.awaitSince) {
      const fresh = list.find(s => !s.example && s.updated >= S.awaitSince - 2000);
      if (fresh) { S.awaitSince = 0; if (fresh.id !== S.id) location.hash = fresh.id; return list; }
    }
    // otherwise jump to a brand-new live session once the current playback is idle
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

  // ---------- new debate ----------
  const dlg = $('askDialog'), form = $('askForm');
  function showAskError(msg) { $('askError').textContent = msg; $('askError').classList.toggle('hidden', !msg); }
  $('newBtn').onclick = () => { showAskError(''); dlg.showModal(); syncMode(); form.question.focus(); };
  $('askCancel').onclick = () => dlg.close();
  const PLAN_Q = 'Build our plan to reach 2,000 units across boutique hotels and short-term rentals.';
  function syncMode() {
    form.options.placeholder = form.mode.value === 'plan'
      ? 'Leave blank: the Chair proposes growth paths (organic, acquisitions, hotels, new markets)'
      : 'Hire a rep at $80k/yr\nSpend $80k on ads\nDo both at half size';
  }
  form.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
    const plan = form.mode.value === 'plan';
    if (plan && !form.question.value.trim()) form.question.value = PLAN_Q;
    if (!plan && form.question.value === PLAN_Q) form.question.value = '';
    form.options.placeholder = plan ? 'Leave blank: the Chair proposes growth paths (organic, acquisitions, hotels, new markets)'
      : 'Hire a rep at $80k/yr\nSpend $80k on ads\nDo both at half size';
  }));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = {
      question: form.question.value, options: form.options.value.split('\n'),
      context: form.context.value, lean: form.lean.value, quick: form.quick.checked, mode: form.mode.value,
    };
    $('askSubmit').disabled = true; showAskError('');
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not start the debate.');
      dlg.close(); form.reset();
      S.awaitSince = Date.now();
      setStatus('live', 'the Chair is convening the council…');
      watchJob();
    } catch (err) { showAskError(err.message); }
    finally { $('askSubmit').disabled = false; }
  });

  let jobTimer = null;
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function showProgress(j) {
    const box = $('progress');
    if (!j || j.status !== 'running') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const quiet = j.quietFor > 4 * 60 * 1000;
    box.classList.toggle('warn', quiet);
    $('progressTitle').textContent = quiet ? 'The Chair has been quiet for a while' : 'The Chair is working';
    $('progressTime').textContent = fmt(Date.now() - j.started);
    $('progressList').innerHTML = (j.activity || []).map(a => `<li>${esc(a.text)}</li>`).join('');
  }
  $('cancelBtn').onclick = async () => {
    if (!confirm('Stop this debate? Anything already logged stays in the room.')) return;
    await fetch('/api/job/cancel', { method: 'POST' });
    toast('Debate cancelled.');
  };
  async function watchJob() {
    clearInterval(jobTimer);
    const tick = async () => {
      let j; try { j = await (await fetch('/api/job')).json(); } catch { return; }
      showProgress(j);
      if (j.status === 'running') {
        if (!S.id || S.done) setStatus('live', 'the Chair is convening the council…');
      } else {
        clearInterval(jobTimer);
        if (j.status === 'failed') {
          showAskError(j.error || 'The debate failed.');
          dlg.showModal();
        }
      }
    };
    tick(); jobTimer = setInterval(() => { tick(); if (S.awaitSince) refreshList(); }, 2000);
  }

  // ---------- company profile + update ----------
  function toast(msg, ms = 4000) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.timer); if (ms) toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
  }
  const cdlg = $('companyDialog'), cform = $('companyForm');
  $('companyBtn').onclick = async () => {
    $('companyError').classList.add('hidden');
    const j = await (await fetch('/api/company')).json();
    cform.text.value = j.text || ''; cdlg.showModal();
  };
  $('companyCancel').onclick = () => cdlg.close();
  cform.addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cform.text.value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('companyError').textContent = j.error || 'Could not save.'; $('companyError').classList.remove('hidden'); return; }
    cdlg.close(); toast('Company profile saved. The next debate will use it.');
  });
  $('updateBtn').onclick = async () => {
    $('updateBtn').disabled = true; toast('Checking for updates…', 0);
    try {
      const r = await fetch('/api/update', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Update failed.');
      if (!j.changed) { toast('You already have the latest version.'); return; }
      toast('Updated! Restarting the room…\n\n' + j.log, 0);
      const wait = async () => { try { await fetch('/api/health'); location.reload(); } catch { setTimeout(wait, 1000); } };
      setTimeout(wait, 2500);
    } catch (e) { toast(e.message, 12000); }
    finally { $('updateBtn').disabled = false; }
  };

  // ---------- faces ----------
  const fdlg = $('facesDialog');
  const KINDS = [['base', 'Main', 'portrait'], ['talk', 'Talking', 'portraitTalk'], ['blink', 'Blink', 'portraitBlink']];
  async function reloadRoster() {
    S.roster = await (await fetch('/api/roster')).json();
    S.roster.seats.forEach(s => { S.seatsById[s.id] = s; });
  }
  function renderFaces() {
    $('facesGrid').innerHTML = S.roster.seats.map(seat => `<div class="face-row">
      <div class="who"><b style="color:${seat.color}">${esc(seat.name)}</b><span>${esc(seat.pillar)}</span></div>
      ${KINDS.map(([kind, label, field]) => {
        const isMain = kind === 'base' && seat[field];
        const m = seat.mouth || { x: 50, y: 55 };
        return `<label class="slot${isMain ? ' has-img' : ''}" data-seat="${esc(seat.id)}" data-kind="${kind}" ${isMain ? 'title="Click on the mouth to set where the lips move"' : ''}>
        ${seat[field] ? `<img src="${esc(seat[field])}?v=${Date.now()}" alt=""><button type="button" class="x" title="Remove">✕</button>` : `${label}<br>drop image`}
        ${isMain ? `<span class="mouth-dot" style="left:${m.x}%;top:${m.y}%"></span><span class="change">click mouth</span>` : ''}
        <input type="file" accept="image/png,image/jpeg,image/webp"></label>`; }).join('')}
    </div>`).join('');
    $('facesGrid').querySelectorAll('.slot').forEach(slot => {
      const upload = async file => {
        if (!file) return;
        const r = await fetch(`/api/portrait?seat=${slot.dataset.seat}&kind=${slot.dataset.kind}`, { method: 'POST', body: file });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(j.error || 'Upload failed.', 6000); return; }
        await reloadRoster(); renderFaces(); refreshTable();
      };
      slot.querySelector('input').onchange = e => upload(e.target.files[0]);
      if (slot.classList.contains('has-img')) slot.addEventListener('click', async e => {
        if (e.target.closest('.x')) return;
        e.preventDefault();  // don't open the file picker; set the mouth position instead
        const r = slot.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
        await fetch(`/api/mouth?seat=${slot.dataset.seat}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`, { method: 'POST' });
        await reloadRoster(); renderFaces(); refreshTable(); toast('Mouth position saved.', 1800);
      });
      slot.ondragover = e => { e.preventDefault(); slot.classList.add('drag'); };
      slot.ondragleave = () => slot.classList.remove('drag');
      slot.ondrop = e => { e.preventDefault(); slot.classList.remove('drag'); upload(e.dataTransfer.files[0]); };
      const x = slot.querySelector('.x');
      if (x) x.onclick = async e => {
        e.preventDefault(); e.stopPropagation();
        await fetch(`/api/portrait?seat=${slot.dataset.seat}&kind=${slot.dataset.kind}`, { method: 'DELETE' });
        await reloadRoster(); renderFaces(); refreshTable();
      };
    });
  }
  function refreshTable() {
    const ids = [...document.querySelectorAll('.seat')].map(el => el.id.replace('seat-', ''));
    const badges = Object.fromEntries(ids.map(id => [id, ($('badge-' + id) || {}).innerHTML || '']));
    renderTable(ids.length ? ids : S.roster.default_board);
    ids.forEach(id => { if ($('badge-' + id)) $('badge-' + id).innerHTML = badges[id]; });
  }
  $('facesBtn').onclick = async () => { await reloadRoster(); renderFaces(); fdlg.showModal(); };
  $('facesClose').onclick = () => fdlg.close();

  // ---------- settings menu ----------
  const menuBtn = $('menuBtn'), menuList = $('menuList');
  const closeMenu = () => { menuList.classList.add('hidden'); menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.onclick = e => {
    e.stopPropagation();
    const open = menuList.classList.contains('hidden');
    menuList.classList.toggle('hidden', !open); menuBtn.setAttribute('aria-expanded', String(open));
    if (open) { const first = menuList.querySelector('button:not(.hidden)'); if (first) first.focus(); }
  };
  menuList.addEventListener('click', closeMenu);
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  if (window.matchMedia('(max-width: 1040px)').matches) $('transcript').open = false;

  // ---------- boot ----------
  (async function boot() {
    S.roster = await (await fetch('/api/roster')).json();
    S.roster.seats.forEach(s => { S.seatsById[s.id] = s; });
    if (S.roster.disclaimer) $('disclaimer').textContent = S.roster.disclaimer;
    if (S.roster.company) $('company').textContent = S.roster.company;
    try { const h = await (await fetch('/api/health')).json(); if (h.ask) $('newBtn').classList.remove('hidden'); if (h.manage) { $('facesBtn').classList.remove('hidden'); $('companyBtn').classList.remove('hidden'); if (h.update !== false) $('updateBtn').classList.remove('hidden'); } else { $('menuBtn').closest('.menu').classList.add('hidden'); } } catch {}
    try { const j = await (await fetch('/api/job')).json(); if (j.status === 'running') watchJob(); } catch {}
    renderTable(S.roster.default_board);
    const list = await refreshList();
    const id = location.hash.slice(1) || (list[0] && list[0].id);
    if (id) load(id);
    else setInterval(() => refreshList(true), 2000);
  })();
})();
