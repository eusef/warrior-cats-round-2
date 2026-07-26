import { create } from 'zustand'
import {
  CAT_START_HEALTH,
  CAT_START_HUNGER,
  NEED_MAX,
  SAVE_KEY,
} from './constants'
import { live, resetLive } from './live'
import { resetNeedEdges } from './needs'
import { DEFAULT_SEED } from './rng'
import { groundHeightAt } from './terrain'

export type Phase = 'title' | 'playing'

export interface Toast {
  id: number
  text: string
}

interface SaveBlob {
  v: 1
  health: number
  hunger: number
  huntCount: number
  x: number
  z: number
  yaw: number
}

interface GameState {
  phase: Phase
  /** Successful hunts. Drives the warrior-name ceremony in the backlog. */
  huntCount: number
  /** Bumped whenever the world should rebuild deterministically. */
  seed: number
  /** Transient HUD message. Set on discrete events only. */
  toast: Toast | null

  start: () => void
  addHunt: () => void
  showToast: (text: string) => void
  clearToast: (id: number) => void
  setSeed: (n: number) => void

  save: () => void
  load: () => boolean
  reset: () => void
}

let toastId = 0

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  huntCount: 0,
  seed: DEFAULT_SEED,
  toast: null,

  start: () => set({ phase: 'playing' }),

  addHunt: () => set((s) => ({ huntCount: s.huntCount + 1 })),

  showToast: (text) => {
    toastId += 1
    set({ toast: { id: toastId, text } })
  },

  clearToast: (id) => {
    if (get().toast?.id === id) set({ toast: null })
  },

  setSeed: (n) => {
    resetLive()
    resetNeedEdges()
    set({ seed: n >>> 0 })
  },

  save: () => {
    const blob: SaveBlob = {
      v: 1,
      health: live.health,
      hunger: live.hunger,
      huntCount: get().huntCount,
      x: live.cat.pos.x,
      z: live.cat.pos.z,
      yaw: live.cat.yaw,
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(blob))
    } catch {
      // Private browsing or a full quota. Losing a save is not worth a crash.
    }
  },

  load: () => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(SAVE_KEY)
    } catch {
      return false
    }
    if (!raw) return false
    let blob: SaveBlob
    try {
      blob = JSON.parse(raw)
    } catch {
      return false
    }
    if (!blob || blob.v !== 1) return false

    live.health = clampNeed(blob.health, CAT_START_HEALTH)
    live.hunger = clampNeed(blob.hunger, CAT_START_HUNGER)
    live.cat.pos.set(
      numOr(blob.x, 0),
      groundHeightAt(numOr(blob.x, 0), numOr(blob.z, 0)),
      numOr(blob.z, 0),
    )
    live.cat.yaw = numOr(blob.yaw, 0)
    live.cat.vel.set(0, 0, 0)
    set({ huntCount: Math.max(0, Math.floor(numOr(blob.huntCount, 0))) })
    return true
  },

  reset: () => {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      /* ignore */
    }
    resetLive() // already places the cat at CAT_SPAWN on the ground
    resetNeedEdges() // otherwise the hunger warning never re-fires after a reset
    set({ huntCount: 0, toast: null })
  },
}))

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clampNeed(v: unknown, fallback: number): number {
  const n = numOr(v, fallback)
  return n < 0 ? 0 : n > NEED_MAX ? NEED_MAX : n
}
