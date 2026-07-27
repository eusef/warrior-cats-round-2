import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AUDIO_BIRD_FIRST_GAP,
  AUDIO_BIRD_MAX_GAP,
  AUDIO_BIRD_MIN_GAP,
  AUDIO_STEP_CADENCE_RUN,
  AUDIO_STEP_CADENCE_WALK,
  AUDIO_STEP_CROUCH_MULT,
  AUDIO_STEP_MIN_SPEED,
  CAT_RUN_SPEED,
  CAT_WALK_SPEED,
  HUNGER_LOW_THRESHOLD,
} from '../game/constants'
import { live } from '../game/live'
import { useGame } from '../game/store'
import {
  audioReady,
  isPurring,
  playCatch,
  playCeremony,
  playChirp,
  playMeow,
  playPounce,
  playStep,
  playTick,
  startPurr,
  stopPurr,
} from './engine'

/**
 * The only thing that decides when a sound plays. Nothing else in the game
 * calls the engine, so gameplay code stays audio-free and every trigger is
 * readable in one file.
 *
 * It derives every cue from `live` and from store snapshots rather than being
 * called at the event sites, which means PlayerCat, Prey, CreateCat and the
 * store are all untouched by sound. `cat.eatT` only ever rises on a successful
 * catch, so watching its edge is the same event as the catch itself.
 *
 * Mounted inside the Canvas as the last useFrame subscriber, not outside it
 * with its own rAF. Two reasons: it sees the same delta the game integrated
 * with, so footstep cadence cannot drift from the animation, and it steps under
 * `__game.step()`, so verification can drive it deterministically.
 *
 * Renders nothing. Costs no draw call.
 */
export function AudioDriver() {
  const s = useRef({
    phase: '' as string,
    pounceT: 0,
    eatT: 0,
    hunger: 100,
    ceremonyId: -1,
    pelt: -1,
    eyes: -1,
    prefix: -1,
    /** Has the cat said hello this play session? See the greeting below. */
    greeted: false,
    /** 0..1 through the current stride. Crossing 1 places a paw. */
    stepPhase: 0.85,
    birdT: AUDIO_BIRD_FIRST_GAP,
  })

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const cat = live.cat
    const g = useGame.getState()
    const t = s.current

    // Before the title tap there is no context. Keep the trackers current so
    // unlocking does not fire a backlog of edges on the first audible frame.
    if (!audioReady()) {
      sync(t, g)
      return
    }

    const playing = g.phase === 'playing'

    // --- discrete edges -----------------------------------------------------
    // Her cat's first sound is its own voice. This is a one-shot flag and not a
    // phase edge on purpose: resume() settles a few frames after the tap, and a
    // phase edge had already been consumed by the not-ready sync above by then,
    // so the greeting was silently swallowed every single time.
    if (playing && !t.greeted) {
      playMeow()
      t.greeted = true
    } else if (!playing) {
      t.greeted = false
    }

    if (cat.pounceT > 0 && t.pounceT <= 0) playPounce()

    // eatT only ever rises when a pounce connected. This is the catch.
    if (cat.eatT > 0 && t.eatT <= 0) playCatch()

    const cid = g.ceremony ? g.ceremony.id : -1
    if (cid !== -1 && cid !== t.ceremonyId) playCeremony()

    // A hungry cat asks. Same threshold the HUD turns urgent at.
    if (playing && live.hunger <= HUNGER_LOW_THRESHOLD && t.hunger > HUNGER_LOW_THRESHOLD) {
      playMeow(true)
    }

    if (g.phase === 'create' && t.phase === 'create') {
      const id = g.identity
      if (id.pelt !== t.pelt || id.eyes !== t.eyes || id.prefix !== t.prefix) playTick()
    }

    // --- purr ---------------------------------------------------------------
    // Driven off live.resting directly, not off PlayerCat's wasResting ref:
    // that one is seeded true to suppress a toast, which would have swallowed
    // the purr for a cat that starts the session already sitting in camp.
    const wantPurr = playing && live.resting
    if (wantPurr && !isPurring()) startPurr()
    else if (!wantPurr && isPurring()) stopPurr()

    // --- paws ---------------------------------------------------------------
    const moving =
      playing &&
      cat.speed > AUDIO_STEP_MIN_SPEED &&
      (cat.action === 'walk' || cat.action === 'run' || cat.action === 'crouch')

    if (moving) {
      t.stepPhase += cadenceFor(cat.speed) * delta
      while (t.stepPhase >= 1) {
        t.stepPhase -= 1
        const loud = 0.55 + 0.45 * Math.min(1, cat.speed / CAT_RUN_SPEED)
        playStep(cat.crouched ? loud * AUDIO_STEP_CROUCH_MULT : loud)
      }
    } else {
      // Primed near the top of the stride so the first paw lands within about
      // 70ms of the stick moving, not a full stride later.
      t.stepPhase = 0.85
    }

    // --- birdsong -----------------------------------------------------------
    // Ticked on delta rather than the audio clock so it also advances under
    // __game.step(), which is what makes it verifiable without waiting.
    if (playing || g.phase === 'create') {
      t.birdT -= delta
      if (t.birdT <= 0) {
        playChirp()
        t.birdT = AUDIO_BIRD_MIN_GAP + Math.random() * (AUDIO_BIRD_MAX_GAP - AUDIO_BIRD_MIN_GAP)
      }
    }

    sync(t, g)
  })

  return null
}

type Tracked = {
  phase: string
  pounceT: number
  eatT: number
  hunger: number
  ceremonyId: number
  pelt: number
  eyes: number
  prefix: number
}

function sync(t: Tracked, g: ReturnType<typeof useGame.getState>) {
  t.phase = g.phase
  t.pounceT = live.cat.pounceT
  t.eatT = live.cat.eatT
  t.hunger = live.hunger
  t.ceremonyId = g.ceremony ? g.ceremony.id : -1
  t.pelt = g.identity.pelt
  t.eyes = g.identity.eyes
  t.prefix = g.identity.prefix
}

/**
 * Paw sounds per second. Ramps from silence to the walk cadence across the walk
 * band, then on to the run cadence, so cadence tracks the stick rather than
 * snapping at the walk/run animation cutover.
 */
function cadenceFor(speed: number) {
  if (speed <= CAT_WALK_SPEED) return AUDIO_STEP_CADENCE_WALK * (speed / CAT_WALK_SPEED)
  const k = Math.min(1, (speed - CAT_WALK_SPEED) / (CAT_RUN_SPEED - CAT_WALK_SPEED))
  return AUDIO_STEP_CADENCE_WALK + (AUDIO_STEP_CADENCE_RUN - AUDIO_STEP_CADENCE_WALK) * k
}
