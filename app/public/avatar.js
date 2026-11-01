// Procedural cartoon avatars: plain SVG with CSS-driven blinking and talking.
// Each seat's look comes from roster.json -> seat.avatar.
(function () {
  function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = v => Math.max(0, Math.min(255, v + amt));
    const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function avatarSVG(seat) {
    const a = seat.avatar || {};
    const skin = a.skin || '#f1c7a5', hair = a.hair || '#3b2a20', shirt = a.shirt || '#1f2937';
    const skinDark = shade(skin, -28), brow = a.style === 'bald' ? shade(hair, -20) : shade(hair, -10);
    const p = [];

    p.push(`<defs><radialGradient id="g-${seat.id}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${shade(skin, 18)}"/><stop offset="1" stop-color="${skin}"/></radialGradient></defs>`);
    // shoulders + neck
    p.push(`<path d="M24 200 Q28 154 100 148 Q172 154 176 200Z" fill="${shirt}"/>`);
    p.push(`<path d="M84 128 h32 v26 q-16 10 -32 0z" fill="${skinDark}"/>`);
    p.push(`<path d="M80 150 L100 170 L120 150" fill="none" stroke="${shade(shirt, 40)}" stroke-width="4"/>`);
    // long hair behind head
    if (a.style === 'cap-long') {
      p.push(`<path d="M50 84 Q40 150 58 166 L80 152 Q66 120 70 88Z" fill="${hair}"/>`);
      p.push(`<path d="M150 84 Q160 150 142 166 L120 152 Q134 120 130 88Z" fill="${hair}"/>`);
    }
    // ears + head
    p.push(`<ellipse cx="54" cy="96" rx="9" ry="13" fill="${skinDark}"/><ellipse cx="146" cy="96" rx="9" ry="13" fill="${skinDark}"/>`);
    p.push(`<ellipse cx="100" cy="92" rx="46" ry="54" fill="url(#g-${seat.id})"/>`);
    // beard
    const jaw = 'M56 98 Q58 152 100 158 Q142 152 144 98 Q138 122 120 126 Q100 118 80 126 Q62 122 56 98Z';
    if (a.beard === 'full') {
      p.push(`<path d="${jaw}" fill="${hair}"/>`);
      p.push(`<path d="M82 120 Q100 110 118 120 Q100 118 82 120Z" fill="${hair}" stroke="${hair}" stroke-width="5"/>`);
    } else if (a.beard === 'stubble') {
      p.push(`<path d="${jaw}" fill="${hair}" opacity=".22"/>`);
    }
    // hair on top
    if (a.style === 'short') {
      p.push(`<path d="M53 92 Q48 38 100 34 Q152 38 147 92 Q142 62 118 56 Q100 64 78 56 Q58 64 53 92Z" fill="${hair}"/>`);
    } else if (a.style === 'side-part') {
      p.push(`<path d="M54 94 Q46 40 100 36 Q154 40 146 94 Q146 68 128 58 Q96 48 74 66 Q60 76 54 94Z" fill="${hair}"/>`);
      p.push(`<path d="M74 66 Q96 46 128 58" fill="none" stroke="${shade(hair, -25)}" stroke-width="2"/>`);
    } else if (a.style === 'bald') {
      p.push(`<path d="M55 104 Q52 84 60 72 L64 76 Q58 88 60 104Z" fill="${hair}" opacity=".7"/>`);
      p.push(`<path d="M145 104 Q148 84 140 72 L136 76 Q142 88 140 104Z" fill="${hair}" opacity=".7"/>`);
      p.push(`<ellipse cx="86" cy="52" rx="16" ry="8" fill="#fff" opacity=".28"/>`);
    }
    if (a.style === 'cap-long') {
      const cap = a.cap || '#3f3f46';
      p.push(`<path d="M52 82 Q52 30 100 28 Q148 30 148 82Z" fill="${cap}"/>`);
      p.push(`<path d="M46 82 Q100 66 154 82 Q100 94 46 82Z" fill="${shade(cap, -25)}"/>`);
      p.push(`<path d="M100 42 L110 58 H90Z" fill="#e5e7eb" opacity=".9"/>`);
    }
    // brows
    p.push(`<path class="brow" d="M70 76 Q82 70 92 76" stroke="${brow}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
    p.push(`<path class="brow" d="M108 76 Q118 70 130 76" stroke="${brow}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
    // eyes (blink group)
    p.push(`<g class="eyes">
      <ellipse cx="82" cy="92" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="118" cy="92" rx="7.5" ry="8.5" fill="#fff"/>
      <circle cx="83" cy="93" r="4.5" fill="#1f2937"/><circle cx="119" cy="93" r="4.5" fill="#1f2937"/>
      <circle cx="85" cy="91" r="1.5" fill="#fff"/><circle cx="121" cy="91" r="1.5" fill="#fff"/></g>`);
    if (a.glasses) {
      p.push(`<g fill="rgba(255,255,255,.08)" stroke="#111827" stroke-width="3">
        <circle cx="82" cy="92" r="13"/><circle cx="118" cy="92" r="13"/>
        <path d="M95 92 H105 M69 90 L56 86 M131 90 L144 86" fill="none"/></g>`);
    }
    // nose
    p.push(`<path d="M100 98 Q95 112 100 115 Q104 115 107 112" fill="none" stroke="${skinDark}" stroke-width="3" stroke-linecap="round"/>`);
    // mouth: closed + open frames
    p.push(`<path class="mouth-closed" d="M87 128 Q100 135 113 128" fill="none" stroke="#7c2d12" stroke-width="3.5" stroke-linecap="round"/>`);
    p.push(`<g class="mouth-open"><ellipse cx="100" cy="130" rx="10" ry="7" fill="#4c0519"/><ellipse cx="100" cy="134" rx="6" ry="3" fill="#e11d48" opacity=".7"/></g>`);

    return `<svg class="avatar" viewBox="0 0 200 200" aria-hidden="true">${p.join('')}</svg>`;
  }

  window.avatarSVG = avatarSVG;
})();
