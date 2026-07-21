const NOTE = m => 440 * Math.pow(2, (m - 69) / 12)
const VOL_KEY = 'ipl-audio-v1'

/**
 * Per-theme music data: [bass root + chord tones] per bar.
 * IWL retheme: every theme sits in low minor/phrygian registers — ominous
 * pads, brooding arps, war-drum weight. Same keys, same engine.
 */
const THEMES = {
  hub: { // war camp at night — slow, smoldering
    bpm: 72, pad: 'sine', bass: 'sine', arp: 'triangle', drums: false, arpDiv: 2,
    prog: [[26, 50, 53, 57, 62], [22, 46, 53, 58, 62], [31, 55, 58, 62], [33, 57, 60, 64]],
  },
  battle: { // war rift — E phrygian menace
    bpm: 126, pad: 'sawtooth', bass: 'sawtooth', arp: 'triangle', drums: true, arpDiv: 2,
    prog: [[28, 52, 55, 59], [24, 48, 51, 55], [29, 53, 57, 60], [23, 47, 51, 54]],
  },
  court: { // blood court — grim swung G-minor groove
    bpm: 96, pad: 'triangle', bass: 'sine', arp: 'triangle', drums: true, arpDiv: 2, swing: 0.14,
    prog: [[31, 55, 58, 62], [24, 48, 51, 55], [27, 51, 55, 58], [26, 50, 54, 57]],
  },
  arena: { // the pit — relentless D phrygian
    bpm: 138, pad: 'sawtooth', bass: 'sawtooth', arp: 'sawtooth', drums: true, arpDiv: 4,
    prog: [[26, 50, 53, 57], [27, 51, 55, 58], [26, 50, 53, 57], [24, 48, 51, 55]],
  },
  race: { // war chariots — galloping E minor
    bpm: 148, pad: 'triangle', bass: 'sawtooth', arp: 'triangle', drums: true, arpDiv: 4,
    prog: [[28, 52, 55, 59], [24, 48, 52, 55], [26, 50, 54, 57], [23, 47, 50, 54]],
  },
  brawl: { // mortal arena — heavy A minor with a cruel V
    bpm: 132, pad: 'sawtooth', bass: 'sawtooth', arp: 'triangle', drums: true, arpDiv: 4,
    prog: [[33, 57, 60, 64], [29, 53, 57, 60], [26, 50, 53, 57], [28, 52, 56, 59]],
  },
  siege: { // last bastion — C minor doom march
    bpm: 108, pad: 'sawtooth', bass: 'sine', arp: 'triangle', drums: true, arpDiv: 2,
    prog: [[24, 48, 51, 55], [32, 51, 56, 60], [22, 46, 53, 58], [31, 55, 59, 62]],
  },
  duel: { // the crucible — E phrygian death-drum ritual
    bpm: 96, pad: 'sawtooth', bass: 'sine', arp: 'triangle', drums: true, arpDiv: 2,
    prog: [[28, 52, 53, 59], [26, 50, 53, 57], [28, 52, 55, 59], [24, 48, 51, 56]],
  },
}

/**
 * Looping ambience beds. Each is a filtered looped-noise source with slow
 * LFOs breathing the filter/gain, plus an optional scheduler of random
 * one-shot "pops" (fire crackle, lava bubbles, forge clinks).
 */
const BEDS = {
  wind: { // open-air gusts over stone
    filter: { type: 'bandpass', f: 320, q: 0.55 }, gain: 0.15,
    lfo: { rate: 0.06, depth: 130, target: 'f' }, lfo2: { rate: 0.041, depth: 0.055, target: 'gain' },
  },
  windLow: { // sheltered air — chasm, arena bowl
    filter: { type: 'bandpass', f: 190, q: 0.7 }, gain: 0.1,
    lfo: { rate: 0.05, depth: 70, target: 'f' },
  },
  fire: { // torch/brazier crackle bed
    filter: { type: 'lowpass', f: 900, q: 0.4 }, gain: 0.055,
    lfo: { rate: 0.35, depth: 240, target: 'f' },
    pops: { every: [0.08, 0.5], kind: 'crackle' },
  },
  fireLow: { // distant fires
    filter: { type: 'lowpass', f: 520, q: 0.4 }, gain: 0.035,
    pops: { every: [0.2, 0.9], kind: 'crackle', vol: 0.4 },
  },
  lava: { // deep molten rumble + bubble pops
    filter: { type: 'lowpass', f: 130, q: 0.8 }, gain: 0.22,
    lfo: { rate: 0.09, depth: 46, target: 'f' }, lfo2: { rate: 0.055, depth: 0.06, target: 'gain' },
    pops: { every: [0.3, 1.4], kind: 'bubble' },
  },
  crowd: { // colosseum murmur with slow swells
    filter: { type: 'bandpass', f: 520, q: 0.45 }, gain: 0.075,
    lfo: { rate: 0.11, depth: 90, target: 'f' }, lfo2: { rate: 0.037, depth: 0.028, target: 'gain' },
    pops: { every: [0.6, 2.4], kind: 'murmur' },
  },
  forge: { // bellows heave + far-off hammerfall
    filter: { type: 'lowpass', f: 700, q: 0.5 }, gain: 0.05,
    lfo: { rate: 0.16, depth: 330, target: 'f' }, lfo2: { rate: 0.16, depth: 0.03, target: 'gain' },
    pops: { every: [1.6, 4.5], kind: 'clink' },
  },
}

/** Scene ambience presets — composites of beds. */
const SCENE_AMBIENCE = {
  hub: ['wind', 'fire'],
  forge: ['fire', 'forge'],
  rift: ['wind'],
  court: ['crowd'],
  pit: ['lava', 'windLow'],
  race: ['wind'],
  chasm: ['lava', 'windLow'],
  gate: ['wind', 'fireLow'],
  crucible: ['crowd', 'fireLow'],
}

/** Per-SFX variation: rate = ±pitch multiplier jitter, vol = ±volume jitter. */
const JITTER = {
  hit: { rate: 0.08, vol: 0.2 }, explode: { rate: 0.06, vol: 0.15 }, bounce: { rate: 0.1, vol: 0.15 },
  zap: { rate: 0.07, vol: 0.12 }, dash: { rate: 0.05, vol: 0.12 }, cast: { rate: 0.05, vol: 0.1 },
  swish: { rate: 0.06, vol: 0.12 }, rim: { rate: 0.08, vol: 0.15 }, spawn: { rate: 0.06, vol: 0.12 },
  kill: { rate: 0.05, vol: 0.1 }, coin: { rate: 0.04, vol: 0.1 }, hover: { rate: 0.03, vol: 0.1 },
  click: { rate: 0.04, vol: 0.08 },
}

/** Big moments pull the music down (sidechain-style). */
const DUCK = {
  victory: 0.6, defeat: 0.6, buzzer: 0.45, tower: 0.4, kill: 0.3,
  go: 0.28, levelup: 0.3, crowd: 0.22,
}

const DEFAULT_VOLUMES = { master: 0.85, music: 0.3, sfx: 0.55, amb: 0.6 }

/**
 * Fully procedural WebAudio synth — SFX + looping theme music + ambience beds.
 * Call unlock() from a user gesture before anything will sound.
 *
 * Graph: sfx/music/amb buses → master → compressor → destination.
 * Music rides a sidechain-style duck gain; ambience is looped noise beds
 * (wind/fire/lava/crowd/forge) crossfaded per scene; a speed-tracked engine
 * loop exists for the chariot race. Volumes persist to localStorage.
 */
export class GameAudio {
  constructor() {
    this.ctx = null
    this.enabled = true
    this._theme = null
    this._pendingTheme = null
    this._timer = null
    this._nextBar = 0
    this._barIdx = 0
    this._amb = new Map()       // bedName -> bed handle
    this._ambName = null
    this._pendingAmb = null
    this._engine = null
    this.volumes = this._loadVolumes()
  }

  _loadVolumes() {
    try {
      const v = JSON.parse(localStorage.getItem(VOL_KEY) || '{}')
      return { ...DEFAULT_VOLUMES, ...v }
    } catch { return { ...DEFAULT_VOLUMES } }
  }

  unlock() {
    if (!this.enabled) return
    if (this.ctx) { this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) { this.enabled = false; return }
    this.ctx = new AC()
    const V = this.volumes

    // Limiter: stacked SFX can't clip the mix
    this.comp = this.ctx.createDynamicsCompressor()
    this.comp.threshold.value = -14
    this.comp.knee.value = 22
    this.comp.ratio.value = 9
    this.comp.attack.value = 0.004
    this.comp.release.value = 0.18

    this.master = this.ctx.createGain()
    this.master.gain.value = V.master
    this.master.connect(this.comp)
    this.comp.connect(this.ctx.destination)

    this.sfxBus = this.ctx.createGain()
    this.sfxBus.gain.value = V.sfx
    this.sfxBus.connect(this.master)

    // musicBus (user volume) → musicDuck (sidechain) → master
    this.musicDuck = this.ctx.createGain()
    this.musicDuck.gain.value = 1
    this.musicDuck.connect(this.master)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = V.music
    this.musicBus.connect(this.musicDuck)

    this.ambBus = this.ctx.createGain()
    this.ambBus.gain.value = V.amb
    this.ambBus.connect(this.master)

    // Simple generated-impulse reverb send for spaciousness
    const verb = this.ctx.createConvolver()
    const len = Math.floor(this.ctx.sampleRate * 1.4)
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    verb.buffer = buf
    const wet = this.ctx.createGain()
    wet.gain.value = 0.22
    this.sfxBus.connect(verb)
    this.musicBus.connect(verb)
    this.ambBus.connect(verb)
    verb.connect(wet)
    wet.connect(this.master)

    // Shared 2s white-noise loop for all ambience beds
    const nlen = Math.floor(this.ctx.sampleRate * 2)
    this._noiseBuf = this.ctx.createBuffer(1, nlen, this.ctx.sampleRate)
    const nd = this._noiseBuf.getChannelData(0)
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1

    if (this._pendingTheme) {
      const t = this._pendingTheme
      this._pendingTheme = null
      this.music(t)
    }
    if (this._pendingAmb) {
      const a = this._pendingAmb
      this._pendingAmb = null
      this.ambience(a)
    }
  }

  /** One enveloped oscillator. */
  _osc({ f = 440, f2, type = 'sine', t, dur = 0.15, vol = 0.35, attack = 0.005, bus, detune = 0 } = {}) {
    const c = this.ctx
    t = t ?? c.currentTime
    const o = c.createOscillator()
    o.type = type
    o.detune.value = detune
    o.frequency.setValueAtTime(f, t)
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(bus || this.sfxBus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  /** Filtered noise burst. */
  _noise({ t, dur = 0.2, vol = 0.3, filter = 2000, filter2, type = 'lowpass', Q = 1, bus, attack = 0.003 } = {}) {
    const c = this.ctx
    t = t ?? c.currentTime
    const len = Math.max(1, Math.floor(c.sampleRate * dur))
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    const fl = c.createBiquadFilter()
    fl.type = type
    fl.Q.value = Q
    fl.frequency.setValueAtTime(filter, t)
    if (filter2) fl.frequency.exponentialRampToValueAtTime(Math.max(filter2, 1), t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(fl); fl.connect(g); g.connect(bus || this.sfxBus)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  /**
   * Fire a named sound effect.
   * opts: delay (s), vol (0..1), pan (-1..1 stereo), rate (pitch multiplier).
   * Named SFX carry built-in variation so repeats never machine-gun.
   */
  play(name, { delay = 0, vol = 1, pan = 0, rate = 1 } = {}) {
    if (!this.ctx || !this.enabled) return
    const j = JITTER[name]
    if (j) {
      rate *= 1 + (Math.random() * 2 - 1) * j.rate
      vol *= 1 + (Math.random() * 2 - 1) * j.vol
    }
    let bus = this.sfxBus
    if (pan) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      p.connect(this.sfxBus)
      bus = p
    }
    const t = this.ctx.currentTime + delay
    const R = v => v * rate
    const O = o => this._osc({ ...o, f: R(o.f ?? 440), f2: o.f2 ? R(o.f2) : undefined, t: t + (o.delay || 0), vol: (o.vol ?? 0.35) * vol, bus })
    const N = o => this._noise({ ...o, filter: R(o.filter ?? 2000), filter2: o.filter2 ? R(o.filter2) : undefined, t: t + (o.delay || 0), vol: (o.vol ?? 0.3) * vol, bus })
    switch (name) {
      case 'click': O({ f: 740, f2: 1180, type: 'triangle', dur: 0.07, vol: 0.22 }); break
      case 'hover': O({ f: 520, type: 'sine', dur: 0.05, vol: 0.1 }); break
      case 'back': O({ f: 600, f2: 320, type: 'triangle', dur: 0.1, vol: 0.2 }); break
      case 'cast': O({ f: 300, f2: 900, type: 'sawtooth', dur: 0.18, vol: 0.16 }); N({ dur: 0.2, filter: 1200, filter2: 5200, type: 'bandpass', vol: 0.2 }); break
      case 'dash': N({ dur: 0.28, filter: 500, filter2: 3800, type: 'bandpass', Q: 2, vol: 0.3 }); break
      case 'zap': O({ f: 1400, f2: 240, type: 'square', dur: 0.09, vol: 0.16 }); N({ dur: 0.06, filter: 6000, type: 'highpass', vol: 0.12 }); break
      case 'hit': O({ f: 340, f2: 120, type: 'square', dur: 0.09, vol: 0.2 }); N({ dur: 0.08, filter: 2400, vol: 0.18 }); break
      case 'explode': N({ dur: 0.6, filter: 900, filter2: 90, vol: 0.5 }); O({ f: 160, f2: 36, type: 'sine', dur: 0.5, vol: 0.5 }); break
      case 'heal': O({ f: NOTE(72), dur: 0.14, vol: 0.14 }); O({ f: NOTE(76), dur: 0.14, delay: 0.09, vol: 0.14 }); O({ f: NOTE(79), dur: 0.2, delay: 0.18, vol: 0.14 }); break
      case 'shield': O({ f: 220, type: 'triangle', dur: 0.4, vol: 0.16 }); O({ f: 331, type: 'triangle', dur: 0.4, vol: 0.12 }); break
      case 'coin': O({ f: NOTE(83), type: 'square', dur: 0.06, vol: 0.09 }); O({ f: NOTE(88), type: 'square', dur: 0.12, delay: 0.06, vol: 0.09 }); break
      case 'levelup': [64, 68, 71, 76].forEach((m, i) => O({ f: NOTE(m), type: 'triangle', dur: 0.16, delay: i * 0.07, vol: 0.16 })); break
      case 'kill': O({ f: 520, f2: 90, type: 'sawtooth', dur: 0.35, vol: 0.2 }); N({ dur: 0.3, filter: 1800, filter2: 200, vol: 0.25 }); break
      case 'tower': O({ f: 90, f2: 30, type: 'sine', dur: 0.8, vol: 0.5 }); N({ dur: 0.7, filter: 600, filter2: 60, vol: 0.4 }); O({ f: 880, type: 'square', dur: 0.1, delay: 0.1, vol: 0.08 }); break
      case 'bounce': O({ f: 190, f2: 100, type: 'sine', dur: 0.09, vol: 0.3 }); break
      case 'swish': N({ dur: 0.3, filter: 5200, filter2: 1400, type: 'bandpass', Q: 0.8, vol: 0.32 }); break
      case 'rim': O({ f: 320, f2: 250, type: 'triangle', dur: 0.14, vol: 0.25 }); N({ dur: 0.04, filter: 4000, type: 'highpass', vol: 0.1 }); break
      case 'buzzer': O({ f: 196, type: 'square', dur: 0.7, vol: 0.25 }); O({ f: 198, type: 'square', dur: 0.7, vol: 0.25 }); break
      case 'whistle': O({ f: 2200, type: 'square', dur: 0.32, vol: 0.08 }); break
      case 'crowd': N({ dur: 1.6, filter: 700, filter2: 1400, vol: 0.28, attack: 0.25 }); break
      case 'countdown': O({ f: 660, type: 'square', dur: 0.09, vol: 0.14 }); break
      case 'go': O({ f: 660, f2: 990, type: 'square', dur: 0.22, vol: 0.18 }); break
      case 'victory': [60, 64, 67, 72, 76].forEach((m, i) => O({ f: NOTE(m), type: 'triangle', dur: 0.3, delay: i * 0.11, vol: 0.2 })); break
      case 'defeat': [64, 62, 60, 55].forEach((m, i) => O({ f: NOTE(m), type: 'sawtooth', dur: 0.4, delay: i * 0.18, vol: 0.12 })); break
      case 'spawn': O({ f: 200, f2: 620, type: 'triangle', dur: 0.2, vol: 0.14 }); break
      // Forge set: anvil strike, quench hiss, key tick, deep transition whoosh
      case 'hammer':
        O({ f: 1567, type: 'square', dur: 0.11, vol: 0.1 })
        O({ f: 2349, type: 'square', dur: 0.07, vol: 0.05 })
        O({ f: 210, f2: 90, type: 'triangle', dur: 0.09, vol: 0.16 })
        N({ dur: 0.03, filter: 6800, type: 'highpass', vol: 0.12 }); break
      case 'quench': N({ dur: 0.55, filter: 5200, filter2: 700, type: 'bandpass', Q: 0.7, vol: 0.2, attack: 0.02 }); O({ f: 340, f2: 120, type: 'sine', dur: 0.3, vol: 0.08 }); break
      case 'keytick': O({ f: 1900, type: 'sine', dur: 0.025, vol: 0.07 }); break
      case 'whoosh': N({ dur: 0.5, filter: 260, filter2: 2400, type: 'bandpass', Q: 1.4, vol: 0.32, attack: 0.04 }); break
      default: O({ f: 500, dur: 0.08, vol: 0.15 })
    }
    const dk = DUCK[name]
    if (dk) this.duck(dk)
  }

  /** Sidechain-style music dip that recovers on its own. */
  duck(depth = 0.45, { hold = 0.35, release = 0.8 } = {}) {
    if (!this.ctx || !this.enabled) return
    const g = this.musicDuck.gain
    const t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setTargetAtTime(1 - depth, t, 0.02)
    g.setTargetAtTime(1, t + hold, release / 3)
  }

  /** Start looping theme music (crossfades from any playing theme). */
  music(theme) {
    if (!this.enabled || theme === this._theme) return
    if (!this.ctx) { this._theme = theme; this._pendingTheme = theme; return }
    const T = THEMES[theme]
    if (!T) return
    const switching = this._timer != null
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this._theme = theme
    this._pendingTheme = null
    const t = this.ctx.currentTime
    this.musicBus.gain.cancelScheduledValues(t)
    if (switching) {
      // brief dip hides the seam of already-scheduled notes, then swell in
      this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.25, t, 0.12)
      this.musicBus.gain.setTargetAtTime(this.volumes.music, t + 0.35, 0.5)
    } else {
      this.musicBus.gain.setValueAtTime(0, t)
      this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.6)
    }
    this._barIdx = 0
    this._nextBar = t + 0.1
    this._timer = setInterval(() => {
      while (this._nextBar < this.ctx.currentTime + 0.4) {
        this._scheduleBar(T, this._nextBar, this._barIdx)
        this._nextBar += (60 / T.bpm) * 4
        this._barIdx++
      }
    }, 120)
  }

  _scheduleBar(T, t0, barIdx) {
    const spb = 60 / T.bpm
    const bar = T.prog[barIdx % T.prog.length]
    const [bassRoot, ...chord] = bar
    const M = o => this._osc({ ...o, bus: this.musicBus })
    const MN = o => this._noise({ ...o, bus: this.musicBus })

    // Pad: soft detuned chord
    for (const m of chord) {
      M({ f: NOTE(m), type: T.pad, t: t0, dur: spb * 4, vol: 0.035, attack: spb * 0.8, detune: -6 })
      M({ f: NOTE(m), type: T.pad, t: t0, dur: spb * 4, vol: 0.035, attack: spb * 0.8, detune: 6 })
    }
    // Bass — grounded pulse; fifth (not octave) lift keeps it a war chant
    if (T.drums) {
      for (let i = 0; i < 8; i++) {
        const lift = i % 4 === 3 ? 7 : 0
        M({ f: NOTE(bassRoot + lift), type: T.bass, t: t0 + i * spb * 0.5, dur: spb * 0.42, vol: 0.11, attack: 0.008 })
      }
    } else {
      M({ f: NOTE(bassRoot), type: T.bass, t: t0, dur: spb * 2, vol: 0.14, attack: 0.02 })
      M({ f: NOTE(bassRoot + 7), type: T.bass, t: t0 + spb * 2, dur: spb * 2, vol: 0.11, attack: 0.02 })
    }
    // Arp — kept an octave lower than the old neon sparkle; brooding, not bright
    const div = T.arpDiv || 2
    const steps = 4 * div
    for (let i = 0; i < steps; i++) {
      const m = chord[i % chord.length] + 12 * (i % 8 >= 4 ? 1 : 0)
      const swing = T.swing && i % 2 === 1 ? T.swing * (spb / div) : 0
      M({ f: NOTE(m), type: T.arp, t: t0 + i * (spb / div) + swing, dur: 0.14, vol: theme_arp_vol(T), attack: 0.006 })
    }
    // Drums — taiko-weight war drums: deep boom, tom gallop, dull skin snare
    if (T.drums) {
      for (let b = 0; b < 4; b++) {
        M({ f: 105, f2: 30, type: 'sine', t: t0 + b * spb, dur: 0.2, vol: 0.5, attack: 0.002 })
        if (b === 1 || b === 3) {
          MN({ t: t0 + b * spb, dur: 0.16, filter: 900, type: 'bandpass', Q: 0.8, vol: 0.2 })
          M({ f: 72, f2: 40, type: 'sine', t: t0 + b * spb, dur: 0.16, vol: 0.22, attack: 0.002 })
        }
        // low tom double on the back half of beats 2 and 4 — marching gallop
        if (b === 1 || b === 3) M({ f: 88, f2: 46, type: 'sine', t: t0 + (b + 0.5) * spb, dur: 0.13, vol: 0.26, attack: 0.002 })
      }
      for (let i = 0; i < 8; i++) {
        const swing = T.swing && i % 2 === 1 ? T.swing * (spb / 2) : 0
        MN({ t: t0 + i * spb * 0.5 + swing, dur: 0.035, filter: 6500, type: 'highpass', vol: i % 2 ? 0.03 : 0.05 })
      }
    }
  }

  stopMusic(fade = 0.35) {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this._theme = null
    this._pendingTheme = null
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, fade)
  }

  // ---------- ambience beds ----------

  /**
   * Declare the scene's ambience. Beds crossfade: new beds fade in, beds no
   * longer declared fade out. Pass null/unknown name for silence.
   */
  ambience(name, { fade = 1.6 } = {}) {
    if (!this.enabled) return
    if (name === this._ambName) return
    this._ambName = name
    if (!this.ctx) { this._pendingAmb = name; return }
    const want = new Set(SCENE_AMBIENCE[name] || [])
    // fade out beds no longer wanted
    for (const [bedName, bed] of this._amb) {
      if (want.has(bedName)) continue
      this._fadeBed(bed, 0, fade)
      this._amb.delete(bedName)
    }
    // fade in new beds (existing ones keep running)
    for (const bedName of want) {
      if (!this._amb.has(bedName)) this._startBed(bedName, fade)
    }
  }

  _startBed(bedName, fade) {
    const def = BEDS[bedName]
    const c = this.ctx
    const src = c.createBufferSource()
    src.buffer = this._noiseBuf
    src.loop = true
    const fl = c.createBiquadFilter()
    fl.type = def.filter.type
    fl.frequency.value = def.filter.f
    fl.Q.value = def.filter.q
    const g = c.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(def.gain, c.currentTime, fade / 2)
    src.connect(fl); fl.connect(g); g.connect(this.ambBus)
    src.start()
    const bed = { src, g, fl, lfos: [], popTimer: null, baseGain: def.gain }
    for (const key of ['lfo', 'lfo2']) {
      const L = def[key]
      if (!L) continue
      const lo = c.createOscillator()
      lo.type = 'sine'
      lo.frequency.value = L.rate
      const lg = c.createGain()
      lg.gain.value = L.depth
      lo.connect(lg)
      lg.connect(L.target === 'gain' ? g.gain : fl.frequency)
      lo.start()
      bed.lfos.push(lo)
    }
    if (def.pops) {
      const P = def.pops
      const fire = () => {
        if (!this._amb.has(bedName)) return
        this._bedPop(P.kind, (P.vol ?? 1) * bed.baseGain * 6)
        bed.popTimer = setTimeout(fire, (P.every[0] + Math.random() * (P.every[1] - P.every[0])) * 1000)
      }
      bed.popTimer = setTimeout(fire, 400 + Math.random() * 900)
    }
    this._amb.set(bedName, bed)
  }

  _bedPop(kind, vol) {
    const bus = this.ambBus
    switch (kind) {
      case 'crackle': {
        const f = 1400 + Math.random() * 3200
        this._noise({ dur: 0.015 + Math.random() * 0.03, filter: f, type: 'bandpass', Q: 2.5, vol: vol * (0.5 + Math.random() * 0.8), bus })
        break
      }
      case 'bubble': {
        const f = 90 + Math.random() * 140
        this._osc({ f: f * 1.6, f2: f, type: 'sine', dur: 0.1 + Math.random() * 0.14, vol: vol * 0.9, bus })
        break
      }
      case 'murmur': { // a voice rises out of the crowd for a moment
        const f = 300 + Math.random() * 500
        this._noise({ dur: 0.25 + Math.random() * 0.4, filter: f, filter2: f * 1.6, type: 'bandpass', Q: 3.5, vol: vol * 0.5, attack: 0.09, bus })
        break
      }
      case 'clink': { // distant smith at work
        const f = 1400 + Math.random() * 1400
        this._osc({ f, type: 'square', dur: 0.05, vol: vol * 0.35, bus })
        this._osc({ f: f * 1.5, type: 'square', dur: 0.035, vol: vol * 0.18, bus })
        break
      }
    }
  }

  _fadeBed(bed, target, fade) {
    const c = this.ctx
    bed.g.gain.setTargetAtTime(target, c.currentTime, fade / 2)
    if (bed.popTimer) clearTimeout(bed.popTimer)
    setTimeout(() => {
      try { bed.src.stop() } catch { /* already stopped */ }
      for (const lo of bed.lfos) { try { lo.stop() } catch { /* already stopped */ } }
      bed.g.disconnect()
    }, fade * 1000 + 200)
  }

  stopAmbience(fade = 1.2) {
    this._ambName = null
    this._pendingAmb = null
    if (!this.ctx) return
    for (const [, bed] of this._amb) this._fadeBed(bed, 0, fade)
    this._amb.clear()
  }

  // ---------- chariot engine loop ----------

  startEngine() {
    if (!this.ctx || !this.enabled || this._engine) return
    const c = this.ctx
    const g = c.createGain()
    g.gain.value = 0
    const fl = c.createBiquadFilter()
    fl.type = 'lowpass'
    fl.frequency.value = 400
    fl.Q.value = 1.2
    fl.connect(g); g.connect(this.sfxBus)
    const mk = (type, f, detune = 0) => {
      const o = c.createOscillator()
      o.type = type; o.frequency.value = f; o.detune.value = detune
      o.connect(fl); o.start()
      return o
    }
    const oscA = mk('sawtooth', 46)
    const oscB = mk('sawtooth', 46.4, 9)
    const sub = mk('sine', 23)
    // boost layer: rushing air/mechanism
    const nsrc = c.createBufferSource()
    nsrc.buffer = this._noiseBuf; nsrc.loop = true
    const nfl = c.createBiquadFilter()
    nfl.type = 'bandpass'; nfl.frequency.value = 900; nfl.Q.value = 0.8
    const ng = c.createGain(); ng.gain.value = 0
    nsrc.connect(nfl); nfl.connect(ng); ng.connect(g)
    nsrc.start()
    this._engine = { g, fl, oscA, oscB, sub, nsrc, ng }
    this.setEngine(0, 0)
  }

  /** speed 0..1, boost 0..1 — call every frame while racing. */
  setEngine(speed, boost = 0) {
    const e = this._engine
    if (!e) return
    const t = this.ctx.currentTime
    const f = 40 + speed * 95 + boost * 22
    e.oscA.frequency.setTargetAtTime(f, t, 0.09)
    e.oscB.frequency.setTargetAtTime(f * 1.008, t, 0.09)
    e.sub.frequency.setTargetAtTime(f * 0.5, t, 0.09)
    e.fl.frequency.setTargetAtTime(320 + speed * 2300 + boost * 1000, t, 0.1)
    e.g.gain.setTargetAtTime(0.11 + speed * 0.1 + boost * 0.05, t, 0.12)
    e.ng.gain.setTargetAtTime(boost * 0.13 + speed * 0.02, t, 0.15)
  }

  stopEngine(fade = 0.5) {
    const e = this._engine
    if (!e) return
    this._engine = null
    e.g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 2)
    setTimeout(() => {
      for (const n of [e.oscA, e.oscB, e.sub, e.nsrc]) { try { n.stop() } catch { /* already stopped */ } }
      e.g.disconnect()
    }, fade * 1000 + 200)
  }

  // ---------- mix ----------

  /** Partial-update mix volumes (0..1); persists across sessions. */
  setVolumes(v) {
    Object.assign(this.volumes, v)
    try { localStorage.setItem(VOL_KEY, JSON.stringify(this.volumes)) } catch { /* private mode */ }
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (v.master != null) this.master.gain.setTargetAtTime(v.master, t, 0.05)
    if (v.music != null) this.musicBus.gain.setTargetAtTime(v.music, t, 0.05)
    if (v.sfx != null) this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05)
    if (v.amb != null) this.ambBus.gain.setTargetAtTime(v.amb, t, 0.05)
  }
}

function theme_arp_vol(T) { return T.drums ? 0.045 : 0.06 }
