import { create } from 'zustand'
import {
  CAT_START_HEALTH,
  CAT_START_HUNGER,
  DEFAULT_EYES,
  DEFAULT_PELT,
  DEFAULT_PREFIX,
  CREATE_CAM_START_YAW,
  DAY_START_T,
  DUEL_LOSS_HEALTH_FLOOR,
  DUEL_REMATCH_DELAY,
  EYE_COLORS,
  HUNTS_TO_WARRIOR,
  NEED_MAX,
  PELTS,
  RIVAL_FLEE_TIME,
  SAVE_KEY,
  TOAST_DURATION,
  TOAST_DURATION_LONG,
} from './constants'
import {
  APPRENTICE_SUFFIX,
  DUEL_FLEE_LINES,
  DUEL_LOSS_LINES,
  NAME_PREFIXES,
  RIVAL_NAME,
  WARRIOR_SUFFIXES,
  duelStartToast,
  duelWinToast,
  landmarkToast,
  nameToast,
} from '../content/lines'
import { resetCombatant } from './duel'
import { live, resetLive, resetRival } from './live'
import { LANDMARK_ALL_MASK, isDiscovered, withDiscovered } from './landmarks'
import { resetNeedEdges } from './needs'
import { DEFAULT_SEED } from './rng'
import { groundHeightAt } from './terrain'
// daylight.ts reads live and constants and never imports the store, so this
// direction is the only one that exists and there is no cycle.
import { wrapTime } from '../world/daylight'

export type Phase = 'title' | 'create' | 'playing'

/** How a duel ended. 'lost' costs nothing but the moment; see endDuel. */
export type DuelOutcome = 'none' | 'won' | 'lost' | 'fled'

export interface Toast {
  id: number
  text: string
  /** Seconds on screen. Carried per-toast so a discovery can outstay a catch. */
  duration: number
}

/** An open warrior-name ceremony. Null the rest of the time. */
export interface Ceremony {
  id: number
  /** The name she is leaving behind, e.g. `Firepaw`. */
  from: string
  /** The name she is being given, e.g. `Fireheart`. */
  to: string
}

/**
 * Who the cat is. Indices into PELTS / EYE_COLORS / NAME_PREFIXES, never the
 * values themselves, so retuning a colour updates the cat she already made.
 *
 * `warrior` is the whole of the ceremony's persisted state. The suffix is
 * looked up with the prefix index she already chose, so earning a warrior name
 * costs the save one boolean and not a second index to keep in sync.
 */
export interface Identity {
  pelt: number
  eyes: number
  prefix: number
  warrior: boolean
}

export const DEFAULT_IDENTITY: Identity = {
  pelt: DEFAULT_PELT,
  eyes: DEFAULT_EYES,
  prefix: DEFAULT_PREFIX,
  warrior: false,
}

/** `<Prefix>paw`. What she is called until the ceremony. */
export function apprenticeName(id: Identity): string {
  return NAME_PREFIXES[wrap(id.prefix, NAME_PREFIXES.length)] + APPRENTICE_SUFFIX
}

/**
 * `<Prefix><Suffix>`, the book name for that prefix. Wrapped against
 * WARRIOR_SUFFIXES separately so a length mismatch between the two lists is a
 * wrong suffix rather than an undefined splices into the name.
 */
export function warriorName(id: Identity): string {
  const i = wrap(id.prefix, NAME_PREFIXES.length)
  return NAME_PREFIXES[i] + WARRIOR_SUFFIXES[wrap(i, WARRIOR_SUFFIXES.length)]
}

/** The single composition point. Every consumer follows this branch for free. */
export function catName(id: Identity): string {
  return id.warrior ? warriorName(id) : apprenticeName(id)
}

/**
 * Where the two-iPad session is up to. 'lost' is a peer that was connected and
 * went away; 'failed' never got there at all.
 */
export type NetStatus = 'idle' | 'signaling' | 'connected' | 'lost' | 'failed'

export interface NetState {
  status: NetStatus
  role: 'host' | 'guest' | null
  /** The four-character session id, once one exists. */
  room: string | null
  /** Derived locally from the peer's identity indices. No text crosses the wire. */
  peerName: string | null
  /** The peer's identity, for recolouring their cat. Null until `hello` arrives. */
  peerIdentity: Identity | null
  /** A kid-readable failure line, already looked up from lines.ts. */
  error: string | null
}

/**
 * What the game WANTS the network to be doing. This file must not import
 * anything from src/net/ -- the networking layer imports the store, so the
 * other direction is a cycle, and keeping WebRTC out of the game-state module
 * is worth an indirection on its own. So the store only ever states the intent
 * and NetDriver, which may import both, is the thing that acts on it.
 */
export interface NetWant {
  kind: 'idle' | 'host' | 'join'
  room: string | null
}

const NET_IDLE: NetState = {
  status: 'idle',
  role: null,
  room: null,
  peerName: null,
  peerIdentity: null,
  error: null,
}

const NET_WANT_IDLE: NetWant = { kind: 'idle', room: null }

interface SaveBlob {
  v: 1 | 2 | 3 | 4 | 5
  health: number
  hunger: number
  huntCount: number
  x: number
  z: number
  yaw: number
  // v2 and up. A v1 blob has no identity, which is exactly how we know she has
  // never been through creation: no identity means show the creation screen.
  pelt?: number
  eyes?: number
  prefix?: number
  // v3 only. Absent means apprentice, so a v2 cat loads with every hunt intact
  // and simply has the ceremony still ahead of her.
  warrior?: boolean
  // v4 only. Absent means the save predates the day/night cycle, so it lands on
  // DAY_START_T and she wakes in the same mid-morning light a new cat gets,
  // rather than at whatever midnight a missing number would default to.
  tod?: number
  // v5 only. A bitmask of discovered landmarks. Absent means a save from before
  // there were any, so she arrives with all three still to find, which is the
  // correct answer: she has genuinely never been to them.
  found?: number
}

interface GameState {
  phase: Phase
  /** Successful hunts. Drives the warrior-name ceremony in the backlog. */
  huntCount: number
  /** Bumped whenever the world should rebuild deterministically. */
  seed: number
  /** Transient HUD message. Set on discrete events only. */
  toast: Toast | null

  /** Bitmask of landmarks she has found. Bit position is the landmark id. */
  discovered: number
  /** Bumped on every discovery. AudioDriver watches this for its edge. */
  discoverCount: number

  /** Pelt/eyes/name. Always present so the cat always has something to wear. */
  identity: Identity
  /** False until she taps Begin. Drives whether creation is shown at all. */
  identityChosen: boolean

  /** Armed by the qualifying hunt, spent when the eat beat frees the screen. */
  pendingCeremony: boolean
  /** Non-null only while the ceremony overlay is up. Never a `phase`. */
  ceremony: Ceremony | null

  start: () => void
  setIdentity: (patch: Partial<Identity>) => void
  beginPlay: () => void
  addHunt: () => void
  promote: () => void
  endCeremony: () => void
  discover: (id: number) => void

  /**
   * Duel state, deliberately coarse. Everything that ticks — each cat's phase,
   * its timer, the active move, both health values — lives on `live` and is
   * read by useFrame and by the HUD's rAF loop instead. A store write per phase
   * transition would re-render the HUD around eight times a second for nothing,
   * and R3F rule 1 in CLAUDE.md exists precisely to stop that.
   *
   * This is the one place the combat spec is not followed literally: it says
   * health, phase, move and timer live in the store, one sentence before saying
   * the timers tick on refs inside useFrame. The refs win.
   */
  duelActive: boolean
  duelId: number
  duelOutcome: DuelOutcome
  /** Monotonic. Only ever an edge source for the audio driver. */
  duelCount: number
  startDuel: () => void
  endDuel: (outcome: DuelOutcome) => void

  /**
   * The two-iPad session. Deliberately NOT saved: a session does not survive a
   * reload, because the PRD requires a fresh scan and promises no
   * auto-reconnect. Written by NetDriver from WebRTC callbacks, which are
   * events and not frames, so a store write there is legal under R3F rule 1.
   * The pose that arrives every frame goes to `live.remote` instead.
   */
  net: NetState
  /** Intent only. NetDriver watches this and does the actual connecting. */
  netWant: NetWant
  /**
   * A room id parked between the scan and the start of play. A friend who scans
   * the QR may have no save at all, so start() routes her to creation, and
   * joining there would drop the connect overlay on top of the creation sheet
   * while she is choosing a pelt. The join fires from beginPlay() instead.
   */
  pendingJoinRoom: string | null

  setNet: (patch: Partial<NetState>) => void
  netHost: () => void
  netJoin: (room: string) => void
  netLeave: () => void
  setPendingJoin: (room: string | null) => void

  showToast: (text: string, duration?: number) => void
  clearToast: (id: number) => void
  setSeed: (n: number) => void

  save: () => void
  load: () => boolean
  reset: () => void
}

let toastId = 0
let ceremonyId = 0
let duelId = 0

/** Rotate through a line set by a counter, so repeats are spread out rather
 *  than random. Same shape as the pick() helpers in PlayerCat. */
function pickLine(lines: readonly string[], n: number): string {
  return lines[Math.abs(Math.floor(n)) % lines.length]
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  huntCount: 0,
  seed: DEFAULT_SEED,
  toast: null,
  discovered: 0,
  discoverCount: 0,
  identity: DEFAULT_IDENTITY,
  identityChosen: false,
  pendingCeremony: false,
  ceremony: null,
  duelActive: false,
  duelId: 0,
  duelOutcome: 'none',
  duelCount: 0,
  net: NET_IDLE,
  netWant: NET_WANT_IDLE,
  pendingJoinRoom: null,

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
    // A scanned room waits here rather than connecting from start(), because a
    // friend with no save goes through creation first and the connect overlay
    // would sit on top of the sheet while she is picking a pelt. Cleared before
    // the join so a second Begin cannot fire the same room twice.
    const room = get().pendingJoinRoom
    if (room) {
      set({ pendingJoinRoom: null })
      get().netJoin(room)
    }
  },

  // Arms the ceremony rather than opening it. The catch toast has only just
  // gone up and the eat beat still has a second to run, so opening here would
  // put the biggest moment in the game behind a chewing animation. PlayerCat
  // spends the flag when the cat finishes eating and the screen is free.
  //
  // `>=`, not `===`: a save from before this feature can arrive already past
  // the threshold, and she should get the ceremony on her next catch rather
  // than never.
  addHunt: () =>
    set((s) => {
      const huntCount = s.huntCount + 1
      return {
        huntCount,
        pendingCeremony:
          s.pendingCeremony || (!s.identity.warrior && huntCount >= HUNTS_TO_WARRIOR),
      }
    }),

  promote: () => {
    const s = get()
    if (s.identity.warrior) return // ceremony is once, ever
    const identity = { ...s.identity, warrior: true }
    ceremonyId += 1
    set({
      identity,
      pendingCeremony: false,
      // The catch toast is still up for another second. Clear it rather than
      // leave it sitting behind the dim while the ceremony reads.
      toast: null,
      ceremony: { id: ceremonyId, from: apprenticeName(s.identity), to: warriorName(identity) },
    })
    // Written immediately: the name is the one thing she would be upset to
    // lose, and the next timed save is up to ten seconds away.
    get().save()
  },

  endCeremony: () => set({ ceremony: null }),

  // Entering a duel. Guarded on the rival actually being there and idle, so a
  // stale Fight tap arriving a frame after she wandered out of range, or after
  // a duel already started, cannot open a second one.
  startDuel: () => {
    if (!live.rival.active || live.duel.active || live.duel.rematchT > 0) return
    resetCombatant(live.cat.duel)
    resetCombatant(live.rival.duel)
    live.duel.active = true
    live.duel.fleeing = false
    // The stage geometry is laid out one call later, by PlayerCat, because it
    // needs the tree list and this file cannot reach the world without a cycle.
    // See openStage in game/arena.ts.
    live.duel.onStage = false
    live.duel.endT = 0
    live.rival.decideT = 0
    live.rival.repositionT = 0
    live.rival.fleeT = 0
    duelId += 1
    set((s) => ({
      duelActive: true,
      duelId,
      duelOutcome: 'none',
      duelCount: s.duelCount + 1,
    }))
    get().showToast(duelStartToast(RIVAL_NAME))
  },

  // Leaving one, by any of the three exits: she yields, you back off, or you
  // run. Nobody dies and nothing is lost in any of them. Health is floored on a
  // loss rather than left at zero, because a cat sitting on an empty bar would
  // then starve-drain in needs.ts the moment the duel closed.
  endDuel: (outcome) => {
    if (!live.duel.active) return
    live.duel.active = false
    live.duel.fleeing = false
    live.duel.onStage = false
    live.duel.endT = 0
    live.duel.lock = 0
    live.duel.rematchT = DUEL_REMATCH_DELAY
    resetCombatant(live.cat.duel)
    resetCombatant(live.rival.duel)
    if (outcome === 'lost' && live.health < DUEL_LOSS_HEALTH_FLOOR) {
      live.health = DUEL_LOSS_HEALTH_FLOOR
    }
    // She runs off on a win or a loss alike; on a flee she is left where she is
    // and simply goes back to wandering her patch.
    if (outcome !== 'fled') live.rival.fleeT = RIVAL_FLEE_TIME

    const s = get()
    set({ duelActive: false, duelOutcome: outcome })
    if (outcome === 'won') {
      get().showToast(duelWinToast(RIVAL_NAME, s.huntCount))
    } else if (outcome === 'lost') {
      get().showToast(pickLine(DUEL_LOSS_LINES, s.huntCount))
    } else {
      get().showToast(pickLine(DUEL_FLEE_LINES, s.huntCount))
    }
    get().save()
  },

  // A new object every time, so the connect overlay re-renders on a status
  // change. Shallow, because NetDriver reports one thing at a time: the room id
  // arrives long before the peer's identity does.
  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),

  // The room id is left null here on purpose. newRoomId() lives in src/net/,
  // which this file may not import, so NetDriver mints it and writes it back
  // through setNet the moment it has one.
  netHost: () =>
    set({
      netWant: { kind: 'host', room: null },
      net: {
        status: 'signaling',
        role: 'host',
        room: null,
        peerName: null,
        peerIdentity: null,
        error: null,
      },
    }),

  netJoin: (room) =>
    set({
      netWant: { kind: 'join', room },
      net: {
        status: 'signaling',
        role: 'guest',
        room,
        peerName: null,
        peerIdentity: null,
        error: null,
      },
    }),

  // Only states the intent. NetDriver's effect sees `kind` go back to 'idle',
  // sends `bye` and disposes the peer, which is the one place that can.
  netLeave: () => set({ netWant: NET_WANT_IDLE, net: NET_IDLE }),

  setPendingJoin: (room) => set({ pendingJoinRoom: room }),

  showToast: (text, duration = TOAST_DURATION) => {
    toastId += 1
    set({ toast: { id: toastId, text, duration } })
  },

  // The one place a landmark is ever marked found. Guards against a repeat so
  // the toast and the sting cannot double-fire on a frame boundary, then writes
  // the save immediately: walking somewhere new is exactly the moment she is
  // most likely to be interrupted, and the next timed save is up to ten seconds
  // away. Fires last within the frame in PlayerCat, so a discovery landing on
  // the same frame as a catch wins the (unqueued) toast slot.
  discover: (id) => {
    const s = get()
    if (isDiscovered(s.discovered, id)) return
    set({
      discovered: withDiscovered(s.discovered, id),
      discoverCount: s.discoverCount + 1,
    })
    get().showToast(landmarkToast(id), TOAST_DURATION_LONG)
    get().save()
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
      v: 5,
      health: live.health,
      hunger: live.hunger,
      huntCount: get().huntCount,
      x: live.cat.pos.x,
      z: live.cat.pos.z,
      yaw: live.cat.yaw,
      // From live, like the position and the needs above: Lighting advances the
      // clock every frame and never pushes it through the store.
      tod: live.timeOfDay,
      found: get().discovered,
      // Written only once she has actually chosen, so a save made before the
      // Begin tap still routes her back into creation next time.
      ...(get().identityChosen
        ? { pelt: id.pelt, eyes: id.eyes, prefix: id.prefix, warrior: id.warrior }
        : null),
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
    // Widen this every time the version goes up. A version this does not name
    // is discarded, which silently throws away her whole game.
    if (
      !blob ||
      (blob.v !== 1 && blob.v !== 2 && blob.v !== 3 && blob.v !== 4 && blob.v !== 5)
    )
      return false

    // A v1 blob (the build she has already played) keeps every bit of its
    // progress and simply arrives without a cat, which sends her through
    // creation once and then straight back into her own game. A v2 blob keeps
    // its cat and arrives as an apprentice, with the ceremony still to come.
    if (typeof blob.pelt === 'number') {
      set({
        identity: {
          pelt: wrap(Math.floor(blob.pelt), PELTS.length),
          eyes: wrap(Math.floor(numOr(blob.eyes, DEFAULT_EYES)), EYE_COLORS.length),
          prefix: wrap(Math.floor(numOr(blob.prefix, DEFAULT_PREFIX)), NAME_PREFIXES.length),
          warrior: blob.warrior === true,
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
    // A duel never survives a load. Unreachable in the real game -- the only
    // route back to the title is reset(), which already does this -- but a
    // half-open duel restored under a fresh cat would be a genuinely confusing
    // thing to debug, and closing it is one line.
    resetRival()
    // Wrapped rather than trusted: a hand-edited or drifted blob outside [0, 1)
    // would otherwise put the sun somewhere the palette never keys.
    live.timeOfDay = wrapTime(numOr(blob.tod, DAY_START_T))
    // Masked to the landmarks that actually exist: a hand-edited blob, or one
    // written by a later build with a fourth landmark, would otherwise set a bit
    // no entry exists for and `discoveredCount` would read 4 of 3.
    set({
      huntCount: Math.max(0, Math.floor(numOr(blob.huntCount, 0))),
      discovered: Math.floor(numOr(blob.found, 0)) & LANDMARK_ALL_MASK,
    })
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
      // Cleared, so a fresh cat rediscovers all three. discoverCount is not
      // reset: it is only ever an edge source for audio, and rewinding it to 0
      // would make the first discovery of the new game compare equal to the
      // tracker and swallow its sting.
      discovered: 0,
      identity: DEFAULT_IDENTITY,
      identityChosen: false,
      pendingCeremony: false,
      ceremony: null,
      // resetLive has already put the rival back on her patch and closed any
      // duel. duelCount is left alone for the same reason as discoverCount:
      // rewinding it to 0 would make the next duel compare equal to the audio
      // driver's tracker and swallow its cue.
      duelActive: false,
      duelOutcome: 'none',
      // Back to idle, which NetDriver reads as "drop the peer". Unlike the two
      // counters above these carry no edge for anything to compare against, so
      // there is nothing to swallow by rewinding them.
      net: NET_IDLE,
      netWant: NET_WANT_IDLE,
      pendingJoinRoom: null,
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
