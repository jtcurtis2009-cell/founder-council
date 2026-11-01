// Lip: smooth, text-driven talking animation for the room's avatars.
//
// - Mouth shapes ("visemes") come from the words being spoken: wide on a/o, mid on e/i/u,
//   closed on m/b/p, at a natural ~6 syllables per second.
// - A damped spring moves the jaw toward each shape, with ease-in/out and a little overshoot
//   (classic animation principles: no snapping between frames).
// - Portraits are warped on the GPU (WebGL): the lips part, the jaw and chin drop and the
//   cheeks follow with a soft falloff, and a mouth interior (teeth, tongue) appears as it opens.
// - Drawn (SVG) faces and portraits with a "talk" frame use the same spring via CSS --open.
// - The speaking head gets small nods and tilts (secondary motion).
(function () {
  const VS = `attribute vec2 p; varying vec2 uv;
    void main() { uv = vec2((p.x + 1.) * .5, 1. - (p.y + 1.) * .5); gl_Position = vec4(p, 0., 1.); }`;
  const FS = `precision mediump float;
    varying vec2 uv; uniform sampler2D tex; uniform vec2 crop0; uniform vec2 cropS;
    uniform vec2 m; uniform float open; uniform float A; uniform float W;
    float g(float x, float s) { return exp(-x * x / (2. * s * s)); }
    void main() {
      vec2 p = uv; float dx = p.x - m.x;
      float hx = g(dx, W * 1.7);
      float drop = open * A;
      float d = 0.;
      if (p.y > m.y) { float t = p.y - m.y; d = drop * (1. - smoothstep(.09, .27, t)) * hx; }
      else { float t = m.y - p.y; d = -.22 * drop * (1. - smoothstep(0., .05, t)) * hx; }
      vec3 col = texture2D(tex, crop0 + (p - vec2(0., d)) * cropS).rgb;
      // mouth interior between the parted lips
      float top = m.y - .22 * drop, bot = m.y + drop;
      float cy = (top + bot) * .5, hh = max((bot - top) * .5, 1e-4);
      float hw = W * (.78 + .3 * open);
      vec2 q = vec2(dx / hw, (p.y - cy) / hh);
      float r = dot(q, q);
      float inside = (1. - smoothstep(.72, 1., r)) * smoothstep(.0015, .008, bot - top);
      vec3 mouth = mix(vec3(.13, .02, .04), vec3(.55, .16, .2), smoothstep(.15, .95, q.y));
      float teeth = (1. - smoothstep(-.62, -.38, q.y)) * smoothstep(.12, .3, open);
      mouth = mix(mouth, vec3(.95, .93, .88), teeth * .92);
      mouth *= .75 + .25 * (1. - r);
      gl_FragColor = vec4(mix(col, mouth, inside), 1.);
    }`;

  const seats = new Map(); // id -> state
  let raf = 0, last = 0;

  // ---------- visemes from text ----------
  const VOWEL = { a: 1, o: .92, e: .72, i: .6, u: .55, y: .5 };
  function plan(text, durationMs) {
    const keys = []; // {t, v}
    const words = String(text).toLowerCase().replace(/[^a-z\s.,!?;:'-]/g, ' ').split(/\s+/).filter(Boolean);
    let syl = [];
    for (const w of words) {
      const parts = w.match(/[^aeiouy]*[aeiouy]+[^aeiouy]*/g) || [w];
      parts.forEach((s, i) => {
        const v = s.match(/[aeiouy]/); const shut = /^[mbp]/.test(s) || (i === parts.length - 1 && /[mbp]$/.test(s));
        syl.push({ v: v ? VOWEL[v[0]] : .4, shut, end: i === parts.length - 1, pause: /[.,!?;:]$/.test(w) && i === parts.length - 1 });
      });
    }
    if (!syl.length) return keys;
    const natural = 165; // ms per syllable (~6/s)
    const per = Math.max(110, Math.min(natural, durationMs / syl.length));
    const count = Math.min(syl.length, Math.max(1, Math.floor(durationMs / per)));
    let t = 0;
    for (let k = 0; k < count; k++) {
      const s = syl[Math.floor(k * syl.length / count)];
      const jitter = .82 + Math.random() * .22;
      if (s.shut) keys.push({ t, v: 0 });
      keys.push({ t: t + per * .45, v: s.v * jitter });
      keys.push({ t: t + per * .9, v: s.end ? .08 : .25 });
      t += per + (s.pause ? 140 : 0);
    }
    keys.push({ t: t + 60, v: 0 });
    return keys;
  }

  // ---------- WebGL portrait ----------
  function initGL(st) {
    if (st.gl !== undefined) return st.gl;
    const c = document.createElement('canvas');
    c.className = 'lipcanvas';
    const gl = c.getContext('webgl', { premultipliedAlpha: false, antialias: true });
    if (!gl) { st.gl = null; return null; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { st.gl = null; return null; }
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const U = n => gl.getUniformLocation(pr, n);
    st.u = { crop0: U('crop0'), cropS: U('cropS'), m: U('m'), open: U('open'), A: U('A'), W: U('W') };
    st.canvas = c; st.gl = gl; st.ready = false;
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      // match CSS object-fit: cover; object-position: 50% 20%
      const s = Math.min(img.width, img.height);
      gl.uniform2f(st.u.crop0, (img.width - s) * .5 / img.width, (img.height - s) * .2 / img.height);
      gl.uniform2f(st.u.cropS, s / img.width, s / img.height);
      st.ready = true;
    };
    img.src = st.seat.portrait;
    return gl;
  }

  function attachCanvas(st) {
    const host = st.el.querySelector('.avatar.photo');
    if (!host || !st.seat.portrait || st.seat.portraitTalk) return;
    if (!initGL(st)) return;
    if (st.canvas.parentNode !== host) host.appendChild(st.canvas);
  }

  function draw(st) {
    const gl = st.gl; if (!gl || !st.ready) return;
    const c = st.canvas, size = Math.round(c.clientWidth * (window.devicePixelRatio || 1)) || 256;
    if (c.width !== size) { c.width = size; c.height = size; gl.viewport(0, 0, size, size); }
    const m = st.seat.mouth || { x: 50, y: 55 };
    gl.uniform2f(st.u.m, m.x / 100, m.y / 100);
    gl.uniform1f(st.u.open, Math.max(0, st.x));
    gl.uniform1f(st.u.A, .045);
    gl.uniform1f(st.u.W, .065);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- engine ----------
  function tick(now) {
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    let active = false;
    for (const st of seats.values()) {
      const t = now - st.start;
      // target from the viseme plan (linear between keys), 0 when idle
      let target = 0;
      if (st.keys.length && t <= st.keys[st.keys.length - 1].t) {
        let i = st.keys.findIndex(k => k.t > t);
        if (i <= 0) target = st.keys[0].v;
        else { const a = st.keys[i - 1], b = st.keys[i]; target = a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t)); }
      }
      // damped spring: slight overshoot, settles smoothly
      const k = 260, c = 2 * Math.sqrt(k) * .62;
      st.v += (k * (target - st.x) - c * st.v) * dt;
      st.x += st.v * dt;
      if (st.x < -.05) { st.x = -.05; st.v = 0; }
      const o = Math.max(0, Math.min(1.15, st.x));
      st.el.style.setProperty('--open', o.toFixed(3));
      // secondary motion: soft nods and tilts while talking
      const talk = st.talking ? 1 : 0;
      st.head += ((talk) - st.head) * Math.min(1, dt * 4);
      const s = now / 1000;
      const tilt = st.head * (Math.sin(s * 1.7 + st.phase) * 1.6 + Math.sin(s * .9) * .8);
      const nod = st.head * (Math.sin(s * 2.3 + st.phase) * 1.2 + o * 2.2);
      const av = st.el.querySelector('.avatar');
      if (av) av.style.transform = st.head > .01 ? `translateY(${(-nod * .6).toFixed(2)}%) rotate(${tilt.toFixed(2)}deg)` : '';
      if (st.canvas) { st.canvas.style.opacity = (st.head > .01 || o > .01) ? 1 : 0; if (st.head > .01 || o > .01) draw(st); }
      if (st.talking || Math.abs(st.x) > .002 || Math.abs(st.v) > .002 || st.head > .01) active = true;
    }
    raf = active ? requestAnimationFrame(tick) : 0;
    if (!active) last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  window.Lip = {
    // call after the table is (re)rendered
    bind(seatList) {
      for (const st of seats.values()) { if (st.canvas) st.canvas.remove(); }
      seats.clear();
      seatList.forEach((seat, i) => {
        const el = document.getElementById('seat-' + seat.id); if (!el) return;
        const st = { seat, el, x: 0, v: 0, keys: [], start: 0, talking: false, head: 0, phase: i * 1.9 };
        seats.set(seat.id, st);
      });
    },
    say(id, text, durationMs) {
      const st = seats.get(id); if (!st) return;
      attachCanvas(st);
      st.keys = plan(text, durationMs); st.start = performance.now(); st.talking = true; kick();
    },
    stop(id) {
      const st = seats.get(id); if (!st) return;
      st.keys = []; st.talking = false; kick();
    },
    stopAll() { for (const id of seats.keys()) this.stop(id); },
  };
})();
