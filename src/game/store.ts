import { create } from 'zustand'
import {
  CAT_START_HEALTH,
  CAT_START_HUNGER,
  DEFAULT_EYES,
  DEFAULT_PELT,
  DEFAULT_PREFIX,
  CREATE_CAM_START_YAW,
  EYE_COLORS,
  NEED_MAX,
  PELTS,
  SAVE_KEY,
} from './constants'
import { APPRENTICE_SUFFIX, NAME_PREFIXES, nameToast } from '../content/lines'
import { live, resetLive } from './live'
import { resetNeedEdges } from './needs'
import { DEFAULT_SEED } from './rng'
import { groundHeightAt } from './terrain'

export type Phase = 'title' | 'create' | 'playing'

export interface Toast {
  id: number
  text: string
}

/**
 * Who the cat is. Indices into PELTS / EYE_COLORS / NAME_PREFIXES, never the
 * values themselves, so retuning a colour updates the cat she already made.
 */
export interface Identity {
  pelt: number
  eyes: number
  prefix: number
}

export const DEFAULT_IDENTITY: Identity = {
  pelt: DEFAULT_PELT,
  eyes: DEFAULT_EYES,
  prefix: DEFAULT_PREFIX,
}

/** `<Prefix>paw`. The ceremony in the backlog replaces the suffix, not this. */
export function catName(id: Identity): string {
  return NAME_PREFIXES[wrap(id.prefix, NAME_PREFIXES.length)] + APPRENTICE_SUFFIX
}

interface SaveBlob {
  v: 1 | 2
  health: number
  hunger: number
  huntCount: number
  x: number
  z: number
  yaw: number
  // v2 only. A v1 blob has no identity, which is exactly how we know she has
  // never been through creation: no identity means show the creation screen.
  pelt?: number
  eyes?: number
  prefix?: number
}

interface GameState {
  phase: Phase
  /** Successful hunts. Drives the warrior-name ceremony in the backlog. */
  huntCount: number
  /** Bumped whenever the world should rebuild deterministically. */
  seed: number
  /** Transient HUD message. Set on discrete events only. */
  toast: Toast | null

  /** Pelt/eyes/name. Always present so the cat always has something to wear. */
  identity: Identity
  /** False until she taps Begin. Drives whether creation is shown at all. */
  identityChosen: boolean

  start: () => void
  setIdentity: (patch: Partial<Identity>) => void
  beginPlay: () => void
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
  identity: DEFAULT_IDENTITY,
  identityChosen: false,

  // The title tap is also the audio-unlock gesture, so the save is read here
  // rather than later: by this point we know whether she already has a cat.
  start: () => {
    get().load()
    const toCreate = !get().identityChosen
    if (toCreate) {
      // Meet the cat face-on rather than tail-on, and snap so the close-in
      // creation framing is there on the first frame instead of swooping in.
      live.camera.yaw = CREATE_CAM_START_YAW
      live.camera.snap = true
    }
    set({ phase: toCreate ? 'create' : 'playing' })
  },

  // A new object every time, because PlayerCat subscribes to `identity` by
  // reference and only recolours the materials when it actually changes.
  setIdentity: (patch) => set((s) => ({ identity: { ...s.identity, ...patch } })),

  beginPlay: () => {
    // Creation slow-orbits the camera. Snap it back behind the cat so play
    // always starts in the canonical over-the-shoulder framing, and snap rather
    // than lerp so the camera never swings through the cat on the way there.
    live.camera.yaw = 0
    live.camera.pitch = 0.16
    live.camera.snap = true
    set({ phase: 'playing', identityChosen: true })
    get().showToast(nameToast(catName(get().identity)))
    get().save()
  },

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
    const id = get().identity
    const blob: SaveBlob = {
      v: 2,
      health: live.health,
      hunger: live.hunger,
      huntCount: get().huntCount,
      x: live.cat.pos.x,
      z: live.cat.pos.z,
      yaw: live.cat.yaw,
      // Written only once she has actually chosen, so a save made before the
      // Begin tap still routes her back into creation next time.
      ...(get().identityChosen ? { pelt: id.pelt, eyes: id.eyes, prefix: id.prefix } : null),
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
    if (!blob || (blob.v !== 1 && blob.v !== 2)) return false

    // A v1 blob (the build she has already played) keeps every bit of its
    // progress and simply arrives without a cat, which sends her through
    // creation once and then straight back into her own game.
    if (typeof blob.pelt === 'number') {
      set({
        identity: {
          pelt: wrap(Math.floor(blob.pelt), PELTS.length),
          eyes: wrap(Math.floor(numOr(blob.eyes, DEFAULT_EYES)), EYE_COLORS.length),
          prefix: wrap(Math.floor(numOr(blob.prefix, DEFAULT_PREFIX)), NAME_PREFIXES.length),
        },
        identityChosen: true,
      })
    }

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
    // Clearing the identity too is what makes reset() the way to make a new cat.
    set({
      huntCount: 0,
      toast: null,
      identity: DEFAULT_IDENTITY,
      identityChosen: false,
      phase: 'title',
    })
  },
}))

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Keeps a saved index in range if a palette ever shrinks. */
function wrap(v: number, len: number): number {
  if (!Number.isFinite(v) || len <= 0) return 0
  const n = Math.floor(v) % len
  return n < 0 ? n + len : n
}

function clampNeed(v: unknown, fallback: number): number {
  const n = numOr(v, fallback)
  return n < 0 ? 0 : n > NEED_MAX ? NEED_MAX : n
}
