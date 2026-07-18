/**
 * IWL craft kit — the "forged & engraved" material layer.
 *
 * 1. SIGILS: a hand-drawn-style inline-SVG engraving library (ICONS + icon()).
 *    One consistent style: 24x24 viewBox, stroke 1.6, currentColor, round
 *    caps, minimal fills. Reads at 16px and 64px.
 * 2. TEXTURES: runtime canvas-generated tileable 256px surfaces exported as
 *    data-URI CSS custom properties on :root — --tex-parchment, --tex-stone,
 *    --tex-iron, --tex-bronze. Subtle: they read as material, not noise.
 *
 * installCraft() is idempotent and SELF-RUNS on module import (guarded on
 * `document`). It is imported early by index.html (so the boot screen gets
 * its textures + ornament before any scene loads) and again by hud.js /
 * skills.js — the module graph dedupes, the guard makes re-entry a no-op.
 *
 * Shaped-panel primitives (chamfered plaque, tapered blade bar, shield slot)
 * are CSS classes in styles.css built on --clip-plaque / --clip-blade /
 * --clip-shield custom properties; this file only supplies the raster
 * materials and the sigils they are engraved with.
 */

/* ============================ sigil library ============================ */

const dot = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`

/** name -> { vb, b } (viewBox + inner markup). Skill sigils keyed by skill id. */
export const ICONS = {
  /* ---- the 12 battle arts ---- */
  // Shadow Step — one bold war-boot print stepping out of the void
  blink: {
    vb: '0 0 24 24',
    b: '<ellipse cx="10" cy="7.8" rx="3.9" ry="5.4" transform="rotate(-14 10 7.8)"/>' +
      '<ellipse cx="8.7" cy="18.6" rx="2.5" ry="3.1" transform="rotate(-14 8.7 18.6)"/>' +
      '<path d="M17.7 6.4c1.9.8 3.3 2.3 4 4.2M16.3 11.2c1.2.5 2.1 1.4 2.6 2.6M14.9 15.8c.8.3 1.4.9 1.8 1.7"/>',
  },
  // Flaming Spear — forge-fired spearhead, flame licking the shaft
  starfire: {
    vb: '0 0 24 24',
    b: '<path d="M12 2.4 15.7 9.3 12 12.6 8.3 9.3Z"/><path d="M12 4.8v6.4"/><path d="M12 12.6V21"/>' +
      '<path d="M9 14.7c-2.4 1.4-3.3 3.3-2.5 5.6 1.2-.8 2.2-.9 3.3-.6"/>' +
      '<path d="M15 14.7c2.4 1.4 3.3 3.3 2.5 5.6-1.2-.8-2.2-.9-3.3-.6"/>',
  },
  // Grave Chill — grave-cold skull ringed by broken frost arcs
  frostring: {
    vb: '0 0 24 24',
    b: '<path d="M12 4a6 6 0 0 1 6 6c0 1.8-.85 3.3-2.1 4.4v2c0 .9-.75 1.7-1.7 1.7H9.8c-.95 0-1.7-.8-1.7-1.7v-2A6.1 6.1 0 0 1 6 10a6 6 0 0 1 6-6Z"/>' +
      '<ellipse cx="9.8" cy="10.2" rx="1.25" ry="1.4" fill="currentColor" stroke="none"/>' +
      '<ellipse cx="14.2" cy="10.2" rx="1.25" ry="1.4" fill="currentColor" stroke="none"/>' +
      '<path d="M10.5 18.1v-1.6M12 18.1v-1.6M13.5 18.1v-1.6"/>' +
      '<path d="M3.2 8.2c-.6 2.8 0 5.6 1.8 7.9M20.8 8.2c.6 2.8 0 5.6-1.8 7.9"/>' +
      '<path d="M6.8 20.5l1.6-1M17.2 20.5l-1.6-1"/>',
  },
  // Earthbreaker — fist punching DOWN (knuckles at the base), earth split below
  quake: {
    vb: '0 0 24 24',
    b: '<path d="M6 12.6V8.2c0-2.9 2.4-4.8 6-4.8s6 1.9 6 4.8v4.4"/>' +
      '<path d="M6 12.6a1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0 1.5 1.5 0 0 0 3 0" stroke-width="1.5"/>' +
      '<path d="M3 21.8h4.6M16.4 21.8H21"/>' +
      '<path d="M12 15.6l-3 2.6 2.2 1.4-1.6 2.6"/><path d="M12 15.6l2.6 2.2-1.8 1.8.8 2.4"/>',
  },
  // Bloodrush — blood drop with speed strokes
  overdrive: {
    vb: '0 0 24 24',
    b: '<path d="M14.7 3.2c2.7 3.6 4.5 6.3 4.5 9a4.8 4.8 0 0 1-9.6 0c0-2.7 2.4-5.4 5.1-9Z"/>' +
      '<path d="M12.4 12.4c.1 1.2 1 2.1 2.1 2.2"/>' +
      '<path d="M3 7.4h5.2M2.2 11.4h4.2M3 15.4h3.2"/>',
  },
  // Iron Bulwark — riveted tower shield
  aegis: {
    vb: '0 0 24 24',
    b: '<path d="M6.4 3.4h11.2v9.4c0 4-2.4 6.5-5.6 8.2-3.2-1.7-5.6-4.2-5.6-8.2Z"/>' +
      '<path d="M12 3.4V21"/><path d="M6.4 8.4h11.2"/>' +
      dot(8.6, 6, 0.8) + dot(15.4, 6, 0.8),
  },
  // Warrior's Resolve — fist raised skyward (knuckles up), radiance above
  mend: {
    vb: '0 0 24 24',
    b: '<path d="M7 15.2v-4.4M17 15.2v-4.4"/>' +
      '<path d="M7 10.8a1.25 1.25 0 0 1 2.5 0 1.25 1.25 0 0 1 2.5 0 1.25 1.25 0 0 1 2.5 0 1.25 1.25 0 0 1 2.5 0" stroke-width="1.5"/>' +
      '<path d="M7 15.2c0 2.1 1.2 3.6 3.1 4.4h3.8c1.9-.8 3.1-2.3 3.1-4.4"/>' +
      '<path d="M8.6 22.2h6.8"/>' +
      '<path d="M12 1.4v2.8M5.4 3.2l2.1 2.5M18.6 3.2l-2.1 2.5"/>',
  },
  // Phantom Twin — twin war masks
  decoy: {
    vb: '0 0 24 24',
    b: '<path d="M3.4 3.9c2.7-1.1 5.5-1.1 8.2 0v5.5a4.1 4.1 0 0 1-8.2 0Z"/>' +
      '<path d="M5.5 6.9h1.8M8.6 6.9h1.8"/><path d="M6.2 9.9c.8.6 1.9.6 2.7 0"/>' +
      '<path d="M12.4 10.5c2.7-1.1 5.5-1.1 8.2 0V16a4.1 4.1 0 0 1-8.2 0Z"/>' +
      '<path d="M14.5 13.5h1.8M17.6 13.5h1.8"/><path d="M15.2 17.2c.8-.6 1.9-.6 2.7 0"/>',
  },
  // Chained Harrow — heavy chain links into a barbed hook
  gravity: {
    vb: '0 0 24 24',
    b: '<ellipse cx="7" cy="5" rx="2.1" ry="3" transform="rotate(-45 7 5)"/>' +
      '<ellipse cx="11" cy="9" rx="2.1" ry="3" transform="rotate(-45 11 9)"/>' +
      '<path d="M13.6 11.4c3 1 4.8 3.4 4.4 6.1-.5 2.8-3.1 4.7-5.9 4.2-2.3-.4-3.9-2.2-4.1-4.4"/>' +
      '<path d="M8 17.3l-2.5-.6"/><path d="M8 17.3l.3 2.5"/>',
  },
  // Colossus Form — brutalist stone face: heavy brow, monolith nose, flat mouth
  titan: {
    vb: '0 0 24 24',
    b: '<path d="M7 21V6.2c0-1.6 1.3-2.9 2.9-2.9h4.2c1.6 0 2.9 1.3 2.9 2.9V21"/>' +
      '<path d="M8.7 8.6h6.6" stroke-width="2"/>' +
      '<path d="M12 8.6v6" stroke-width="2"/>' +
      '<path d="M10.3 17.8h3.4"/>' +
      '<path d="M4.6 21.4h14.8"/>',
  },
  // Wraith Walk — half-seen burial veil
  ghost: {
    vb: '0 0 24 24',
    b: '<path d="M5.8 19.6v-8.4a6.2 6.2 0 0 1 12.4 0v8.4l-2.48 1.9-2.48-1.9-2.48 1.9-2.48-1.9-2.48 1.9Z"/>' +
      '<path d="M9.7 10.3v2M14.3 10.3v2"/>' +
      '<path d="M9.2 16.6c1.8.9 3.8.9 5.6 0"/>' +
      '<path d="M3.3 9.4c-.9 1.6-1 3.4-.3 5.1"/>',
  },
  // Skyfall Hammer — war maul falling, trail behind
  comet: {
    vb: '0 0 24 24',
    b: '<rect x="3.9" y="11.2" width="9.6" height="6.6" rx="1.1" transform="rotate(-45 8.7 14.5)"/>' +
      '<path d="M11.9 11.3 18 5.2"/><path d="M17 4.2l2 2"/>' +
      '<path d="M15.9 1.9c2.7 1 4.9 3.1 6 5.8M13.2 4.4c1.8.7 3.3 2.1 4.1 3.8"/>',
  },

  /* ---- UI glyphs ---- */
  laurel: {
    vb: '0 0 24 24',
    b: '<path d="M10.8 21c-4.4-1.4-7.3-5-7.3-9.7 0-1.6.3-3 .9-4.4"/>' +
      '<path d="M4.7 11.9c1.5-.4 2.9 0 3.9 1M5.6 15.7c1.5-.1 2.8.5 3.6 1.6M8.2 18.9c1.3.1 2.4.7 3.1 1.5"/>' +
      '<path d="M13.2 21c4.4-1.4 7.3-5 7.3-9.7 0-1.6-.3-3-.9-4.4"/>' +
      '<path d="M19.3 11.9c-1.5-.4-2.9 0-3.9 1M18.4 15.7c-1.5-.1-2.8.5-3.6 1.6M15.8 18.9c-1.3.1-2.4.7-3.1 1.5"/>',
  },
  'crossed-swords': {
    vb: '0 0 24 24',
    b: '<path d="M4.4 4.4 17.3 17.3M19.6 4.4 6.7 17.3"/>' +
      '<path d="M15.1 18.5l3.4-3.4M8.9 18.5 5.5 15.1"/>' +
      dot(19.2, 19.2, 1) + dot(4.8, 19.2, 1),
  },
  skull: {
    vb: '0 0 24 24',
    b: '<path d="M12 3.2a6.8 6.8 0 0 1 6.8 6.8c0 2-1 3.8-2.4 5v2.7c0 1-.8 1.8-1.8 1.8H9.4c-1 0-1.8-.8-1.8-1.8V15a6.9 6.9 0 0 1-2.4-5A6.8 6.8 0 0 1 12 3.2Z"/>' +
      '<ellipse cx="9.5" cy="10.6" rx="1.35" ry="1.5" fill="currentColor" stroke="none"/>' +
      '<ellipse cx="14.5" cy="10.6" rx="1.35" ry="1.5" fill="currentColor" stroke="none"/>' +
      '<path d="M12 12.7l-.9 1.8h1.8Z"/><path d="M10.1 19.5v-1.9M12 19.5v-1.9M13.9 19.5v-1.9"/>',
  },
  hourglass: {
    vb: '0 0 24 24',
    b: '<path d="M6.6 3.4h10.8M6.6 20.6h10.8"/>' +
      '<path d="M7.9 3.4v2.7c0 2.7 4.1 3.6 4.1 5.9 0-2.3 4.1-3.2 4.1-5.9V3.4"/>' +
      '<path d="M7.9 20.6v-2.7c0-2.7 4.1-3.6 4.1-5.9 0 2.3 4.1 3.2 4.1 5.9v2.7"/>' +
      '<path d="M10.7 18.9c.4-.9 2.2-.9 2.6 0Z" fill="currentColor"/>',
  },
  coin: {
    vb: '0 0 24 24',
    b: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="5.7"/>' +
      '<path d="M10.4 9.2h3.2M10.4 14.8h3.2M12 9.2v5.6"/>',
  },
  flame: {
    vb: '0 0 24 24',
    b: '<path d="M12 2.6c1.2 3 4.9 5.1 4.9 8.9a4.9 4.9 0 0 1-9.8 0c0-1.6.6-3 1.6-4.3.5 1.1 1 1.7 2 2.2-.5-2.3.1-4.6 1.3-6.8Z"/>' +
      '<path d="M12 13.4c-.9.6-1.3 1.5-1.1 2.6.9-.1 1.7-.6 2.2-1.2"/>',
  },
  banner: {
    vb: '0 0 24 24',
    b: '<path d="M4.6 3.3h14.8"/>' +
      '<path d="M6.6 3.3h10.8v13.5l-5.4-3.3-5.4 3.3Z"/>' +
      dot(12, 8.4, 1.2),
  },
  gate: {
    vb: '0 0 24 24',
    b: '<path d="M4.8 21V10.8C4.8 6.6 8 3.6 12 3.6s7.2 3 7.2 7.2V21"/>' +
      '<path d="M8.4 21v-9.3M12 21V8M15.6 21v-9.3"/>' +
      '<path d="M4.8 14.7h14.4"/><path d="M3 21.3h18"/>',
  },
  'chariot-wheel': {
    vb: '0 0 24 24',
    b: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="1.9"/>' +
      '<path d="M13.9 12h6.7M10.1 12H3.4M12.95 13.65l3.35 5.8M11.05 13.65l-3.35 5.8M12.95 10.35l3.35-5.8M11.05 10.35 7.7 4.55"/>',
  },
  'court-ring': {
    vb: '0 0 24 24',
    b: '<ellipse cx="12" cy="8.2" rx="7" ry="2.5"/>' +
      '<path d="M5.6 9.6 8 16.8M18.4 9.6 16 16.8M9.2 10.6l5.4 5.8M14.8 10.6 9.4 16.4"/>' +
      '<path d="M8 16.8c2.4 1.3 5.6 1.3 8 0"/>',
  },
  'arrow-up': {
    vb: '0 0 24 24',
    b: '<path d="M12 20.4V5.6"/><path d="M6.8 10.8 12 5.4l5.2 5.4"/><path d="M9.4 18.3l2.6 2 2.6-2"/>',
  },
  'arrow-down': {
    vb: '0 0 24 24',
    b: '<path d="M12 3.6v14.8"/><path d="M6.8 13.2 12 18.6l5.2-5.4"/><path d="M9.4 5.7l2.6-2 2.6 2"/>',
  },
  'ornament-divider': {
    vb: '0 0 96 24',
    b: '<path d="M48 7.6 52.4 12 48 16.4 43.6 12Z"/>' + dot(48, 12, 1.1) +
      '<path d="M43.6 12c-2.4-2.9-5.5-4.4-9.4-4.4M43.6 12c-2.4 2.9-5.5 4.4-9.4 4.4"/>' +
      '<path d="M52.4 12c2.4-2.9 5.5-4.4 9.4-4.4M52.4 12c2.4 2.9 5.5 4.4 9.4 4.4"/>' +
      '<path d="M34.2 12H9.4M61.8 12h24.8"/>' +
      '<path d="M9.4 12c-2.1-.1-3.5-1.2-4.1-3.1M86.6 12c2.1-.1 3.5-1.2 4.1-3.1"/>' +
      dot(4.4, 7.1, 0.9) + dot(91.6, 7.1, 0.9),
  },
  'corner-flourish': {
    vb: '0 0 24 24',
    b: '<path d="M3.4 20.8V9.2c0-3.2 2.6-5.8 5.8-5.8h11.6"/>' +
      '<path d="M6.9 20.8V10.5c0-2 1.6-3.6 3.6-3.6h10.3"/>' +
      dot(3.4, 22.6, 0.9) + dot(22.6, 3.4, 0.9) + '<path d="M8.6 10.4 10.5 8.5"/>',
  },
}

const parseSize = s => {
  const m = String(s).match(/^([\d.]+)(.*)$/)
  return m ? [Number(m[1]), m[2] || ''] : [24, '']
}

/** Render a sigil as an SVG string. size: number (px) or CSS length ('1em'). */
export function icon(name, { size = 24, color } = {}) {
  const def = ICONS[name]
  if (!def) return ''
  const [, , vw, vh] = def.vb.split(' ').map(Number)
  const [n, unit] = parseSize(size)
  const w = `${n}${unit}`, h = `${+(n * vh / vw).toFixed(3)}${unit}`
  const style = `vertical-align:-0.125em${color ? `;color:${color}` : ''}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${def.vb}" width="${w}" height="${h}" ` +
    `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ` +
    `style="${style}" aria-hidden="true">${def.b}</svg>`
}

/* ============================ surface textures ============================ */

const TEX_SIZE = 256

function makeCtx(size = TEX_SIZE) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c.getContext('2d')
}

/** Draw fn at 9 offsets so strokes/blobs wrap — keeps the tile seamless. */
function wrapped(ctx, size, drawOne) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    ctx.save()
    ctx.translate(dx, dy)
    drawOne(ctx)
    ctx.restore()
  }
}

/** Per-pixel monochrome grain (white noise is tileable by nature). */
function addGrain(ctx, size, amp) {
  const img = ctx.getImageData(0, 0, size, size), d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 2 * amp
    d[i] += n; d[i + 1] += n; d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

function blobs(ctx, size, count, colors, [rMin, rMax], [aMin, aMax]) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size
    const r = rMin + Math.random() * (rMax - rMin)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const c = colors[(Math.random() * colors.length) | 0]
    const a = aMin + Math.random() * (aMax - aMin)
    g.addColorStop(0, c.replace('A', a.toFixed(3)))
    g.addColorStop(1, c.replace('A', '0'))
    wrapped(ctx, size, x2 => { x2.fillStyle = g; x2.fillRect(0, 0, size, size) })
  }
}

function strokes(ctx, size, count, opts) {
  const { len = [6, 18], width = [0.5, 1.1], angle = null, colors, alpha = [0.03, 0.07] } = opts
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size
    const l = len[0] + Math.random() * (len[1] - len[0])
    const a = angle == null ? Math.random() * Math.PI : angle[0] + Math.random() * (angle[1] - angle[0])
    const c = colors[(Math.random() * colors.length) | 0]
    ctx.strokeStyle = c
    ctx.globalAlpha = alpha[0] + Math.random() * (alpha[1] - alpha[0])
    ctx.lineWidth = width[0] + Math.random() * (width[1] - width[0])
    wrapped(ctx, size, x2 => {
      x2.beginPath()
      x2.moveTo(x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2)
      x2.lineTo(x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2)
      x2.stroke()
    })
  }
  ctx.globalAlpha = 1
}

/** Full-width horizontal brush lines — the brushed-metal signature. */
function brush(ctx, size, count, light, dark, alpha = [0.02, 0.055]) {
  for (let i = 0; i < count; i++) {
    const y = Math.random() * size
    ctx.strokeStyle = Math.random() < 0.5 ? light : dark
    ctx.globalAlpha = alpha[0] + Math.random() * (alpha[1] - alpha[0])
    ctx.lineWidth = 0.4 + Math.random() * 0.9
    ctx.beginPath()
    ctx.moveTo(-2, y)
    ctx.lineTo(size + 2, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function texParchment() {
  const ctx = makeCtx()
  ctx.fillStyle = '#d3c39c'
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
  blobs(ctx, TEX_SIZE, 22, ['rgba(178,152,106,A)', 'rgba(228,214,176,A)', 'rgba(158,128,84,A)'], [20, 64], [0.04, 0.1])
  strokes(ctx, TEX_SIZE, 150, { colors: ['rgba(120,96,56,1)', 'rgba(244,234,206,1)'], len: [5, 16], alpha: [0.04, 0.08] })
  strokes(ctx, TEX_SIZE, 46, { colors: ['rgba(96,72,40,1)'], len: [1, 2.5], width: [0.6, 1.2], alpha: [0.06, 0.12] })
  addGrain(ctx, TEX_SIZE, 5)
  return ctx.canvas.toDataURL('image/png')
}

function texStone() {
  const ctx = makeCtx()
  ctx.fillStyle = '#2c2823'
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
  blobs(ctx, TEX_SIZE, 16, ['rgba(58,52,44,A)', 'rgba(16,13,10,A)'], [26, 74], [0.05, 0.11])
  // chisel marks: dark cut + offset light lip
  strokes(ctx, TEX_SIZE, 26, { colors: ['rgba(0,0,0,1)'], len: [8, 22], width: [0.8, 1.4], angle: [-0.9, -0.3], alpha: [0.08, 0.15] })
  strokes(ctx, TEX_SIZE, 26, { colors: ['rgba(232,220,196,1)'], len: [7, 18], width: [0.5, 0.9], angle: [-0.9, -0.3], alpha: [0.03, 0.06] })
  addGrain(ctx, TEX_SIZE, 7)
  return ctx.canvas.toDataURL('image/png')
}

function texIron() {
  const ctx = makeCtx()
  ctx.fillStyle = '#33363b'
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
  blobs(ctx, TEX_SIZE, 8, ['rgba(14,16,20,A)', 'rgba(96,102,112,A)'], [30, 80], [0.03, 0.07])
  brush(ctx, TEX_SIZE, 190, 'rgba(150,158,170,1)', 'rgba(8,10,14,1)')
  addGrain(ctx, TEX_SIZE, 4)
  return ctx.canvas.toDataURL('image/png')
}

function texBronze() {
  const ctx = makeCtx()
  ctx.fillStyle = '#7a5528'
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
  blobs(ctx, TEX_SIZE, 10, ['rgba(46,28,10,A)', 'rgba(196,150,86,A)', 'rgba(88,102,74,A)'], [24, 70], [0.03, 0.08])
  brush(ctx, TEX_SIZE, 160, 'rgba(222,176,108,1)', 'rgba(38,20,4,1)')
  addGrain(ctx, TEX_SIZE, 5)
  return ctx.canvas.toDataURL('image/png')
}

/* ============================ install ============================ */

let installed = false

/**
 * Generate the four surface textures once and install them as data-URI
 * custom properties on :root. Also engraves the boot ornament (#bootRule)
 * if the boot screen is still present. Idempotent.
 */
export function installCraft(root = document.documentElement) {
  if (installed) return
  installed = true
  const tex = {
    '--tex-parchment': texParchment(),
    '--tex-stone': texStone(),
    '--tex-iron': texIron(),
    '--tex-bronze': texBronze(),
  }
  for (const [k, v] of Object.entries(tex)) root.style.setProperty(k, `url("${v}")`)
  const bootRule = document.getElementById('bootRule')
  if (bootRule) bootRule.innerHTML = icon('ornament-divider', { size: 300 })
}

if (typeof document !== 'undefined') installCraft()
