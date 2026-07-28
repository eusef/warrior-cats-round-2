import {
  AUDIO_BIRD_GAIN,
  AUDIO_CATCH_GAIN,
  AUDIO_CEREMONY_GAIN,
  AUDIO_CRICKET_FADE,
  AUDIO_CRICKET_GAIN,
  AUDIO_CRICKET_RATE,
  AUDIO_IMPACT_GAIN,
  AUDIO_KICK_GAIN,
  AUDIO_MASTER_GAIN,
  AUDIO_MEOW_GAIN,
  AUDIO_OWL_GAIN,
  AUDIO_POUNCE_GAIN,
  AUDIO_PURR_FADE,
  AUDIO_PURR_GAIN,
  AUDIO_PURR_RATE,
  AUDIO_STEP_GAIN,
  AUDIO_SWIPE_GAIN,
  AUDIO_TICK_GAIN,
  AUDIO_WHIFF_GAIN,
} from '../game/constants'

/**
 * Every sound in the game, synthesised. There are no audio files: nothing to
 * fetch, nothing for Safari to fail to decode, nothing to add to the repo.
 *
 * Module singleton on purpose, exactly like live.ts. StrictMode mounts every
 * component twice in dev, and a component-owned AudioContext would mean two
 * contexts, two master buses and every sound played twice.
 *
 * The context does not exist until the first tap. iOS will not start audio
 * outside a user gesture, so `unlockAudio()` is called from the title screen's
 * pointerdown handler and nowhere else.
 */

type Ctor = typeof AudioContext

let ctx: AudioContext | null = null
let master: GainNode | null = null
let analyser: AnalyserNode | null = null
// Built from an explicit ArrayBuffer, not `new Float32Array(n)`. Newer TS libs
// type the latter as Float32Array<ArrayBufferLike>, which getFloatTimeDomainData
// rejects because it could be a SharedArrayBuffer.
let probe: ReturnType<typeof makeProbe> | null = null
let noise: AudioBuffer | null = null

/** The resting purr, kept alive between rests so it can fade rather than click. */
let purr: { gain: GainNode; sources: Array<AudioScheduledSourceNode> } | null = null
let purring = false
/** The night bed. Same shape as the purr: a voice that is started and stopped. */
let crickets: { gain: GainNode; sources: Array<AudioScheduledSourceNode> } | null = null
let cricketing = false
let visibilityHooked = false
let retryHooked = false

/** The cricket gate's shape. Depends on nothing, so it is built once at import. */
const chirpCurve = makeChirpCurve()

/**
 * Counts every voice ever fired. Verification asserts on these rather than on
 * pixels, because a sound is the one thing a screenshot cannot show.
 */
export const audioCounts = {
  step: 0,
  meow: 0,
  pounce: 0,
  swipe: 0,
  kick: 0,
  impact: 0,
  whiff: 0,
  catch: 0,
  ceremony: 0,
  tick: 0,
  bird: 0,
  owl: 0,
  purrStart: 0,
  purrStop: 0,
  /** Counts starts only. Balance is `cricket` against `isCricketing()`. */
  cricket: 0,
}

export function unlockAudio() {
  if (typeof window === 'undefined') return
  if (!ctx) {
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
    const Impl = w.AudioContext ?? w.webkitAudioContext
    if (!Impl) return
    ctx = new Impl()
    master = ctx.createGain()
    master.gain.value = AUDIO_MASTER_GAIN
    // The analyser is a tap, not a link in the chain: it reads the master bus
    // without being between it and the speakers. This is how verification
    // proves sound is actually reaching the output.
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    probe = makeProbe(analyser.fftSize)
    master.connect(analyser)
    master.connect(ctx.destination)
    noise = makeNoise(ctx)
  }
  // Safari suspends the context on creation and after backgrounding. Resuming
  // is only allowed from inside the gesture, which is why this lives here.
  // The catch matters: a rejected resume() is an unhandled rejection in the
  // console otherwise, and zero console errors is the bar.
  if (ctx.state !== 'running') ctx.resume().catch(() => {})

  // iOS needs more than create-and-resume. Safari does not really hand over the
  // output until a buffer has actually been played from inside the gesture, so
  // play one silent sample. This costs nothing and is the difference between
  // sound and silence on a phone.
  try {
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    // Older Safari can throw on a 1-frame buffer. Nothing to do about it.
  }

  hookRetry()
  hookVisibility()
}

/**
 * If the title tap did not manage to start the context, every later touch tries
 * again. Silent audio for a whole session because one gesture was rejected is
 * not a failure worth shipping, and this cannot fire once audio is running.
 */
function hookRetry() {
  if (retryHooked || typeof document === 'undefined') return
  retryHooked = true
  const retry = () => {
    if (!ctx) return
    if (ctx.state === 'running') {
      document.removeEventListener('pointerdown', retry, true)
      document.removeEventListener('touchend', retry, true)
      return
    }
    ctx.resume().catch(() => {})
  }
  document.addEventListener('pointerdown', retry, true)
  document.addEventListener('touchend', retry, true)
}

/**
 * Switching apps suspends the context, and nothing would ever resume it: the
 * title tap has long since happened, so the game would be silent for the rest
 * of the session. The page already has user activation by this point.
 */
function hookVisibility() {
  if (visibilityHooked || typeof document === 'undefined') return
  visibilityHooked = true
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  })
}

/** Everything the debug overlay needs to tell unlock, routing and mix apart. */
export function audioDiagnostics() {
  const total =
    audioCounts.step +
    audioCounts.meow +
    audioCounts.pounce +
    audioCounts.swipe +
    audioCounts.kick +
    audioCounts.impact +
    audioCounts.whiff +
    audioCounts.catch +
    audioCounts.ceremony +
    audioCounts.tick +
    audioCounts.bird +
    audioCounts.owl
  return {
    state: ctx ? ctx.state : 'none',
    rate: ctx ? Math.round(ctx.sampleRate / 1000) : 0,
    total,
    meow: audioCounts.meow,
    step: audioCounts.step,
    bird: audioCounts.bird,
    owl: audioCounts.owl,
    purring,
    // The two beds report the same way, so "is the night audible" is one glance.
    cricketing,
    level: audioLevel(),
  }
}

export function audioReady() {
  return ctx !== null && ctx.state === 'running'
}

export function audioState() {
  return ctx ? ctx.state : 'none'
}

/** RMS of the master bus, 0..1. Verification reads this to prove output. */
export function audioLevel() {
  if (!analyser || !probe) return 0
  analyser.getFloatTimeDomainData(probe)
  let sum = 0
  for (let i = 0; i < probe.length; i++) sum += probe[i] * probe[i]
  return Math.sqrt(sum / probe.length)
}

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

/**
 * One paw in leaf litter. A noise burst through a bandpass, with the centre
 * frequency and the decay both jittered so a run does not sound like a
 * metronome hitting the same sample.
 */
export function playStep(gain: number) {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.85 + Math.random() * 0.4

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1500 + Math.random() * 1500
  bp.Q.value = 0.8

  // A little low end under the rustle so it reads as a paw landing rather than
  // as static. Without this the steps sound like a hi-hat.
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 260

  const env = ctx.createGain()
  const peak = Math.max(0.0002, AUDIO_STEP_GAIN * gain)
  const dur = 0.045 + Math.random() * 0.03
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.005)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  const body = ctx.createGain()
  body.gain.value = 0.5

  src.connect(bp).connect(env)
  src.connect(lp).connect(body).connect(env)
  env.connect(master)

  src.start(t)
  src.stop(t + dur + 0.02)
  audioCounts.step++
}

/**
 * A meow. A sawtooth with a pitch arc through two parallel bandpass formants,
 * which is the cheapest thing that reads as a voice rather than as a beep.
 * `plaintive` drops the pitch and stretches it, for the hungry version.
 */
export function playMeow(plaintive = false) {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const base = plaintive ? 400 : 500
  const peak = plaintive ? 560 : 760
  const dur = plaintive ? 0.62 : 0.46

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(base, t)
  osc.frequency.linearRampToValueAtTime(peak, t + dur * 0.26)
  osc.frequency.linearRampToValueAtTime(base * 0.86, t + dur)

  // Vibrato. Without it the vowel sits dead still and sounds synthetic.
  const vib = ctx.createOscillator()
  vib.type = 'sine'
  vib.frequency.value = 5.5
  const vibAmt = ctx.createGain()
  vibAmt.gain.value = 14
  vib.connect(vibAmt).connect(osc.frequency)

  const sum = ctx.createGain()
  sum.gain.value = 1

  // Two formants, the "eee" -> "ow" of a meow.
  const f1 = ctx.createBiquadFilter()
  f1.type = 'bandpass'
  f1.frequency.setValueAtTime(880, t)
  f1.frequency.linearRampToValueAtTime(640, t + dur)
  f1.Q.value = 5
  const g1 = ctx.createGain()
  g1.gain.value = 1

  const f2 = ctx.createBiquadFilter()
  f2.type = 'bandpass'
  f2.frequency.setValueAtTime(1900, t)
  f2.frequency.linearRampToValueAtTime(1250, t + dur)
  f2.Q.value = 7
  const g2 = ctx.createGain()
  g2.gain.value = 0.55

  // A touch of the raw tone keeps it from sounding hollow.
  const dry = ctx.createBiquadFilter()
  dry.type = 'lowpass'
  dry.frequency.value = 2200
  const gd = ctx.createGain()
  gd.gain.value = 0.22

  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(AUDIO_MEOW_GAIN, t + 0.07)
  env.gain.setValueAtTime(AUDIO_MEOW_GAIN, t + dur * 0.55)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(f1).connect(g1).connect(sum)
  osc.connect(f2).connect(g2).connect(sum)
  osc.connect(dry).connect(gd).connect(sum)
  sum.connect(env).connect(master)

  osc.start(t)
  vib.start(t)
  osc.stop(t + dur + 0.05)
  vib.stop(t + dur + 0.05)
  audioCounts.meow++
}

/**
 * The purr. Amplitude modulation at ~25Hz on low filtered noise, which is
 * genuinely close to how a real purr is built. Continuous, so it fades in and
 * out rather than starting and stopping.
 */
export function startPurr() {
  if (!ctx || !master || !noise || purring) return
  purring = true
  const t = ctx.currentTime

  const out = ctx.createGain()
  out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t)
  out.gain.linearRampToValueAtTime(AUDIO_PURR_GAIN, t + AUDIO_PURR_FADE)
  out.connect(master)

  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 430
  lp.Q.value = 0.7

  // A quiet sub under the noise gives the purr a chest rather than a hiss.
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = 52
  const subGain = ctx.createGain()
  subGain.gain.value = 0.35

  // The tremolo. Baseline 0.55 with +/-0.45 of swing never fully closes, so it
  // rumbles instead of stuttering.
  const am = ctx.createGain()
  am.gain.value = 0.55
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = AUDIO_PURR_RATE
  const lfoAmt = ctx.createGain()
  lfoAmt.gain.value = 0.45
  lfo.connect(lfoAmt).connect(am.gain)

  src.connect(lp).connect(am)
  sub.connect(subGain).connect(am)
  am.connect(out)

  src.start(t)
  sub.start(t)
  lfo.start(t)

  purr = { gain: out, sources: [src, sub, lfo] }
  audioCounts.purrStart++
}

export function stopPurr() {
  if (!ctx || !purr || !purring) return
  purring = false
  const t = ctx.currentTime
  const { gain, sources } = purr
  purr = null
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(0.0001, t + AUDIO_PURR_FADE)
  // Stop after the fade, never on the same tick, or the tail clicks.
  for (const s of sources) s.stop(t + AUDIO_PURR_FADE + 0.05)
  audioCounts.purrStop++
}

export function isPurring() {
  return purring
}

/** The lunge. Filtered noise sweeping downward: air, not a tone. */
export function playPounce() {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const dur = 0.24
  const src = ctx.createBufferSource()
  src.buffer = noise

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(2600, t)
  bp.frequency.exponentialRampToValueAtTime(420, t + dur)
  bp.Q.value = 1.4

  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(AUDIO_POUNCE_GAIN, t + 0.05)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(bp).connect(env).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
  audioCounts.pounce++
}

/**
 * A claw swipe. The pounce's graph, half the length and an octave up: the sweep
 * starts above where the pounce starts and stops well before the pounce lands,
 * so the two can never be mistaken for the same move. Air, not contact.
 */
export function playSwipe(): void {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const dur = 0.12
  const src = ctx.createBufferSource()
  src.buffer = noise
  // Jittered the way the paws are, so a flurry is not one sample repeating.
  src.playbackRate.value = 0.9 + Math.random() * 0.3

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(5200, t)
  bp.frequency.exponentialRampToValueAtTime(1600, t + dur)
  bp.Q.value = 2.2

  const env = ctx.createGain()
  const peak = Math.max(0.0002, AUDIO_SWIPE_GAIN)
  // A 12ms attack against the pounce's 50. The speed of the attack is most of
  // what makes this read as lighter, more than the pitch does.
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(bp).connect(env).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
  audioCounts.swipe++
}

/**
 * The jump-kick launching. The biggest of the three efforts: the longest sweep,
 * ending an octave below where the pounce ends, with one low triangle under it.
 * Filtered noise has no fundamental, so without that note the effort is a hiss
 * and the move sounds small.
 */
export function playKick(): void {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const dur = 0.34
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.7 + Math.random() * 0.25

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(1800, t)
  bp.frequency.exponentialRampToValueAtTime(240, t + dur)
  // Wider than the swipe's on purpose. A narrow band down at 240Hz whistles.
  bp.Q.value = 1.1

  const env = ctx.createGain()
  const peak = Math.max(0.0002, AUDIO_KICK_GAIN)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.055)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(bp).connect(env).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)

  // The weight, under the air. Shorter than the sweep so it does not hang.
  blip(110, t, dur * 0.8, AUDIO_KICK_GAIN * 0.55, 'triangle')
  audioCounts.kick++
}

/**
 * A hit landing. Built like a paw step rather than like a swipe: a bandpassed
 * texture path and a lowpassed body path summed into one envelope, with a low
 * triangle for the push.
 *
 * Soft and padded, and that is a content rule rather than a taste call. A hit
 * here is a number moving on a health bar and nothing else, so this is a
 * cushion being thumped. The band sits at ~450Hz where the step's sits at
 * 1500-3000, and the attack is 25ms against the step's 5, which is what keeps
 * it a thud instead of the crack it is not allowed to be. Do not sharpen it.
 */
export function playImpact(): void {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const dur = 0.18
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.6 + Math.random() * 0.25

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 380 + Math.random() * 150
  bp.Q.value = 0.7

  // The body, exactly as the step does it, but louder relative to the texture:
  // a thump is mostly low end with a little dust on top, not the other way up.
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 200

  const env = ctx.createGain()
  const peak = Math.max(0.0002, AUDIO_IMPACT_GAIN)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.025)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  const body = ctx.createGain()
  body.gain.value = 0.9

  src.connect(bp).connect(env)
  src.connect(lp).connect(body).connect(env)
  env.connect(master)

  src.start(t)
  src.stop(t + dur + 0.02)

  blip(150, t, 0.13, AUDIO_IMPACT_GAIN * 0.5, 'triangle')
  audioCounts.impact++
}

/**
 * A miss. Narrow enough to be nearly pitched and sweeping up rather than down,
 * with a soft attack and a tail five times longer than it: the one voice here
 * that has to sound like nothing happened.
 *
 * Quietest of the four twice over. The gain is the lowest of the set, and a Q
 * of 4 passes about 250Hz of a 24kHz noise buffer, so it lands well under the
 * swipe even before its number is read. That is the intent, not a bug to make
 * up for the way the crickets do.
 */
export function playWhiff(): void {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const dur = 0.22
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.9 + Math.random() * 0.3

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(900, t)
  bp.frequency.exponentialRampToValueAtTime(1400, t + dur)
  // Tonal and breathy. Anything near the swipe's 2.2 is just a quiet swipe.
  bp.Q.value = 4

  const env = ctx.createGain()
  const peak = Math.max(0.0002, AUDIO_WHIFF_GAIN)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.045)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(bp).connect(env).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
  audioCounts.whiff++
}

/** The reward. Two bright notes, up. Short enough not to interrupt play. */
export function playCatch() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  blip(784, t, 0.14, AUDIO_CATCH_GAIN, 'triangle')
  blip(1175, t + 0.085, 0.18, AUDIO_CATCH_GAIN * 0.9, 'triangle')
  audioCounts.catch++
}

/** The warrior ceremony. A rising triad, warmer and slower than the catch. */
export function playCeremony() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  blip(523.25, t, 0.34, AUDIO_CEREMONY_GAIN, 'triangle')
  blip(659.25, t + 0.19, 0.34, AUDIO_CEREMONY_GAIN, 'triangle')
  blip(783.99, t + 0.38, 0.62, AUDIO_CEREMONY_GAIN, 'triangle')
  blip(1046.5, t + 0.38, 0.62, AUDIO_CEREMONY_GAIN * 0.4, 'sine')
  audioCounts.ceremony++
}

/** A tap acknowledgement for the creation sheet. Deliberately almost subliminal. */
export function playTick() {
  if (!ctx || !master) return
  blip(920, ctx.currentTime, 0.06, AUDIO_TICK_GAIN, 'sine')
  audioCounts.tick++
}

/**
 * One bird, somewhere. Three to six blips with a pitch flick on each and a
 * random stereo position, so the forest sounds wider than it is.
 */
export function playChirp() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const n = 3 + Math.floor(Math.random() * 4)
  const f0 = 2500 + Math.random() * 1700

  let dest: AudioNode = master
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.4 - 0.7
    pan.connect(master)
    dest = pan
  }

  let at = t
  for (let i = 0; i < n; i++) {
    const dur = 0.05 + Math.random() * 0.035
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const f = f0 * (0.94 + Math.random() * 0.12)
    osc.frequency.setValueAtTime(f, at)
    osc.frequency.linearRampToValueAtTime(f * 1.3, at + dur * 0.4)
    osc.frequency.linearRampToValueAtTime(f * 0.96, at + dur)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, at)
    env.gain.linearRampToValueAtTime(AUDIO_BIRD_GAIN, at + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur)

    osc.connect(env).connect(dest)
    osc.start(at)
    osc.stop(at + dur + 0.02)
    at += dur + 0.04 + Math.random() * 0.055
  }
  audioCounts.bird++
}

/**
 * Crickets: what the birds hand over to. A narrow band of noise up at insect
 * pitch, gated by an LFO so it chirps instead of hissing.
 *
 * Sustained, so it is built the way the purr is built rather than the way a
 * one-shot is: a fresh graph per start, held until the stop fades it out. Two
 * layers, because one gate alone is a metronome and this bed runs for a whole
 * night at a time.
 *
 * It is meant to be barely noticed. AUDIO_CRICKET_GAIN is 0.05 against the
 * meow's 0.34 on purpose: this is the floor under everything else, not a sound
 * she should ever turn her head at.
 */
export function startCrickets() {
  if (!ctx || !master || !noise || cricketing) return
  cricketing = true
  const t = ctx.currentTime

  const out = ctx.createGain()
  // Starts from silence, explicitly, and not from `out.gain.value` the way the
  // purr does. A fresh GainNode defaults to 1, so ramping from its current value
  // opens the bed at full scale, twenty times AUDIO_CRICKET_GAIN, and slides
  // down across the whole fade instead of fading in.
  out.gain.setValueAtTime(0.0001, t)
  out.gain.linearRampToValueAtTime(AUDIO_CRICKET_GAIN, t + AUDIO_CRICKET_FADE)
  out.connect(master)

  const sources = [
    ...chirpLayer(ctx, noise, 4500, AUDIO_CRICKET_RATE, 1, out, t),
    // Higher, quieter, slower. The ratio is the golden-ratio conjugate, which is
    // the standard trick for two periodic things that must never line back up:
    // any tidier fraction gives the bed an audible loop a second or two long,
    // and this thing plays for a whole night at a time.
    ...chirpLayer(ctx, noise, 5400, AUDIO_CRICKET_RATE * 0.618, 0.6, out, t),
  ]

  crickets = { gain: out, sources }
  audioCounts.cricket++
}

export function stopCrickets() {
  if (!ctx || !crickets || !cricketing) return
  cricketing = false
  const t = ctx.currentTime
  const { gain, sources } = crickets
  crickets = null
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(0.0001, t + AUDIO_CRICKET_FADE)
  // Stop after the fade, never on the same tick, or the tail clicks.
  for (const s of sources) s.stop(t + AUDIO_CRICKET_FADE + 0.05)
}

export function isCricketing() {
  return cricketing
}

/**
 * An owl, somewhere out in the trees. Two hoots, the second lower and shorter,
 * panned off to one side like the birds so the forest keeps its width at night.
 *
 * Friendly and far away by construction: soft attack, long release, no dissonant
 * interval and no growl. It is a bird saying hello in the dark, which is the
 * only kind of night sound this game is allowed to make.
 */
export function playOwl() {
  if (!ctx || !master) return
  const t = ctx.currentTime

  let dest: AudioNode = master
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.4 - 0.7
    pan.connect(master)
    dest = pan
  }

  const f = 340 + Math.random() * 60
  hoot(f, t, 0.55, AUDIO_OWL_GAIN, dest)
  hoot(f * 0.86, t + 0.68, 0.42, AUDIO_OWL_GAIN * 0.75, dest)
  audioCounts.owl++
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blip(freq: number, at: number, dur: number, gain: number, type: OscillatorType) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, at)
  env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), at + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(env).connect(master)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/**
 * One hoot. A sine with a slight downward bend, a quiet octave above it for
 * body, and a breath of filtered noise: a bare sine at this pitch is a test
 * tone, and the noise is the whole difference between a tone and a bird.
 */
function hoot(freq: number, at: number, dur: number, gain: number, dest: AudioNode) {
  if (!ctx || !noise) return

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, at)
  osc.frequency.linearRampToValueAtTime(freq * 0.94, at + dur)

  const oct = ctx.createOscillator()
  oct.type = 'sine'
  oct.frequency.setValueAtTime(freq * 2, at)
  oct.frequency.linearRampToValueAtTime(freq * 1.88, at + dur)
  const octGain = ctx.createGain()
  octGain.gain.value = 0.12

  const air = ctx.createBufferSource()
  air.buffer = noise
  air.playbackRate.value = 0.7 + Math.random() * 0.3
  const airBp = ctx.createBiquadFilter()
  airBp.type = 'bandpass'
  airBp.frequency.value = freq * 2.6
  airBp.Q.value = 2.5
  const airGain = ctx.createGain()
  airGain.gain.value = 0.16

  // Attack over the first third and then all the way out. A hard attack down
  // here reads as a foghorn, and this has to sit behind everything else.
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, at)
  env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), at + dur * 0.3)
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur)

  osc.connect(env)
  oct.connect(octGain).connect(env)
  air.connect(airBp).connect(airGain).connect(env)
  env.connect(dest)

  osc.start(at)
  oct.start(at)
  air.start(at)
  osc.stop(at + dur + 0.03)
  oct.stop(at + dur + 0.03)
  air.stop(at + dur + 0.03)
}

/**
 * One layer of crickets: narrow-band noise through a gate the LFO opens.
 *
 * The gate is a WaveShaper and not a bare LFO on the gain, which is the obvious
 * thing to reach for and does not work. A GainNode's gain does not clamp at
 * zero, so a big LFO into it inverts the signal on the negative half rather
 * than clipping toward a square: no gaps between chirps, and as many times too
 * loud as the multiplier. The curve does the clamping instead. It shuts fully
 * between chirps and leaves at zero slope, so the edges cannot click.
 */
function chirpLayer(
  c: AudioContext,
  buf: AudioBuffer,
  band: number,
  rate: number,
  level: number,
  dest: AudioNode,
  at: number,
) {
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  // Jittered the way the paws are, so two layers reading the same two-second
  // buffer do not share a loop point and beat against each other.
  src.playbackRate.value = 0.8 + Math.random() * 0.4

  // Very high Q on purpose. A cricket is nearly a tone; anything wide is hiss.
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = band
  bp.Q.value = 18

  const gate = c.createGain()
  gate.gain.value = 0

  const lfo = c.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = rate
  const shaper = c.createWaveShaper()
  shaper.curve = chirpCurve
  lfo.connect(shaper).connect(gate.gain)

  // Makeup gain. A Q of 18 passes about 400Hz of a 24kHz-wide noise buffer, so
  // what comes out of the filter is around 0.07 RMS where every other voice here
  // hands the mix something near unit scale. Without this, AUDIO_CRICKET_GAIN
  // would not be on the same scale as AUDIO_PURR_GAIN and the bed would land 20x
  // below where its number says it should sit.
  const out = c.createGain()
  out.gain.value = level * 6

  src.connect(bp).connect(gate).connect(out).connect(dest)
  src.start(at)
  lfo.start(at)
  return [src, lfo]
}

/**
 * The cricket gate, as a lookup on the LFO's amplitude. Flat zero below the
 * threshold, so the gate is shut for roughly two thirds of every cycle, and a
 * curved rise above it, so each chirp has an attack rather than an edge. The
 * exponent above 1 is what puts the zero slope at the closing point.
 */
function makeChirpCurve() {
  const n = 257
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  const thresh = 0.55
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = x <= thresh ? 0 : Math.pow((x - thresh) / (1 - thresh), 1.5)
  }
  return curve
}

function makeProbe(n: number) {
  return new Float32Array(new ArrayBuffer(n * 4))
}

/** Two seconds of white noise, built once and shared by every noise voice. */
function makeNoise(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 2)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}
