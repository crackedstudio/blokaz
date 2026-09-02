/**
 * Procedural background music for Blokaz.
 *
 * There are no audio assets in this project and no license to buy one, so the
 * soundtrack is synthesized the same way the sound effects are: oscillators and
 * filtered noise, scheduled ahead of time on the Web Audio clock. That buys a
 * few things beyond zero bytes of download — the music can change key, tempo
 * and instrumentation in response to the game, and it never has a seam where a
 * loop restarts.
 *
 * ── How it plays ────────────────────────────────────────────────────────────
 * A four-bar chord loop in A minor pentatonic, sixteen sixteenth-notes to the
 * bar. Four layers stack as intensity rises, which is what makes a run feel
 * like it escalates:
 *
 *   intensity 0  bass + soft hats          the lobby, and the first tier
 *   intensity 1  + arpeggio
 *   intensity 2  + lead melody, faster
 *   intensity 3  + octave doubling, faster still
 *
 * GameScreen drives intensity off the score tier, so the track thickens as the
 * player climbs rather than looping flat for four minutes.
 *
 * ── Scheduling ──────────────────────────────────────────────────────────────
 * setTimeout is far too jittery to place notes on. The standard Web Audio
 * approach is used instead: a coarse timer wakes up every 25ms and schedules
 * every note that falls inside the next 120ms directly on the audio clock,
 * which is sample-accurate. Audible timing therefore never depends on when the
 * timer actually fires.
 *
 * If a real composed track is licensed later, this module is the only thing
 * that needs replacing — the transport (start/stop/intensity/volume) is what
 * the rest of the app talks to.
 */

/** A4-relative note table for the scale degrees we use, in Hz. */
const NOTE = {
  A1: 55.0, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0,
  A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0,
  A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,
  A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 784.0, A5: 880.0,
} as const

/** Four bars of i–VI–III–VII in A minor: Am, F, C, G. */
const BARS = [
  { root: NOTE.A2, arp: [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.C4], lead: [NOTE.A4, NOTE.C5, NOTE.E5] },
  { root: NOTE.F2, arp: [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.A3], lead: [NOTE.C5, NOTE.A4, NOTE.F4] },
  { root: NOTE.C3, arp: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.E4], lead: [NOTE.G4, NOTE.E4, NOTE.C5] },
  { root: NOTE.G2, arp: [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.D4], lead: [NOTE.D5, NOTE.G4, NOTE.A4] },
] as const

const STEPS_PER_BAR = 16
const LOOKAHEAD_MS = 25
const SCHEDULE_WINDOW = 0.12

export type MusicIntensity = 0 | 1 | 2 | 3

/** Tempo climbs with intensity so a hot run physically feels faster. */
const BPM = [104, 112, 122, 132]

export class MusicEngine {
  private ctx: AudioContext
  private out: GainNode
  private timer: number | null = null
  /** Absolute audio-clock time the next step should sound at. */
  private nextStepAt = 0
  private step = 0
  private intensity: MusicIntensity = 0
  private running = false
  /** Everything currently scheduled, so stop() can silence mid-flight notes. */
  private live = new Set<{ stop: (t?: number) => void }>()

  constructor(ctx: AudioContext, destination: GainNode) {
    this.ctx = ctx
    this.out = destination
  }

  get isRunning() {
    return this.running
  }

  start(intensity: MusicIntensity = 0) {
    if (this.running) {
      this.setIntensity(intensity)
      return
    }
    this.running = true
    this.intensity = intensity
    this.step = 0
    // A beat of headroom so the first notes are scheduled, not rushed.
    this.nextStepAt = this.ctx.currentTime + 0.08
    this.tick()
  }

  stop() {
    this.running = false
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Notes already on the clock would otherwise keep playing after a stop.
    const now = this.ctx.currentTime
    for (const node of this.live) {
      try {
        node.stop(now)
      } catch {
        /* already stopped */
      }
    }
    this.live.clear()
  }

  setIntensity(next: MusicIntensity) {
    this.intensity = next
  }

  private get stepDuration() {
    // A step is a sixteenth note.
    return 60 / BPM[this.intensity] / 4
  }

  /**
   * Schedules every step that starts inside the lookahead window, then sleeps.
   * Called on a plain timer, but nothing it schedules depends on timer accuracy.
   */
  private tick = () => {
    if (!this.running) return
    const horizon = this.ctx.currentTime + SCHEDULE_WINDOW
    while (this.nextStepAt < horizon) {
      this.scheduleStep(this.step, this.nextStepAt)
      this.nextStepAt += this.stepDuration
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS.length)
    }
    this.timer = window.setTimeout(this.tick, LOOKAHEAD_MS)
  }

  private scheduleStep(step: number, at: number) {
    const bar = BARS[Math.floor(step / STEPS_PER_BAR)]
    const beat = step % STEPS_PER_BAR
    const I = this.intensity

    // ── Bass: root on the downbeat, fifth-ish push halfway through the bar ──
    if (beat === 0) this.voice(bar.root, 'triangle', 0.44, 0.30, at)
    if (beat === 8) this.voice(bar.root, 'triangle', 0.30, 0.20, at)
    if (I >= 2 && (beat === 6 || beat === 14)) {
      this.voice(bar.root * 2, 'triangle', 0.14, 0.12, at)
    }

    // ── Hats: eighths, with sixteenth ghosts once it gets busy ──
    if (beat % 4 === 2) this.hat(0.035, 0.085, at)
    if (I >= 1 && beat % 4 === 0) this.hat(0.028, 0.045, at)
    if (I >= 3 && beat % 2 === 1) this.hat(0.02, 0.03, at)

    // ── Arpeggio: steady sixteenths through the bar's chord tones ──
    if (I >= 1 && beat % 2 === 0) {
      const note = bar.arp[(beat / 2) % bar.arp.length]
      this.voice(note, 'square', 0.10, 0.055, at)
    }

    // ── Lead: sparse, so it reads as melody rather than texture ──
    if (I >= 2 && (beat === 0 || beat === 6 || beat === 11)) {
      const note = bar.lead[[0, 6, 11].indexOf(beat)]
      this.voice(note, 'triangle', 0.26, 0.10, at)
      if (I >= 3) this.voice(note * 2, 'sine', 0.20, 0.035, at)
    }
  }

  /** One pitched note with a short percussive envelope. */
  private voice(freq: number, type: OscillatorType, dur: number, vol: number, at: number) {
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(vol, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain)
    gain.connect(this.out)
    osc.start(at)
    osc.stop(at + dur + 0.02)
    this.track(osc, (dur + 0.02) * 1000)
  }

  /** Filtered noise tick standing in for a hi-hat. */
  private hat(dur: number, vol: number, at: number) {
    const len = Math.ceil(this.ctx.sampleRate * (dur + 0.02))
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7200
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(vol, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.out)
    src.start(at)
    src.stop(at + dur + 0.02)
    this.track(src, (dur + 0.02) * 1000)
  }

  /** Hold a reference only until the note has finished, so the set stays small. */
  private track(node: { stop: (t?: number) => void }, lifetimeMs: number) {
    this.live.add(node)
    window.setTimeout(() => this.live.delete(node), lifetimeMs + 200)
  }
}
