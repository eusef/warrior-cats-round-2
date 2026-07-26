import { live, resetLive } from '../game/live'
import { useGame } from '../game/store'
import { groundHeightAt } from '../game/terrain'
import { NEED_MAX } from '../game/constants'
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
        phase: useGame.getState().phase,
        action: live.cat.action,
        pos: {
          x: round2(live.cat.pos.x),
          y: round2(live.cat.pos.y),
          z: round2(live.cat.pos.z),
        },
        speed: round2(live.cat.speed),
        resting: live.resting,
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

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
