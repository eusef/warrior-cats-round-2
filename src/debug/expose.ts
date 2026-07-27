import { live, resetLive } from '../game/live'
import {
  audioCounts,
  audioLevel,
  audioState,
  isCricketing,
  isPurring,
  playCatch,
  playCeremony,
  playChirp,
  playMeow,
  playOwl,
  playPounce,
  playStep,
  playTick,
  startCrickets,
  startPurr,
  stopCrickets,
  stopPurr,
  unlockAudio,
} from '../audio/engine'
import { catName, useGame, type Identity } from '../game/store'
import { groundHeightAt } from '../game/terrain'
import { DAY_LENGTH_SEC, HUNTS_TO_WARRIOR, NEED_MAX } from '../game/constants'
import { clockString, phaseName, wrapTime } from '../world/daylight'
import { input, setActionHeld } from '../input/useTouchInput'

/** ?debug=1 turns on the overlay and the window bridge. Off by default. */
export const DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('debug') === '1'

/**
 * Systems register their own inspectors here so `stats()` can report on them
 * without expose.ts importing every actor module.
 */
export const debugHooks: {
  dumpPrey?: () => unknown[]
  forcePreyNear?: (dist: number) => number
  /** Colours actually on the cat's materials, not what the store thinks. */
  catColors?: () => Record<string, string>
  /** Tail, ear and squash values the juice pass applied this frame. */
  juice?: () => Record<string, unknown>
  /** Turns the juice pass off live, to A/B it against the raw clips. */
  setJuice?: (on: boolean) => void
} = {}

export interface GameBridge {
  getState: () => Record<string, unknown>
  setState: (patch: Record<string, unknown>) => void
  teleport: (x: number, z: number) => void
  seed: (n: number) => void
  stats: () => Record<string, unknown>
  live: typeof live
  save: () => void
  load: () => boolean
  reset: () => void
  setHunger: (v: number) => void
  setHealth: (v: number) => void
  prey: () => unknown[]
  spawnPreyNear: (dist?: number) => number
  input: typeof input
  stick: (x: number, y: number) => void
  hold: (held: boolean) => void
  identity: () => Record<string, unknown>
  setIdentity: (patch: Partial<Identity>) => void
  beginPlay: () => void
  catColors: () => Record<string, string>
  /**
   * Procedural motion is the one system where a screenshot cannot tell a
   * working feature from one tuned an order of magnitude too low. These are the
   * angles actually applied to the bones this frame.
   */
  juice: () => Record<string, unknown>
  /** `__game.setJuice(false)` reverts the cat to the raw baked clips. */
  setJuice: (on: boolean) => void
  /** Opens the warrior ceremony now, without hunting to the threshold. */
  promote: () => void
  /** Closes it, the way the Continue tap does. */
  endCeremony: () => void
  ceremony: () => Record<string, unknown> | null
  /**
   * Scrubs the clock to a 0..1 fraction, 0 = midnight. One full cycle is
   * DAY_LENGTH_SEC real seconds, so without this every sky assertion means
   * sitting through three minutes of wall clock per pass. Values outside the
   * range wrap rather than throw, so `setTime(-0.1)` is late evening.
   */
  setTime: (t: number) => void
  /** The clock as both the raw fraction and something readable. */
  time: () => Record<string, unknown>
  /**
   * Sound is the one system a screenshot cannot check. `counts` proves the
   * right cue fired, `level` proves it actually reached the master bus.
   */
  audio: {
    state: () => string
    level: () => number
    counts: () => Record<string, number>
    purring: () => boolean
    cricketing: () => boolean
    unlock: () => void
    play: (name: string) => void
  }
  /** Installed by DebugSampler once the R3F root exists. */
  step?: (count?: number, dt?: number) => number
}

export function installBridge() {
  if (!DEBUG || typeof window === 'undefined') return

  const bridge: GameBridge = {
    getState: () => ({
      ...useGame.getState(),
      health: live.health,
      hunger: live.hunger,
      pos: { x: live.cat.pos.x, y: live.cat.pos.y, z: live.cat.pos.z },
      yaw: live.cat.yaw,
      speed: live.cat.speed,
      action: live.cat.action,
      crouched: live.cat.crouched,
      resting: live.resting,
    }),

    setState: (patch) => useGame.setState(patch as never),

    teleport: (x, z) => {
      live.cat.pos.set(x, groundHeightAt(x, z), z)
      live.cat.vel.set(0, 0, 0)
      live.cat.speed = 0
    },

    seed: (n) => useGame.getState().setSeed(n),

    stats: () => {
      const s = {
        fps: Math.round(live.stats.fps),
        drawCalls: live.stats.drawCalls,
        triangles: live.stats.triangles,
        preyActive: live.stats.preyActive,
        health: round2(live.health),
        hunger: round2(live.hunger),
        huntCount: useGame.getState().huntCount,
        huntsToWarrior: Math.max(0, HUNTS_TO_WARRIOR - useGame.getState().huntCount),
        phase: useGame.getState().phase,
        name: catName(useGame.getState().identity),
        warrior: useGame.getState().identity.warrior,
        ceremonyOpen: useGame.getState().ceremony !== null,
        colors: debugHooks.catColors?.() ?? {},
        action: live.cat.action,
        pos: {
          x: round2(live.cat.pos.x),
          y: round2(live.cat.pos.y),
          z: round2(live.cat.pos.z),
        },
        speed: round2(live.cat.speed),
        resting: live.resting,
        time: clockString(live.timeOfDay),
        todPhase: phaseName(live.timeOfDay),
        sunElev: round2(live.sunElev),
        night: round2(live.night),
      }
      // eslint-disable-next-line no-console
      console.log('[stats]', JSON.stringify(s, null, 2))
      return s
    },

    live,
    save: () => useGame.getState().save(),
    load: () => useGame.getState().load(),
    reset: () => {
      useGame.getState().reset()
      resetLive()
    },
    setHunger: (v) => {
      live.hunger = clamp(v, 0, NEED_MAX)
    },
    setHealth: (v) => {
      live.health = clamp(v, 0, NEED_MAX)
    },
    prey: () => debugHooks.dumpPrey?.() ?? [],
    spawnPreyNear: (dist = 4) => debugHooks.forcePreyNear?.(dist) ?? -1,

    input,
    /** Drive the stick without a finger: __game.stick(0, 1) walks forward. */
    stick: (x: number, y: number) => {
      input.move.x = x
      input.move.y = y
      input.moveMag = Math.min(1, Math.hypot(x, y))
    },
    hold: (held: boolean) => setActionHeld(held),

    identity: () => {
      const g = useGame.getState()
      return { ...g.identity, name: catName(g.identity), chosen: g.identityChosen }
    },
    setIdentity: (patch) => useGame.getState().setIdentity(patch),
    beginPlay: () => useGame.getState().beginPlay(),
    catColors: () => debugHooks.catColors?.() ?? {},
    juice: () => ({
      ...(debugHooks.juice?.() ?? {}),
      camDist: round2(live.camera.dist),
    }),
    setJuice: (on: boolean) => debugHooks.setJuice?.(on),
    promote: () => useGame.getState().promote(),
    endCeremony: () => useGame.getState().endCeremony(),
    ceremony: () => {
      const c = useGame.getState().ceremony
      return c ? { ...c } : null
    },

    setTime: (t: number) => {
      live.timeOfDay = wrapTime(t)
    },
    time: () => ({
      // Four places, not round2: a day is one unit wide, so two places quantise
      // the clock to 14 game-minutes and a setTime round-trip assert fails.
      t: round4(live.timeOfDay),
      clock: clockString(live.timeOfDay),
      phase: phaseName(live.timeOfDay),
      // Written by Lighting, so these are last frame's until the loop has run
      // once after a scrub. `__game.step(1)` settles them.
      sunElev: round2(live.sunElev),
      night: round2(live.night),
      lengthSec: DAY_LENGTH_SEC,
    }),

    audio: {
      state: () => audioState(),
      level: () => audioLevel(),
      counts: () => ({ ...audioCounts }),
      purring: () => isPurring(),
      cricketing: () => isCricketing(),
      unlock: () => unlockAudio(),
      play: (name: string) => {
        const voices: Record<string, () => void> = {
          step: () => playStep(1),
          meow: () => playMeow(),
          meowHungry: () => playMeow(true),
          pounce: playPounce,
          catch: playCatch,
          ceremony: playCeremony,
          tick: playTick,
          chirp: playChirp,
          purrOn: startPurr,
          purrOff: stopPurr,
          cricketOn: startCrickets,
          cricketOff: stopCrickets,
          owl: playOwl,
        }
        voices[name]?.()
      },
    },
  }

  ;(window as unknown as { __game: GameBridge }).__game = bridge
  // eslint-disable-next-line no-console
  console.log('[debug] window.__game ready')
}

/**
 * DebugSampler calls this once the R3F root exists, so verification can measure
 * real world-space bounds rather than eyeballing a screenshot.
 */
export function attachSceneToBridge(scene: object, camera: object, gl: object) {
  if (!DEBUG || typeof window === 'undefined') return
  const w = window as unknown as { __game?: Record<string, unknown> }
  if (!w.__game) return
  w.__game.scene = scene
  w.__game.camera = camera
  w.__game.gl = gl
}

/**
 * Publishes the deterministic frame stepper. `__game.step(90)` advances 1.5
 * seconds of game time at a fixed 60Hz delta whether or not the window is
 * visible, which is the only way to verify motion from a driver script.
 */
export function attachStepToBridge(step: (count: number, dt: number) => number) {
  if (!DEBUG || typeof window === 'undefined') return
  const w = window as unknown as { __game?: Record<string, unknown> }
  if (!w.__game) return
  w.__game.step = (count = 60, dt = 1 / 60) => step(count, dt)
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

function round4(v: number) {
  return Math.round(v * 10000) / 10000
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
