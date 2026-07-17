const NOTE = m => 440 * Math.pow(2, (m - 69) / 12)

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
 * Fully procedural WebAudio synth — SFX + looping theme music.
 * Call unlock() from a user gesture before anything will sound.
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
  }

  unlock() {
    if (!this.enabled) return
    if (this.ctx) { this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) { this.enabled = false; return }
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.85
    this.master.connect(this.ctx.destination)

    this.sfxBus = this.ctx.createGain()
    this.sfxBus.gain.value = 0.55
    this.sfxBus.connect(this.master)

    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.3
    this.musicBus.connect(this.master)

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
    verb.connect(wet)
    wet.connect(this.master)

    if (this._pendingTheme) {
      const t = this._pendingTheme
      this._pendingTheme = null
      this.music(t)
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

  /** Fire a named sound effect. */
  play(name, { delay = 0, vol = 1 } = {}) {
    if (!this.ctx || !this.enabled) return
    const t = this.ctx.currentTime + delay
    const O = o => this._osc({ ...o, t: t + (o.delay || 0), vol: (o.vol ?? 0.35) * vol })
    const N = o => this._noise({ ...o, t: t + (o.delay || 0), vol: (o.vol ?? 0.3) * vol })
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
      default: O({ f: 500, dur: 0.08, vol: 0.15 })
    }
  }

  /** Start looping theme music: 'hub' | 'battle' | 'court' | 'arena'. */
  music(theme) {
    if (!this.enabled || theme === this._theme) return
    this.stopMusic()
    this._theme = theme
    if (!this.ctx) { this._pendingTheme = theme; return }
    const T = THEMES[theme]
    if (!T) return
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime)
    this.musicBus.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.3)
    this._barIdx = 0
    this._nextBar = this.ctx.currentTime + 0.1
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

  stopMusic() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this._theme = null
    this._pendingTheme = null
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
  }
}

function theme_arp_vol(T) { return T.drums ? 0.045 : 0.06 }
