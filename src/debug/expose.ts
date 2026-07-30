import { alongOf, lateralOf, startMove, type Combatant } from '../game/duel'
import { logMove } from './duelLog'
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
  playImpact,
  playKick,
  playMeow,
  playOwl,
  playPounce,
  playStep,
  playSwipe,
  playTick,
  playWhiff,
  startCrickets,
  startPurr,
  stopCrickets,
  stopPurr,
  unlockAudio,
} from '../audio/engine'
import { catName, useGame, type Identity } from '../game/store'
import { groundHeightAt } from '../game/terrain'
import { LANDMARKS, discoveredCount, isDiscovered, landmarkDistance } from '../game/landmarks'
import {
  DAY_LENGTH_SEC,
  HUNTS_TO_WARRIOR,
  NEED_MAX,
  RIVAL_START_HEALTH,
} from '../game/constants'
import { clockString, phaseName, wrapTime } from '../world/daylight'
import { input, setActionHeld } from '../input/useTouchInput'
// Type-only, all three, and that is load-bearing rather than tidy. A value
// import here would pull the whole networking layer -- Peer, RTCPeerConnection,
// the relay socket -- into a module main.tsx loads on every single boot,
// including every solo one. `import type` is erased entirely at build time, so
// this file knows the SHAPE of a session and carries none of the machinery.
import type { NetDebug, NetInfo } from '../net/NetDriver'
import type { NetMsg } from '../net/protocol'

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
  /** The rival's live state, read off `live` rather than the store. */
  rival?: () => Record<string, unknown>
  /**
   * The two-iPad session, registered by NetDriver and by nothing else. Typed
   * through a type-only import, so naming it here costs this module no runtime
   * dependency on `src/net/` at all. See the `net` bridge members below for why
   * the whole seam exists.
   */
  net?: NetDebug
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
  /** `setHealth(40)` hurts the player; `setHealth(40, 12)` sets up a duel
   *  she is about to win. The second argument is the spec's addition and the
   *  one-argument form still behaves exactly as it always did. */
  setHealth: (player: number, enemy?: number) => void
  startDuel: (dist?: number) => void
  endDuel: () => void
  forceMove: (move: string) => boolean
  forceEnemyMove: (move: string) => boolean
  setDistance: (n: number) => void
  duel: () => Record<string, unknown>
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
  /** Every landmark with its live distance, so discovery is asserted not guessed. */
  landmarks: () => Array<{
    id: number
    name: string
    found: boolean
    dist: number
    trigger: number
  }>
  /** Marks one found without walking there, for save round-trip checks. */
  discover: (id: number) => void
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
  /**
   * The two-iPad session, and the one seam in this file that exists because a
   * machine cannot do something rather than because a screenshot cannot show it.
   *
   * THIS CHROME CANNOT COMPLETE AN ICE HANDSHAKE. Bisected during Phase 0 all
   * the way down to two RTCPeerConnections in one tab, over loopback, with zero
   * application code between them: they never pair. So the real transport is not
   * verifiable on this machine at all, and pretending otherwise would mean
   * reporting the whole of Phase 1 unverified.
   *
   * `netFake` installs a stub peer that constructs no RTCPeerConnection, talks
   * to no relay and needs no network, then drives the same connected path a real
   * peer drives. `netInject` is the receive half of the wire and `netOutbox` the
   * send half. Between them every consequence of a message is assertable --
   * toasts, identity, the guest spawn, the shared clock, RemoteCat's chase --
   * leaving only the handshake itself for the iPads, which is exactly where
   * Phase 0 already settled it: two devices, 3.6 seconds, `host / host`.
   *
   * Null whenever NetDriver is not mounted. Never throws in solo play.
   */
  net: () => NetInfo | null
  /** Feed the receive path a message as if it arrived over the data channel. */
  netInject: (msg: NetMsg) => void
  /** The last messages actually SENT, newest last. Recorded DEBUG-only. */
  netOutbox: () => NetMsg[]
  netClearOutbox: () => void
  /** Connect to a stub peer. No RTCPeerConnection, no relay, no network. */
  netFake: (role: 'host' | 'guest') => void
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
      // A session, or nothing. NetDriver is mounted on every boot, so `info()`
      // answers even in solo play and reads back status 'idle' with a null role,
      // which is six fields of noise on every readout that will never be about
      // the network. Gated on there being something to say instead.
      const n = debugHooks.net?.info() ?? null
      const session = n && n.status !== 'idle' ? n : null
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
        places: `${discoveredCount(useGame.getState().discovered)}/${LANDMARKS.length}`,
        discovered: LANDMARKS.filter((l) => isDiscovered(useGame.getState().discovered, l.id)).map(
          (l) => l.name,
        ),
        // Six fields out of NetInfo's sixteen: whether the link is up, which end
        // this is, which room, who is on the other end, how far away they feel,
        // and whether their cat is actually being drawn. `__game.net()` has the
        // rest, including every eased and wire value RemoteCat is chasing.
        // Spread away entirely when there is no session, so a solo readout is
        // byte for byte what it was before Phase 1.
        ...(session
          ? {
              net: {
                status: session.status,
                role: session.role,
                room: session.room,
                peerName: session.peerName,
                rtt: session.rtt,
                remote: session.present,
              },
            }
          : null),
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
    setHealth: (player, enemy) => {
      live.health = clamp(player, 0, NEED_MAX)
      if (typeof enemy === 'number') live.rival.health = clamp(enemy, 0, NEED_MAX)
    },

    /**
     * Put a rival at `dist` metres dead ahead and open a duel, without walking
     * anywhere. Returns nothing useful; read __game.duel() afterwards.
     *
     * The rival is placed in front of the CAT's heading rather than the
     * camera's, so a forced move fired straight afterwards is inside the
     * forward arc and the reach test is testing reach rather than aim.
     */
    startDuel: (dist = 3) => {
      const r = live.rival
      r.active = true
      r.health = RIVAL_START_HEALTH
      live.duel.rematchT = 0
      live.duel.fleeing = false
      r.fleeT = 0
      placeRival(dist)
      useGame.getState().startDuel()
      return undefined as unknown as void
    },

    endDuel: () => useGame.getState().endDuel('fled'),

    /** Stage a move without a button. Returns false if she is not neutral,
     *  which is the same answer a real tap would have got. */
    forceMove: (move: string) => forceOn(live.cat.duel, move, 'player'),
    forceEnemyMove: (move: string) => forceOn(live.rival.duel, move, 'rival'),

    /** Exact gap for reach testing. Keeps the rival on the cat's heading so
     *  only distance is under test, never the arc. */
    setDistance: (n: number) => placeRival(n),

    duel: () => ({
      active: live.duel.active,
      inRange: live.duel.inRange,
      gap: round2(live.duel.gap),
      fleeing: live.duel.fleeing,
      endT: round2(live.duel.endT),
      rematchT: round2(live.duel.rematchT),
      lock: round2(live.duel.lock),
      camDist: round2(live.camera.dist),
      // The fight line. `lateral` is the one to watch: it is the distance each
      // cat is OFF the line, and the whole left-and-right-only claim is the
      // assertion that both stay at 0 for the length of a fight.
      // Named `line`, not `stage`: `stage` was already taken by the
      // active/idle readout below and this is the fight line, not that.
      onStage: live.duel.onStage,
      camSide: live.duel.camSide,
      line: {
        ax: round3(live.duel.stage.ax),
        az: round3(live.duel.stage.az),
        cx: round2(live.duel.stage.cx),
        cz: round2(live.duel.stage.cz),
        neg: round2(live.duel.stage.neg),
        pos: round2(live.duel.stage.pos),
      },
      along: {
        player: round3(alongOf(live.cat.pos.x, live.cat.pos.z, live.duel.stage)),
        rival: round3(alongOf(live.rival.pos.x, live.rival.pos.z, live.duel.stage)),
      },
      lateral: {
        player: round3(lateralOf(live.cat.pos.x, live.cat.pos.z, live.duel.stage)),
        rival: round3(lateralOf(live.rival.pos.x, live.rival.pos.z, live.duel.stage)),
      },
      stage: useGame.getState().duelActive ? 'active' : 'idle',
      outcome: useGame.getState().duelOutcome,
      duelCount: useGame.getState().duelCount,
      player: {
        health: round2(live.health),
        phase: live.cat.duel.phase,
        move: live.cat.duel.move ?? 'none',
        phaseT: round2(live.cat.duel.phaseT),
        action: live.cat.action,
        speed: round2(live.cat.speed),
        locked: live.cat.duel.phase !== 'neutral',
      },
      rival: debugHooks.rival?.() ?? { active: false },
    }),
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

    // Distances are in each landmark's own shape terms, so `dist < trigger` is
    // exactly the condition the game tests. Verification reads this rather than
    // guessing from pixels.
    landmarks: () =>
      LANDMARKS.map((l) => ({
        id: l.id,
        name: l.name,
        found: isDiscovered(useGame.getState().discovered, l.id),
        dist: Number(landmarkDistance(l, live.cat.pos.x, live.cat.pos.z).toFixed(2)),
        trigger: l.trigger,
      })),

    discover: (id: number) => useGame.getState().discover(id),

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
          swipe: playSwipe,
          kick: playKick,
          impact: playImpact,
          whiff: playWhiff,
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

    // Registered by NetDriver, so every one of these is null-safe: solo play
    // never mounts a session and `debugHooks.net` is simply absent. The floors
    // are chosen so a caller never has to check -- `net()` reads null, the outbox
    // reads empty -- rather than throwing on the machine that cannot connect.
    net: () => debugHooks.net?.info() ?? null,
    netInject: (msg: NetMsg) => debugHooks.net?.inject(msg),
    netOutbox: () => debugHooks.net?.outbox() ?? [],
    netClearOutbox: () => debugHooks.net?.clearOutbox(),
    netFake: (role: 'host' | 'guest') => debugHooks.net?.fake(role),
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

/**
 * Place the rival exactly `dist` metres along the cat's own heading, on the
 * ground, facing back at her. Uses the CAT's yaw and not the camera's on
 * purpose: a reach test staged off the camera would silently be an arc test as
 * soon as the orbit drifted, and every "reach is wrong" result would be a lie.
 */
function placeRival(dist: number) {
  const cat = live.cat
  const fx = -Math.sin(cat.yaw)
  const fz = -Math.cos(cat.yaw)
  const x = cat.pos.x + fx * dist
  const z = cat.pos.z + fz * dist
  live.rival.pos.set(x, groundHeightAt(x, z), z)
  live.rival.vel.set(0, 0, 0)
  live.rival.speed = 0
  live.rival.yaw = cat.yaw + Math.PI
  live.duel.gap = dist
}

function forceOn(c: Combatant, move: string, who: 'player' | 'rival') {
  if (move !== 'swipe' && move !== 'pounce' && move !== 'jumpkick') {
    // eslint-disable-next-line no-console
    console.warn(`[duel] no such move: ${move}`)
    return false
  }
  const ok = startMove(c, move)
  // Logged here as well as in the actors: a forced move goes straight into the
  // machine and never passes the button path, so without this line a staged
  // move is invisible in the log and only its outcome shows up.
  if (ok) logMove(who, move, live.duel.gap, false, 0, 'windup (forced)', live.health, live.rival.health)
  // eslint-disable-next-line no-console
  else console.warn(`[duel] ${who} is ${c.phase}, not neutral -- move refused`)
  return ok
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000
}

function round4(v: number) {
  return Math.round(v * 10000) / 10000
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
