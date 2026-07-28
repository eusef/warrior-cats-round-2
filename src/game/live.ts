import * as THREE from 'three'
import {
  CAM_DISTANCE,
  CAT_SPAWN,
  CAT_START_HEALTH,
  CAT_START_HUNGER,
  DAY_START_T,
  NEED_MAX,
  RIVAL_SPAWN,
  RIVAL_START_HEALTH,
} from './constants'
import { Combatant, makeCombatant, resetCombatant } from './duel'
import { groundHeightAt } from './terrain'

export type CatAction =
  | 'idle'
  | 'walk'
  | 'run'
  | 'crouch'
  | 'pounce'
  | 'eat'
  | 'rest'
  // Combat. 'kick' is aliased onto the pounce clip in useCatAnimation rather
  // than getting a slot of its own: both want Gallop_Jump, and two slots
  // resolving to one clip share a single AnimationAction and fight over its
  // weight.
  | 'swipe'
  | 'kick'
  | 'hit'
  | 'stagger'

/**
 * Per-frame mutable game state. Written from useFrame, read from useFrame and
 * from the HUD's own rAF loop. Never goes through React or zustand, because a
 * setState per frame is the single biggest framerate killer in an R3F app.
 *
 * Discrete, event-shaped state lives in store.ts instead.
 */
export const live = {
  // Needs, ticked continuously. The HUD writes these straight to DOM styles.
  health: CAT_START_HEALTH,
  hunger: CAT_START_HUNGER,

  cat: {
    pos: new THREE.Vector3(0, 0, 0),
    /** Horizontal velocity. y is unused; pounce hop is baked into hopHeight. */
    vel: new THREE.Vector3(0, 0, 0),
    /** Facing, radians. 0 = -Z. */
    yaw: 0,
    /** Horizontal speed in m/s, drives the walk/run animation blend. */
    speed: 0,
    crouched: false,
    /** Seconds remaining in the pounce arc, 0 when not pouncing. */
    pounceT: 0,
    /** Seconds until another pounce is allowed. */
    pounceCooldown: 0,
    /** Seconds remaining in the eat beat, 0 when not eating. */
    eatT: 0,
    /** Extra height above the ground from the pounce arc. */
    hopHeight: 0,
    action: 'idle' as CatAction,
    /** Her side of the duel machine. Neutral whenever no duel is running. */
    duel: makeCombatant() as Combatant,
  },

  /**
   * The rival cat. Exists in the world whenever `active`, whether or not a duel
   * is running: she wanders her patch until Mila walks into her.
   *
   * This mirrors `live.cat` field for field on purpose, so RivalCat.tsx and
   * PlayerCat.tsx can share the same duel machine and the same animator without
   * a "player version" and a "CPU version" of anything.
   */
  rival: {
    active: false,
    pos: new THREE.Vector3(RIVAL_SPAWN[0], 0, RIVAL_SPAWN[1]),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    speed: 0,
    health: RIVAL_START_HEALTH,
    hopHeight: 0,
    action: 'idle' as CatAction,
    duel: makeCombatant() as Combatant,
    /** Seconds of running left after yielding, then she despawns. */
    fleeT: 0,
    /** Seconds until the next AI decision while duelling. */
    decideT: 0,
    /** Seconds left of a back-off-and-circle. */
    repositionT: 0,
    /** Which way she circles during a reposition. +1 or -1. */
    circleDir: 1,
    /** Wander target while no duel is running. */
    wanderX: RIVAL_SPAWN[0],
    wanderZ: RIVAL_SPAWN[1],
    wanderT: 0,
  },

  /**
   * Duel-level state. The stage that matters to React is mirrored into the
   * store on the handful of frames it changes; everything here is read by the
   * HUD's rAF loop and by useFrame, so proximity costs no re-renders at all.
   */
  duel: {
    /** A duel is running right now. */
    active: false,
    /** Player is inside DUEL_PROMPT_RADIUS of an idle rival: show Fight. */
    inRange: false,
    /** Centre-to-centre metres between the two cats, or Infinity if no rival. */
    gap: Infinity,
    /** Run away was tapped and the duel is closing once she is clear. */
    fleeing: false,
    /** Seconds of yield beat left before a finished duel actually closes. */
    endT: 0,
    /** Seconds before the rival can be challenged again. */
    rematchT: 0,
    /** 0..1 blend of the soft lock-on, eased so the camera never snaps. */
    lock: 0,
  },

  camera: {
    /** Orbit yaw offset applied on top of the cat's heading. */
    yaw: 0,
    pitch: 0.16,
    /** Set for one frame to place the camera instantly instead of lerping. */
    snap: false,
    /** Current follow distance, opened up by the speed dolly. Read-only outside FollowCamera. */
    dist: CAM_DISTANCE,
  },

  /** True while the cat is inside the camp radius and not moving. */
  resting: false,

  // Time of day, 0..1, 0 = midnight. Advanced by Lighting, which is the first
  // useFrame subscriber inside <Suspense>, so everything downstream reads this
  // frame's value rather than last frame's.
  timeOfDay: DAY_START_T,
  /** 0 = full day, 1 = deep night. Sampled from SKY_KEYS by Lighting. */
  night: 0,
  /** Sun elevation in degrees. Negative is below the horizon. */
  sunElev: 0,

  /** Live counters for the debug overlay. */
  stats: {
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    preyActive: 0,
  },
}

export function resetLive(health = CAT_START_HEALTH, hunger = CAT_START_HUNGER) {
  live.health = clamp01to(health)
  live.hunger = clamp01to(hunger)
  live.cat.pos.set(CAT_SPAWN[0], groundHeightAt(CAT_SPAWN[0], CAT_SPAWN[1]), CAT_SPAWN[1])
  live.cat.vel.set(0, 0, 0)
  live.cat.yaw = 0
  live.cat.speed = 0
  live.cat.crouched = false
  live.cat.pounceT = 0
  live.cat.pounceCooldown = 0
  live.cat.eatT = 0
  live.cat.hopHeight = 0
  live.cat.action = 'idle'
  resetCombatant(live.cat.duel)
  resetRival()
  live.camera.yaw = 0
  live.camera.pitch = 0.16
  live.camera.snap = true
  live.camera.dist = CAM_DISTANCE
  live.resting = false
  // A fresh cat always starts in mid-morning light. load() overwrites this from
  // the save when the blob carries a time; a v3 blob does not, and lands here.
  live.timeOfDay = DAY_START_T
  live.night = 0
  live.sunElev = 0
}

/**
 * Put the rival back on her patch at full health with no duel running. Called
 * from resetLive, when a duel ends, and after she has finished running off.
 * Position is deliberately re-seeded to RIVAL_SPAWN rather than left where she
 * fell: a rival lurking at the edge of camp is not what "wandering" means.
 */
export function resetRival() {
  const r = live.rival
  r.active = false
  r.pos.set(RIVAL_SPAWN[0], groundHeightAt(RIVAL_SPAWN[0], RIVAL_SPAWN[1]), RIVAL_SPAWN[1])
  r.vel.set(0, 0, 0)
  r.yaw = 0
  r.speed = 0
  r.health = RIVAL_START_HEALTH
  r.hopHeight = 0
  r.action = 'idle'
  resetCombatant(r.duel)
  r.fleeT = 0
  r.decideT = 0
  r.repositionT = 0
  r.circleDir = 1
  r.wanderX = RIVAL_SPAWN[0]
  r.wanderZ = RIVAL_SPAWN[1]
  r.wanderT = 0

  live.duel.active = false
  live.duel.inRange = false
  live.duel.gap = Infinity
  live.duel.fleeing = false
  live.duel.endT = 0
  live.duel.rematchT = 0
  live.duel.lock = 0
}

function clamp01to(v: number) {
  return v < 0 ? 0 : v > NEED_MAX ? NEED_MAX : v
}
