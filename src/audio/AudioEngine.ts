// Procedural sound engine for Blokaz — all sounds synthesized with Web Audio API.
// No external assets; context is lazily created on first user interaction.
//
// Two buses hang off the master gain, each with its own toggle and level:
//
//     sfx   ─┐
//            ├─► master ─► destination
//     music ─┘
//
// They are separate because players want different things from them — muting a
// soundtrack while keeping the feedback that tells you a line cleared is the
// single most common audio preference in a game like this. Both persist to
// localStorage.
//
// Browsers will not let an AudioContext start without a user gesture, so
// nothing here forces one: the context is created on the first sound the player
// actually causes, and `unlock()` is called from the first tap so music can
// begin without waiting for a sound effect.

import { MusicEngine, type MusicIntensity, type MusicVoicing } from './MusicEngine'

const KEY_ENABLED = 'blokaz-sfx-on'
const KEY_VOLUME  = 'blokaz-sfx-vol'
const KEY_MUSIC_ON  = 'blokaz-music-on'
const KEY_MUSIC_VOL = 'blokaz-music-vol'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v !== 'false'
  } catch {
    return fallback
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '')
    return Number.isFinite(v) ? v : fallback
  } catch {
    return fallback
  }
}

class BlokAudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  /** Sits between the SFX bus and master; opened wide unless silver is on. */
  private sfxTone: BiquadFilterNode | null = null
  private musicBus: GainNode | null = null
  private musicEngine: MusicEngine | null = null

  private _enabled: boolean
  private _volume: number
  private _musicEnabled: boolean
  private _musicVolume: number
  /** What music should be playing once the context is allowed to run. */
  private _pendingMusic: MusicIntensity | null = null
  /** Set by the first user gesture. Until then, nothing may build a context. */
  private _unlocked = false
  private _voicing: MusicVoicing = 'default'
  /** True while the page is backgrounded and we have parked the context. */
  private _parked = false

  constructor() {
    this._enabled = readBool(KEY_ENABLED, true)
    this._volume = readNumber(KEY_VOLUME, 0.65)
    this._musicEnabled = readBool(KEY_MUSIC_ON, true)
    // Music sits under the effects by default; it is the bed, not the event.
    this._musicVolume = readNumber(KEY_MUSIC_VOL, 0.32)
    this.watchVisibility()
    this.watchTheme()
  }

  /**
   * Follow the theme. The store already dispatches `themechange` on every
   * apply — nothing listened to it until now — so SilverGod's sweeter voicing
   * arrives with the silver palette and leaves with it, without the theme code
   * having to know the audio engine exists.
   */
  private watchTheme() {
    if (typeof window === 'undefined') return
    const sync = (theme: string | undefined) =>
      this.setVoicing(theme === 'silver' ? 'silver' : 'default')
    window.addEventListener('themechange', (e) => {
      sync((e as CustomEvent<{ theme?: string }>).detail?.theme)
    })
    // The store applies the stored theme before this module is imported, so
    // read the attribute once rather than waiting for the next change.
    if (typeof document !== 'undefined') {
      sync(document.documentElement.dataset.theme)
    }
  }

  /**
   * Silence everything while the page is in the background.
   *
   * Without this the soundtrack keeps playing after the player switches tab or
   * app — which on mobile means Blokaz is still making noise over whatever they
   * opened next.
   *
   * Suspending the whole AudioContext is the right lever rather than muting a
   * gain: it stops the audio clock too, so the music scheduler idles instead of
   * queueing notes into a window that has frozen, and nothing has to be
   * unwound and rebuilt on the way back. Position is preserved exactly, so the
   * loop continues from where it left off.
   */
  private watchVisibility() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Guarded on the flag, not just the context state: suspend() is async,
        // so two visibilitychange events in quick succession would both still
        // see state 'running' and each fire a suspend. Only park a context that
        // was actually running, so we never resume one the player had not
        // started yet.
        if (!this._parked && this.ctx && this.ctx.state === 'running') {
          this._parked = true
          void this.ctx.suspend()
        }
        return
      }
      if (this._parked && this.ctx) {
        this._parked = false
        void this.ctx.resume()
      }
    })
  }

  get enabled() { return this._enabled }
  get volume()  { return this._volume  }
  get musicEnabled() { return this._musicEnabled }
  get musicVolume()  { return this._musicVolume  }

  setEnabled(v: boolean) {
    this._enabled = v
    try { localStorage.setItem(KEY_ENABLED, String(v)) } catch {}
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(v ? this._volume : 0, this.ctx.currentTime, 0.05)
    }
  }

  setVolume(v: number) {
    this._volume = v
    try { localStorage.setItem(KEY_VOLUME, String(v)) } catch {}
    if (this.sfxBus && this.ctx && this._enabled) {
      this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
    }
  }

  setMusicEnabled(v: boolean) {
    this._musicEnabled = v
    try { localStorage.setItem(KEY_MUSIC_ON, String(v)) } catch {}
    if (!v) {
      this.musicEngine?.stop()
      return
    }
    // Turning music back on resumes whatever the screen last asked for.
    if (this._pendingMusic !== null) this.startMusic(this._pendingMusic)
  }

  setMusicVolume(v: number) {
    this._musicVolume = v
    try { localStorage.setItem(KEY_MUSIC_VOL, String(v)) } catch {}
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08)
    }
  }

  /**
   * Create/resume the context in response to a user gesture. Safe to call on
   * every tap — it is a no-op once running.
   */
  unlock() {
    this._unlocked = true
    const ctx = this.g(true)
    if (!ctx) return
    if (this._pendingMusic !== null && this._musicEnabled && !this.musicEngine?.isRunning) {
      this.startMusic(this._pendingMusic)
    }
  }

  // ── Music transport ────────────────────────────────────────────────────────

  /**
   * Ask for music at a given intensity. Remembered even when it cannot start
   * yet, so the first user gesture brings it in without the caller retrying.
   */
  startMusic(intensity: MusicIntensity = 0) {
    this._pendingMusic = intensity
    if (!this._musicEnabled) return
    // Screens ask for music on mount, which is before any gesture. Constructing
    // a context there only produces a suspended one plus a console warning, so
    // the request is held until unlock() reports a real interaction.
    if (!this._unlocked) return
    const ctx = this.g(true)
    if (!ctx || !this.musicBus) return
    if (!this.musicEngine) this.musicEngine = new MusicEngine(ctx, this.musicBus)
    this.musicEngine.setVoicing(this._voicing)
    this.musicEngine.start(intensity)
  }

  setMusicIntensity(intensity: MusicIntensity) {
    this._pendingMusic = intensity
    this.musicEngine?.setIntensity(intensity)
  }

  stopMusic() {
    this._pendingMusic = null
    this.musicEngine?.stop()
  }

  /**
   * SilverGod's sweeter voicing: a warmer chord loop and softer effects.
   * Remembered even before a context exists, so switching theme on a page that
   * has not made a sound yet still comes up correct.
   */
  setVoicing(voicing: MusicVoicing) {
    if (this._voicing === voicing) return
    this._voicing = voicing
    this.musicEngine?.setVoicing(voicing)
    this.applyVoicing()
  }

  get voicing() {
    return this._voicing
  }

  /** Rolls the SFX tone filter to match the current voicing. */
  private applyVoicing() {
    if (!this.sfxTone || !this.ctx) return
    // 20kHz is effectively open; 2.6kHz takes the glare off the transients
    // without muffling them. Ramped, so a theme switch does not click.
    const target = this._voicing === 'silver' ? 2600 : 20000
    this.sfxTone.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08)
  }

  /**
   * Returns a live AudioContext, lazily creating it on first call.
   *
   * `force` is for music and unlock(): a player who has muted sound effects can
   * still want the soundtrack, so the context must be constructible even when
   * `_enabled` is false.
   */
  private g(force = false): AudioContext | null {
    if (!this._enabled && !force) return null
    // Reaching here from an effect means the player did something audible;
    // that is as good a gesture as a tap on the unlock path.
    this._unlocked = true
    try {
      if (!this.ctx) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (!Ctx) return null
        this.ctx    = new Ctx()
        this.master = this.ctx.createGain()
        this.master.gain.value = 1
        this.master.connect(this.ctx.destination)

        // sfxBus → tone → master. The filter is transparent by default and
        // only closes down in silver mode, so effects keep their shape and
        // lose their edge rather than being replaced.
        this.sfxTone = this.ctx.createBiquadFilter()
        this.sfxTone.type = 'lowpass'
        this.sfxTone.frequency.value = 20000
        this.sfxTone.Q.value = 0.7
        this.sfxTone.connect(this.master)

        this.sfxBus = this.ctx.createGain()
        this.sfxBus.gain.value = this._enabled ? this._volume : 0
        this.sfxBus.connect(this.sfxTone)
        this.applyVoicing()

        this.musicBus = this.ctx.createGain()
        this.musicBus.gain.value = this._musicVolume
        this.musicBus.connect(this.master)
      }
      // Do not resume a context parked for backgrounding — a stray sound from a
      // timer still running in a hidden tab would otherwise wake the whole
      // engine back up and defeat the suspend.
      //
      // The park flag is the only gate, deliberately: `document.hidden` is not
      // a reliable proxy for "the player is not here". Embedded webviews and
      // some in-app browsers report hidden while the user is actively tapping,
      // and gating on that would leave the game permanently silent for them.
      // Reaching here at all means something the player did asked for a sound.
      if (this.ctx.state === 'suspended' && !this._parked) {
        void this.ctx.resume()
      }
      return this.ctx
    } catch { return null }
  }

  // Single oscillator with optional frequency sweep.
  private tone(
    freq: number, type: OscillatorType, dur: number,
    vol = 1, at = 0, freqEnd?: number,
  ) {
    const ctx = this.g(); if (!ctx || !this.sfxBus) return
    const now  = ctx.currentTime + at
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + dur * 0.85)
    }
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(vol, now + 0.007)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(now)
    osc.stop(now + dur + 0.01)
  }

  // White-noise burst through a filter.
  private noise(
    dur: number, filterFreq: number, vol = 1, at = 0,
    filterType: BiquadFilterType = 'bandpass',
  ) {
    const ctx = this.g(); if (!ctx || !this.sfxBus) return
    const now = ctx.currentTime + at
    const len = Math.ceil(ctx.sampleRate * (dur + 0.06))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d   = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src    = ctx.createBufferSource()
    src.buffer   = buf
    const filter = ctx.createBiquadFilter()
    filter.type  = filterType
    filter.frequency.value = filterFreq
    filter.Q.value = filterType === 'bandpass' ? 2.2 : 0.7
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxBus)
    src.start(now)
    src.stop(now + dur + 0.06)
  }

  // ── Game events ────────────────────────────────────────────────────────────

  piecePlaced() {
    this.noise(0.065, 270, 0.52)
    this.tone(125, 'sine', 0.095, 0.32, 0.004)
  }

  lineClear(count = 1) {
    // Rising arpeggio — higher count = more notes = more dramatic
    const base  = 392 // G4
    const steps = [1, 1.26, 1.498, 2, 2.52]
    const n = Math.min(count + 1, steps.length)
    for (let i = 0; i < n; i++) {
      this.tone(base * steps[i], 'triangle', 0.33, 0.42 - i * 0.04, i * 0.074)
    }
    this.noise(0.11, 4800, 0.16, n * 0.074, 'bandpass')
    if (count >= 2) this.tone(base * 3, 'sine', 0.22, 0.28, n * 0.074 + 0.05)
  }

  combo(streak: number) {
    const SCALE = [261, 294, 330, 370, 415, 466, 523, 587, 659, 740, 880]
    const freq  = SCALE[Math.min(streak - 2, SCALE.length - 1)]
    this.tone(freq, 'triangle', 0.28, 0.46)
    this.tone(freq * 1.5, 'sine', 0.18, 0.24, 0.065)
    if (streak >= 5) this.noise(0.09, 2400, 0.14, 0.09)
  }

  gameOver() {
    this.tone(235, 'sawtooth', 0.45, 0.40)
    this.tone(176, 'sawtooth', 0.52, 0.38, 0.12)
    this.tone(132, 'sawtooth', 0.58, 0.40, 0.26)
    this.tone(99,  'sine',     0.68, 0.45, 0.42)
    this.noise(0.68, 105, 0.55, 0.40, 'lowpass')
  }

  tierUp() {
    const arp = [261, 329, 392, 523, 659, 784]
    arp.forEach((f, i) => {
      this.tone(f, 'triangle', 0.50 - i * 0.03, 0.50, i * 0.088)
      if (i >= 3) this.tone(f * 2, 'sine', 0.28, 0.22, i * 0.088)
    })
    this.noise(0.2, 3200, 0.18, 0.44)
  }

  // ── Power-ups ──────────────────────────────────────────────────────────────

  scoreBoost() {
    // Electric charge-up: sawtooth frequency sweep + bright burst
    const ctx = this.g(); if (!ctx || !this.sfxBus) return
    const now  = ctx.currentTime
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(110, now)
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.23)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.28, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(now)
    osc.stop(now + 0.30)
    // Burst on peak
    this.noise(0.13, 4200, 0.22, 0.22)
    this.tone(1760, 'sine', 0.28, 0.38, 0.24)
    this.tone(2200, 'sine', 0.18, 0.26, 0.28)
  }

  shield() {
    // Low whomp sweep + metallic ring
    const ctx = this.g(); if (!ctx || !this.sfxBus) return
    const now  = ctx.currentTime
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(72, now)
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.18)
    osc.frequency.exponentialRampToValueAtTime(185, now + 0.50)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.52, now + 0.020)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(now)
    osc.stop(now + 0.58)
    this.noise(0.18, 680, 0.20, 0.065)
    this.tone(880,  'triangle', 0.52, 0.35, 0.17)
    this.tone(1320, 'sine',     0.34, 0.20, 0.22)
  }

  bomb() {
    // Two mechanical arm-clicks
    this.noise(0.022, 2900, 0.58)
    this.noise(0.022, 2900, 0.44, 0.065)
    this.tone(78, 'sawtooth', 0.10, 0.28, 0.065)
  }

  bombBlast() {
    // Sub-bass thud + noise burst + high crack
    this.noise(0.58, 135, 0.92, 0, 'lowpass')
    this.noise(0.08, 5800, 0.56, 0, 'bandpass')
    this.tone(50, 'sine', 0.44, 0.72)
    this.tone(75, 'sine', 0.34, 0.54, 0.025)
    this.noise(0.30, 950, 0.32, 0.10, 'bandpass')
  }

  rotatePass() {
    // Square-wave mechanical whirr + three clicks
    const ctx = this.g(); if (!ctx || !this.sfxBus) return
    const now  = ctx.currentTime
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(265, now)
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.22)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26)
    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(now)
    osc.stop(now + 0.28)
    ;([0.065, 0.13, 0.20] as const).forEach(t => this.noise(0.022, 1950, 0.34, t))
  }

  shieldSave() {
    const freqs = [220, 330, 440, 660, 880, 1320]
    freqs.forEach((f, i) => {
      this.tone(f, 'sine', 0.42 - i * 0.025, 0.44 + i * 0.05, i * 0.068)
    })
    this.noise(0.32, 1700, 0.22, 0.38)
  }

  // ── Interface ──────────────────────────────────────────────────────────────
  // Kept deliberately quieter and shorter than the gameplay set. UI sound that
  // competes with a line clear is noise; these are meant to sit under it.

  /** Generic tap. Every interactive surface in the lobby uses this. */
  uiTap() {
    this.tone(660, 'sine', 0.055, 0.13)
    this.noise(0.022, 3200, 0.05)
  }

  /** A sheet or modal arriving — two notes rising. */
  uiOpen() {
    this.tone(523, 'triangle', 0.10, 0.15)
    this.tone(784, 'sine', 0.13, 0.11, 0.055)
  }

  /** The same shape, inverted, so dismissal reads as the opposite gesture. */
  uiClose() {
    this.tone(660, 'triangle', 0.09, 0.12)
    this.tone(392, 'sine', 0.12, 0.10, 0.05)
  }

  /** Switches and tabs. Pitch encodes the new state. */
  uiToggle(on: boolean) {
    this.tone(on ? 880 : 440, 'square', 0.05, 0.10)
    this.tone(on ? 1180 : 330, 'sine', 0.07, 0.07, 0.04)
  }

  /** A rejected action — a blocked placement, a failed claim. */
  uiError() {
    this.tone(196, 'square', 0.09, 0.16)
    this.tone(147, 'square', 0.13, 0.15, 0.07)
  }

  /** A mission ticked off mid-run. Small, since three can land in a session. */
  missionComplete() {
    this.tone(659, 'triangle', 0.14, 0.24)
    this.tone(988, 'sine', 0.18, 0.18, 0.075)
    this.noise(0.07, 5200, 0.10, 0.075)
  }

  /**
   * Clearing a rung of the weekly ladder. Longer and fuller than tierUp, which
   * fires several times inside a single run — this one is rare and pays out.
   */
  levelUp() {
    const arp = [392, 523, 659, 784, 1047]
    arp.forEach((f, i) => {
      this.tone(f, 'triangle', 0.42, 0.34, i * 0.085)
      this.tone(f * 2, 'sine', 0.22, 0.12, i * 0.085 + 0.02)
    })
    this.tone(196, 'sine', 0.55, 0.30, 0)
    this.noise(0.26, 3600, 0.16, 0.36)
  }

  /** Money landing — stablecoin claimed, prize won. */
  reward() {
    ;[880, 1175, 1568].forEach((f, i) => {
      this.tone(f, 'sine', 0.24, 0.26, i * 0.06)
      this.tone(f * 1.5, 'triangle', 0.16, 0.12, i * 0.06 + 0.015)
    })
    this.noise(0.18, 6000, 0.12, 0.16)
  }

  // ── Lottery reel ───────────────────────────────────────────────────────────
  // A spinning reel is carried almost entirely by its ticking. The whole tick
  // sequence is scheduled up front on the audio clock rather than driven from
  // an animation frame or a timer: the reel's motion is deterministic, so the
  // clicks can be placed exactly, and nothing has to run per-frame to keep the
  // audio in step with what is on screen.

  /** The reel engaging — a launch whoosh under the first clicks. */
  spinStart() {
    const ctx = this.g(); if (!ctx || !this.sfxBus) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(90, now)
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.32)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38)
    osc.connect(gain)
    gain.connect(this.sfxBus)
    osc.start(now)
    osc.stop(now + 0.40)
    this.noise(0.30, 1400, 0.16, 0.02, 'bandpass')
  }

  /**
   * One card passing the pointer. Deliberately tiny — dozens of these fire in
   * a single spin, so anything with a tail would smear into a drone.
   */
  spinTick(at = 0, vol = 0.30) {
    this.noise(0.012, 2600, vol, at)
    this.tone(1180, 'square', 0.016, vol * 0.5, at)
  }

  /**
   * Fill `duration` seconds with clicks whose spacing eases from `fromGap` to
   * `toGap`. Equal gaps give a constant-speed reel; widening gaps read as the
   * reel losing momentum.
   *
   * Driven by elapsed time rather than a tick count: estimating the count from
   * an average gap lands the final click early, which puts the reel's landing
   * thud before it visually stops. Returns the time the last click sounds, so
   * the caller can place that thud on it.
   */
  spinTicks(duration: number, fromGap: number, toGap: number, at = 0) {
    let t = at
    const end = at + duration
    // Bounded so a pathological gap cannot schedule thousands of nodes.
    for (let i = 0; i < 400 && t < end; i++) {
      const p = duration <= 0 ? 1 : Math.min(1, (t - at) / duration)
      this.spinTick(t, 0.30 - 0.10 * p)
      t += fromGap + (toGap - fromGap) * (p * p)
    }
    return Math.min(t, end)
  }

  /** The reel landing. Heavier than a tick, with a little mechanical rattle. */
  spinStop(at = 0) {
    this.noise(0.07, 420, 0.55, at, 'lowpass')
    this.tone(150, 'square', 0.09, 0.34, at)
    this.tone(92, 'sine', 0.16, 0.30, at + 0.01)
  }

  /**
   * The reveal. Scaled to what was actually won, so a rare prize does not sound
   * like the consolation slot — the reel is the same either way, and this is
   * the only cue that says whether it went well.
   */
  spinReveal(rarity: 'rare' | 'uncommon' | 'common', blank = false) {
    if (blank) {
      // Nothing won: a short descent. Not a buzzer — the player still spun.
      this.tone(392, 'triangle', 0.16, 0.22)
      this.tone(294, 'triangle', 0.22, 0.20, 0.10)
      this.tone(220, 'sine', 0.30, 0.18, 0.21)
      return
    }
    if (rarity === 'rare') {
      const arp = [523, 659, 784, 1047, 1319]
      arp.forEach((f, i) => {
        this.tone(f, 'triangle', 0.44, 0.34, i * 0.075)
        this.tone(f * 2, 'sine', 0.24, 0.13, i * 0.075 + 0.02)
      })
      this.tone(262, 'sine', 0.60, 0.28)
      this.noise(0.30, 4200, 0.18, 0.34)
      return
    }
    if (rarity === 'uncommon') {
      ;[523, 784, 1047].forEach((f, i) => {
        this.tone(f, 'triangle', 0.30, 0.30, i * 0.07)
      })
      this.noise(0.16, 3600, 0.13, 0.16)
      return
    }
    this.tone(523, 'triangle', 0.20, 0.26)
    this.tone(784, 'sine', 0.24, 0.20, 0.075)
  }

  // Dispatch the right sound for a named power-up type.
  powerUp(type: string) {
    switch (type) {
      case 'scoreBoost': this.scoreBoost(); break
      case 'shield':     this.shield();     break
      case 'bomb':       this.bomb();       break
      case 'rotatePass': this.rotatePass(); break
    }
  }
}

export const audioEngine = new BlokAudioEngine()
