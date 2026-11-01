// Avatars for the room.
//
// 1. Portrait mode: if app/public/portraits/<id>.(png|jpg|jpeg|webp) exists, the server adds
//    seat.portrait (plus optional <id>-talk.* and <id>-blink.* frames) and we render the image,
//    animated with the talk/blink frames, or with a subtle speaking motion when there are none.
// 2. Drawn mode: a shaded, semi-realistic SVG built from roster.json -> seat.avatar.
(function () {
  function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = v => Math.max(0, Math.min(255, Math.round(v)));
    const f = amt / 100; // -100..100: percent toward black / white
    const mix = v => (f < 0 ? v * (1 + f) : v + (255 - v) * f);
    const r = c(mix(n >> 16)), g = c(mix((n >> 8) & 255)), b = c(mix(n & 255));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  const esc = s => String(s).replace(/"/g, '&quot;');

  function portraitHTML(seat) {
    return `<div class="avatar photo${seat.portraitTalk ? ' has-talk' : ''}">
      <img class="base" src="${esc(seat.portrait)}" alt="" draggable="false">
      ${seat.portraitTalk ? `<img class="talk" src="${esc(seat.portraitTalk)}" alt="" draggable="false">` : ''}
      ${seat.portraitBlink ? `<img class="blinkf" src="${esc(seat.portraitBlink)}" alt="" draggable="false">` : ''}
    </div>`;
  }

  function drawnSVG(seat) {
    const a = seat.avatar || {};
    const id = 'av-' + seat.id;
    const skin = a.skin || '#f1c7a5', hair = a.hair || '#3b2a20', shirt = a.shirt || '#1f2937';
    const iris = a.eyes || '#5b4636';
    const skinLo = shade(skin, -18), skinLo2 = shade(skin, -32), skinHi = shade(skin, 22);
    const hairHi = shade(hair, 25), hairLo = shade(hair, -30);
    const brow = a.style === 'bald' ? shade(hair, -15) : (a.brow || shade(hair, -12));
    const lip = a.lip || '#b4645a';
    const cap = a.cap || '#3f3f46';
    const p = [];

    p.push(`<defs>
      <radialGradient id="${id}-face" cx="42%" cy="34%" r="72%">
        <stop offset="0" stop-color="${skinHi}"/><stop offset=".55" stop-color="${skin}"/><stop offset="1" stop-color="${skinLo}"/></radialGradient>
      <linearGradient id="${id}-neck" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${skinLo2}"/><stop offset=".6" stop-color="${skinLo}"/></linearGradient>
      <linearGradient id="${id}-hair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hairHi}"/><stop offset="1" stop-color="${hairLo}"/></linearGradient>
      <linearGradient id="${id}-shirt" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${shade(shirt, 18)}"/><stop offset="1" stop-color="${shade(shirt, -25)}"/></linearGradient>
      <radialGradient id="${id}-iris" cx="45%" cy="40%" r="60%">
        <stop offset="0" stop-color="${shade(iris, 35)}"/><stop offset="1" stop-color="${shade(iris, -30)}"/></radialGradient>
      <radialGradient id="${id}-blush" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#e2786b" stop-opacity=".35"/><stop offset="1" stop-color="#e2786b" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}-cap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${shade(cap, 15)}"/><stop offset="1" stop-color="${shade(cap, -25)}"/></linearGradient>
    </defs>`);

    // body
    p.push(`<path d="M18 200 Q22 152 100 144 Q178 152 182 200Z" fill="url(#${id}-shirt)"/>`);
    if (a.pattern === 'plaid') {
      p.push(`<g stroke="${shade(shirt, 35)}" stroke-width="3" opacity=".45">
        <path d="M40 160 V200 M64 150 V200 M136 150 V200 M160 160 V200"/><path d="M24 172 H176 M20 188 H180"/></g>`);
      p.push(`<path d="M82 150 Q100 160 118 150 L114 200 H86Z" fill="${a.tee || '#e7e2d6'}"/>`);
    }
    p.push(`<path d="M83 124 h34 v26 q-17 12 -34 0z" fill="url(#${id}-neck)"/>`);
    if (a.collar) {
      p.push(`<path d="M74 150 L100 178 L90 152Z M126 150 L100 178 L110 152Z" fill="${a.collar}"/>`);
      if (a.tie) p.push(`<path d="M96 160 L104 160 L108 196 L100 200 L92 196Z" fill="${a.tie}"/>`);
    } else if (a.pattern !== 'plaid') {
      p.push(`<path d="M80 148 Q100 168 120 148" fill="${skinLo2}" stroke="${shade(shirt, 30)}" stroke-width="3"/>`);
    }

    // long hair behind the head
    if (a.style === 'cap-long') {
      p.push(`<path d="M52 70 Q34 140 50 168 Q62 172 80 156 Q66 122 64 76Z" fill="url(#${id}-hair)"/>`);
      p.push(`<path d="M148 70 Q166 140 150 168 Q138 172 120 156 Q134 122 136 76Z" fill="url(#${id}-hair)"/>`);
      p.push(`<g stroke="${hairHi}" stroke-width="1.2" opacity=".35" fill="none"><path d="M48 110 q-2 24 6 46"/><path d="M152 110 q2 24 -6 46"/></g>`);
    }

    // ears
    p.push(`<ellipse cx="55" cy="97" rx="9" ry="13" fill="${skinLo}"/><path d="M57 90 q-5 7 0 14" stroke="${skinLo2}" stroke-width="2" fill="none"/>`);
    p.push(`<ellipse cx="145" cy="97" rx="9" ry="13" fill="${skinLo}"/><path d="M143 90 q5 7 0 14" stroke="${skinLo2}" stroke-width="2" fill="none"/>`);

    // head
    p.push(`<path d="M54 90 Q54 38 100 38 Q146 38 146 90 Q146 128 124 142 Q112 150 100 150 Q88 150 76 142 Q54 128 54 90Z" fill="url(#${id}-face)"/>`);
    p.push(`<path d="M64 124 Q80 148 100 150 Q120 148 136 124 Q122 142 100 144 Q78 142 64 124Z" fill="${skinLo2}" opacity=".35"/>`);
    p.push(`<ellipse cx="72" cy="114" rx="13" ry="9" fill="url(#${id}-blush)"/><ellipse cx="128" cy="114" rx="13" ry="9" fill="url(#${id}-blush)"/>`);
    if (a.age === 'senior') {
      p.push(`<g stroke="${skinLo2}" stroke-width="1.4" fill="none" opacity=".55" stroke-linecap="round">
        <path d="M78 60 q22 -5 44 0"/><path d="M82 66 q18 -4 36 0"/>
        <path d="M84 116 q-4 10 0 18"/><path d="M116 116 q4 10 0 18"/>
        <path d="M64 96 l-5 -3 M64 100 l-6 0 M136 96 l5 -3 M136 100 l6 0"/></g>`);
    } else if (a.age === 'mid') {
      p.push(`<g stroke="${skinLo2}" stroke-width="1.2" fill="none" opacity=".35" stroke-linecap="round"><path d="M86 116 q-3 8 0 14"/><path d="M114 116 q3 8 0 14"/></g>`);
    }

    // beard
    const jaw = 'M56 96 Q56 150 100 158 Q144 150 144 96 Q140 120 124 126 Q100 116 76 126 Q60 120 56 96Z';
    if (a.beard === 'full') {
      p.push(`<path d="${jaw}" fill="url(#${id}-hair)"/>`);
      p.push(`<g stroke="${hairHi}" stroke-width="1" opacity=".35" fill="none">
        <path d="M70 128 q4 12 10 18"/><path d="M84 134 q2 10 6 16"/><path d="M116 134 q-2 10 -6 16"/><path d="M130 128 q-4 12 -10 18"/></g>`);
      p.push(`<path d="M80 121 Q90 112 100 117 Q110 112 120 121 Q110 119 100 122 Q90 119 80 121Z" fill="${hairLo}"/>`);
    } else if (a.beard === 'stubble') {
      p.push(`<path d="${jaw}" fill="${hair}" opacity=".2"/><path d="M84 120 Q100 114 116 120" stroke="${hair}" stroke-width="5" opacity=".18" fill="none"/>`);
    }

    // hair on top
    if (a.style === 'short') {
      p.push(`<path d="M52 94 Q46 34 100 32 Q154 34 148 94 Q146 66 128 56 Q112 64 96 56 Q80 64 70 58 Q56 68 52 94Z" fill="url(#${id}-hair)"/>`);
      p.push(`<g stroke="${hairHi}" stroke-width="1.2" opacity=".45" fill="none"><path d="M70 44 q10 -6 22 -6"/><path d="M104 38 q14 0 24 8"/><path d="M84 52 q8 -6 18 -6"/></g>`);
    } else if (a.style === 'side-part') {
      p.push(`<path d="M53 96 Q44 38 100 34 Q156 38 147 96 Q146 70 130 58 Q98 46 74 64 Q60 76 53 96Z" fill="url(#${id}-hair)"/>`);
      p.push(`<path d="M74 64 Q96 44 130 58" fill="none" stroke="${hairLo}" stroke-width="2"/>`);
      p.push(`<g stroke="${hairLo}" stroke-width="1" opacity=".4" fill="none"><path d="M84 48 q20 -6 40 4"/><path d="M62 70 q4 -14 14 -22"/></g>`);
    } else if (a.style === 'bald') {
      p.push(`<path d="M55 106 Q51 84 60 70 L66 74 Q58 88 60 106Z" fill="${hair}" opacity=".75"/>`);
      p.push(`<path d="M145 106 Q149 84 140 70 L134 74 Q142 88 140 106Z" fill="${hair}" opacity=".75"/>`);
      p.push(`<ellipse cx="88" cy="52" rx="20" ry="9" fill="#fff" opacity=".35"/><ellipse cx="84" cy="50" rx="8" ry="3" fill="#fff" opacity=".45"/>`);
    }
    if (a.style === 'cap-long') {
      // backwards cap: dome sits high on the forehead, strap opening + band at the front
      p.push(`<path d="M50 72 Q50 24 100 22 Q150 24 150 72Z" fill="url(#${id}-cap)"/>`);
      p.push(`<path d="M50 72 Q100 63 150 72" stroke="${shade(cap, -35)}" stroke-width="5" fill="none"/>`);
      p.push(`<path d="M86 60 Q100 52 114 60 L112 68 Q100 64 88 68Z" fill="${hair}"/>`);
      p.push(`<path d="M86 56 H114" stroke="${shade(cap, 30)}" stroke-width="2" stroke-dasharray="3 2"/>`);
      p.push(`<circle cx="100" cy="24" r="3" fill="${shade(cap, -20)}"/>`);
    }

    // brows
    const bw = a.browWeight || 4.5;
    p.push(`<path class="brow" d="M68 77 Q80 70 93 75" stroke="${brow}" stroke-width="${bw}" fill="none" stroke-linecap="round"/>`);
    p.push(`<path class="brow" d="M107 75 Q120 70 132 77" stroke="${brow}" stroke-width="${bw}" fill="none" stroke-linecap="round"/>`);

    // eyes
    p.push(`<ellipse cx="81" cy="92" rx="11" ry="8" fill="${skinLo}" opacity=".45"/><ellipse cx="119" cy="92" rx="11" ry="8" fill="${skinLo}" opacity=".45"/>`);
    p.push(`<g class="eyes">
      <path d="M71 92 Q81 84 91 92 Q81 98 71 92Z" fill="#fbfaf7"/><path d="M109 92 Q119 84 129 92 Q119 98 109 92Z" fill="#fbfaf7"/>
      <circle cx="81.5" cy="91.5" r="4.6" fill="url(#${id}-iris)"/><circle cx="119.5" cy="91.5" r="4.6" fill="url(#${id}-iris)"/>
      <circle cx="81.5" cy="91.5" r="2.1" fill="#111"/><circle cx="119.5" cy="91.5" r="2.1" fill="#111"/>
      <circle cx="83" cy="90" r="1.2" fill="#fff"/><circle cx="121" cy="90" r="1.2" fill="#fff"/>
      <path d="M70 92 Q81 82 92 91" stroke="#2a1d17" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M108 91 Q119 82 130 92" stroke="#2a1d17" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M73 95 Q81 99 89 95" stroke="${skinLo2}" stroke-width="1" fill="none" opacity=".6"/>
      <path d="M111 95 Q119 99 127 95" stroke="${skinLo2}" stroke-width="1" fill="none" opacity=".6"/></g>`);
    if (a.glasses) {
      p.push(`<g fill="rgba(255,255,255,.07)" stroke="${a.glassesColor || '#1f2937'}" stroke-width="3.2">
        <rect x="67" y="81" width="28" height="22" rx="9"/><rect x="105" y="81" width="28" height="22" rx="9"/>
        <path d="M95 90 Q100 87 105 90 M67 88 L55 85 M133 88 L145 85" fill="none"/></g>
        <path d="M71 85 l6 0" stroke="#fff" stroke-width="2" opacity=".5"/><path d="M109 85 l6 0" stroke="#fff" stroke-width="2" opacity=".5"/>`);
    }

    // nose
    p.push(`<path d="M97 92 Q95 104 92 110" stroke="${skinLo2}" stroke-width="1.6" fill="none" opacity=".55"/>`);
    p.push(`<path d="M92 110 Q100 117 108 110 Q104 114 100 114 Q96 114 92 110Z" fill="${skinLo2}" opacity=".5"/>`);
    p.push(`<ellipse cx="101" cy="106" rx="4" ry="3" fill="${skinHi}" opacity=".6"/>`);
    p.push(`<ellipse cx="95.5" cy="112" rx="2.2" ry="1.3" fill="${shade(skin, -50)}" opacity=".6"/><ellipse cx="104.5" cy="112" rx="2.2" ry="1.3" fill="${shade(skin, -50)}" opacity=".6"/>`);

    // mouth: closed (lips) and open frames
    p.push(`<g class="mouth-closed">
      <path d="M86 128 Q93 124 100 126 Q107 124 114 128 Q100 130 86 128Z" fill="${shade(lip, -12)}"/>
      <path d="M86 128 Q100 138 114 128 Q100 132 86 128Z" fill="${lip}"/>
      <path d="M86 128 Q100 131 114 128" stroke="${shade(lip, -45)}" stroke-width="1.3" fill="none"/>
      <ellipse cx="100" cy="132" rx="5" ry="1.4" fill="#fff" opacity=".25"/></g>`);
    p.push(`<g class="mouth-open">
      <path d="M86 127 Q100 122 114 127 Q112 140 100 141 Q88 140 86 127Z" fill="#3b0a10"/>
      <path d="M89 128 Q100 125 111 128 L110 131 Q100 129 90 131Z" fill="#f4f1ea"/>
      <ellipse cx="100" cy="137" rx="7" ry="3" fill="#c2414b" opacity=".85"/>
      <path d="M86 127 Q100 122 114 127" stroke="${shade(lip, -10)}" stroke-width="2.4" fill="none"/>
      <path d="M88 136 Q100 144 112 136" stroke="${lip}" stroke-width="2.4" fill="none"/></g>`);

    return `<svg class="avatar" viewBox="0 0 200 200" aria-hidden="true">${p.join('')}</svg>`;
  }

  window.avatarSVG = seat => (seat && seat.portrait ? portraitHTML(seat) : drawnSVG(seat || {}));
})();
