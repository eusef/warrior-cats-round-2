import * as THREE from 'three'
import { CAT_SPAWN, CAT_START_HEALTH, CAT_START_HUNGER, NEED_MAX } from './constants'
import { groundHeightAt } from './terrain'

export type CatAction = 'idle' | 'walk' | 'run' | 'crouch' | 'pounce' | 'eat' | 'rest'

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
  },

  camera: {
    /** Orbit yaw offset applied on top of the cat's heading. */
    yaw: 0,
    pitch: 0.16,
  },

  /** True while the cat is inside the camp radius and not moving. */
  resting: false,

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
  live.camera.yaw = 0
  live.camera.pitch = 0.16
  live.resting = false
}

function clamp01to(v: number) {
  return v < 0 ? 0 : v > NEED_MAX ? NEED_MAX : v
}
