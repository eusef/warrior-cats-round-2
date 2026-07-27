import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  CAT_RUN_SPEED,
  EAR_FLATTEN_CROUCH,
  EAR_FLATTEN_LAG,
  EAR_FLICK_AMOUNT,
  EAR_FLICK_DURATION,
  EAR_FLICK_MAX_GAP,
  EAR_FLICK_MIN_GAP,
  EAR_FLICK_WOBBLES,
  EAR_TIP_FOLLOW,
  POUNCE_HOP_HEIGHT,
  SQUASH_AIR_LAG,
  SQUASH_AIR_MIN,
  SQUASH_AIR_STRETCH,
  SQUASH_DAMPING,
  SQUASH_LAND_IMPULSE,
  SQUASH_MAX,
  SQUASH_STIFFNESS,
  SQUASH_WIDTH_RATIO,
  TAIL_LIFT_CROUCH,
  TAIL_LIFT_LAG,
  TAIL_LIFT_RUN,
  TAIL_SWAY_IDLE,
  TAIL_SWAY_RUN,
  TAIL_TURN_AMOUNT,
  TAIL_TURN_LAG,
  TAIL_TURN_REF,
  TAIL_WAVE_LAG,
  TAIL_WAVE_RATE_IDLE,
  TAIL_WAVE_RATE_RUN,
} from '../game/constants'
import type { CatAction } from '../game/live'
import { mulberry32 } from '../game/rng'
import { clamp } from '../game/terrain'
import { debugHooks, DEBUG } from '../debug/expose'

/**
 * The chains this drives, base first. Read off the GLB, never guessed: every
 * bone in the Fox rig sits at (0, L, 0) in its parent, so each one extends
 * along its own local +Y. That makes local Z the side-to-side swing and local X
 * the up/down bend, which is the whole basis of the maths below.
 */
const TAIL_BONES = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7', 'Tail8']
/** Base then second segment. The tip pair is left alone; it just follows. */
const EAR_BONES = { L: ['Ear1.L', 'Ear2.L'], R: ['Ear1.R', 'Ear2.R'] }

/**
 * Bone names in the GLB are not the names three.js ends up with.
 * `PropertyBinding.sanitizeNodeName` strips characters that are reserved in an
 * animation path, so the rig's `Ear1.L` is `Ear1L` on the loaded scene. The
 * tail chain has no dots and bound cleanly, which is exactly why this went
 * unnoticed until the bind count was logged: the flick maths ran perfectly and
 * drove nothing. Try the authored name first, then the sanitised forms.
 */
function findBone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  return (
    root.getObjectByName(name) ??
    root.getObjectByName(name.replace(/[.\s]/g, '')) ??
    root.getObjectByName(name.replace(/[.\s]/g, '_'))
  )
}

export interface JuiceContext {
  action: CatAction
  speed: number
  crouched: boolean
  /** Signed yaw change this frame, radians/sec. Drives the tail counter-swing. */
  yawRate: number
  /** Metres above the ground from the pounce arc. Falling to 0 is the landing. */
  hopHeight: number
}

export interface CatJuice {
  /**
   * Call every frame from useFrame, AFTER the animator has run. The
   * AnimationMixer rewrites every bone quaternion from the clip on each
   * update, so anything written before it is silently erased. Because the
   * mixer resets the pose first, adding here is non-cumulative by
   * construction: these are offsets on the clip, not an integration.
   */
  update: (ctx: JuiceContext, delta: number) => void
}

/**
 * Procedural motion on top of the baked clips: tail sway, ear flicks, and the
 * squash on a pounce landing.
 *
 * Costs nothing on the GPU. No geometry, no material, no draw call: it moves
 * bones that are already being skinned and scales a group that already exists.
 */
export function useCatJuice(
  root: THREE.Object3D | null,
  // A ref, not the object: it is still null on the render that builds this hook.
  squash: React.RefObject<THREE.Object3D>,
): CatJuice {
  const bones = useMemo(() => {
    const tail: THREE.Object3D[] = []
    const earL: THREE.Object3D[] = []
    const earR: THREE.Object3D[] = []
    if (root) {
      for (const name of TAIL_BONES) {
        const b = findBone(root, name)
        if (b) tail.push(b)
      }
      for (const name of EAR_BONES.L) {
        const b = findBone(root, name)
        if (b) earL.push(b)
      }
      for (const name of EAR_BONES.R) {
        const b = findBone(root, name)
        if (b) earR.push(b)
      }
    }
    return { tail, earL, earR }
  }, [root])

  useEffect(() => {
    if (!DEBUG) return
    // Same reason the clip names are logged: a silently unbound chain looks
    // exactly like a feature that is subtly tuned too low to see.
    // eslint-disable-next-line no-console
    console.log(
      `[juice] bound tail:${bones.tail.length}/${TAIL_BONES.length} earL:${bones.earL.length} earR:${bones.earR.length}`,
    )
    if (!bones.tail.length || !bones.earL.length || !bones.earR.length) {
      // eslint-disable-next-line no-console
      console.warn('[juice] a chain failed to bind; that part of the pass is inert')
    }
  }, [bones])

  // All per-frame state. Refs, never store state: none of this may re-render.
  const s = useRef({
    /** ?debug=1 only: __game.setJuice(false) reverts the cat to the raw clips. */
    enabled: true,
    t: 0,
    turnLean: 0,
    lift: 0,
    /** Flick angle currently applied to each ear, radians. */
    flick: [0, 0] as [number, number],
    flickT: 0,
    /** Which ear is mid-flick: 0 = left, 1 = right. */
    flickEar: 0,
    flickGap: EAR_FLICK_MIN_GAP,
    flickCount: 0,
    flatten: 0,
    /** Damped-spring displacement. Negative = compressed. */
    sq: 0,
    sqVel: 0,
    stretch: 0,
    /** Latched once the pounce arc clears SQUASH_AIR_MIN; cleared on touchdown. */
    airborne: false,
    landings: 0,
    scaleY: 1,
    scaleXZ: 1,
    /** Total sway summed down the chain: the deflection actually seen at the tip. */
    tipSway: 0,
    amp: 0,
  }).current

  // Seeded so a verification run reproduces the same flick timings. Same
  // reasoning as prey spawns: a random world cannot be asserted on.
  const rand = useMemo(() => mulberry32(0x9e37), [])

  useEffect(() => {
    if (!DEBUG) return
    // A/B switch. Turning it off is genuinely clean rather than approximately
    // clean: the mixer rewrites every bone from the clip each frame, so simply
    // declining to add the offsets leaves the raw baked pose behind.
    debugHooks.setJuice = (on: boolean) => {
      s.enabled = on
    }
    return () => {
      debugHooks.setJuice = undefined
    }
  }, [s])

  useEffect(() => {
    if (!DEBUG) return
    debugHooks.juice = () => ({
      enabled: s.enabled,
      tailBones: bones.tail.length,
      // What this system applied, summed down the chain, with the clip's own
      // contribution excluded: mixing the two makes the number unassertable.
      tipSway: round3(s.tipSway),
      amp: round3(s.amp),
      posedTip: round3(readZ(bones.tail[bones.tail.length - 1])),
      turnLean: round3(s.turnLean),
      lift: round3(s.lift),
      // Bind counts and the posed bone angles, not just the intent. An unbound
      // chain makes every intent number below look perfect while nothing on
      // screen moves, which is how the ears shipped inert the first time.
      earBones: bones.earL.length + bones.earR.length,
      earL: round3(s.flick[0]),
      earR: round3(s.flick[1]),
      posedEarL: round3(readZ(bones.earL[0])),
      posedEarR: round3(readZ(bones.earR[0])),
      posedEarLx: round3(readX(bones.earL[0])),
      flatten: round3(s.flatten),
      flicks: s.flickCount,
      squashY: round3(s.scaleY),
      squashXZ: round3(s.scaleXZ),
      landings: s.landings,
    })
    return () => {
      debugHooks.juice = undefined
    }
  }, [bones, s])

  return useMemo<CatJuice>(
    () => ({
      update(ctx, delta) {
        if (!s.enabled) {
          squash.current?.scale.set(1, 1, 1)
          return
        }
        s.t += delta
        const speedN = clamp(ctx.speed / CAT_RUN_SPEED, 0, 1)

        // --- tail ---------------------------------------------------------
        // A travelling wave: each bone down the chain lags the one before it by
        // a fixed phase, and the amplitude ramps toward the tip.
        const amp = TAIL_SWAY_IDLE + (TAIL_SWAY_RUN - TAIL_SWAY_IDLE) * speedN
        const rate = TAIL_WAVE_RATE_IDLE + (TAIL_WAVE_RATE_RUN - TAIL_WAVE_RATE_IDLE) * speedN

        // Defence in depth, and not theoretical: `clamp` is a plain pair of
        // comparisons, so clamp(NaN) returns NaN rather than a bound, and a
        // single NaN reaching a smoothed value here is unrecoverable -- it
        // writes NaN quaternions into the bones and the tail stops existing.
        // This module owns that invariant, so it checks its own input.
        const yawRate = Number.isFinite(ctx.yawRate) ? ctx.yawRate : 0
        const leanTarget =
          clamp(yawRate / TAIL_TURN_REF, -1, 1) * TAIL_TURN_AMOUNT * (0.35 + 0.65 * speedN)
        s.turnLean += (leanTarget - s.turnLean) * expLerp(TAIL_TURN_LAG, delta)

        const liftTarget = ctx.crouched ? TAIL_LIFT_CROUCH : TAIL_LIFT_RUN * speedN
        s.lift += (liftTarget - s.lift) * expLerp(TAIL_LIFT_LAG, delta)

        s.amp = amp
        const n = bones.tail.length
        // Rotations COMPOUND down a chain: the tip's deflection is the sum of
        // every ancestor's. A raw (i+1)/n ramp therefore sums to (n+1)/2 -- 4.5
        // times the named constant on an eight-bone tail -- so `-0.3` of crouch
        // droop actually bent the tail 77 degrees and folded it into the body.
        // Normalising by that sum makes each constant mean the total deflection
        // at the tip, which is the thing worth tuning.
        let total = 0
        const norm = 2 / (n * (n + 1))
        for (let i = 0; i < n; i++) {
          const b = bones.tail[i]
          // Ramped so the base barely moves and the bend tightens toward the tip.
          const w = (i + 1) * norm
          const sway = Math.sin(s.t * rate - i * TAIL_WAVE_LAG) * amp * w + s.turnLean * w
          const r = b.rotation
          // One set(), not three assignments: each write to a rotation channel
          // re-syncs the quaternion, so this is a third of the work.
          r.set(r.x + s.lift * w, r.y, r.z + sway)
          total += sway
        }
        s.tipSway = total

        // --- ears ---------------------------------------------------------
        const still = ctx.action === 'idle' || ctx.action === 'rest'
        if (s.flickT > 0) {
          s.flickT -= delta
          const prog = 1 - clamp(s.flickT / EAR_FLICK_DURATION, 0, 1)
          // A decaying wobble rather than a single swing: an ear that goes out
          // and comes straight back reads as a hinge, not an ear.
          const a =
            Math.sin(prog * Math.PI * EAR_FLICK_WOBBLES) * EAR_FLICK_AMOUNT * (1 - prog)
          s.flick[s.flickEar] = a
          if (s.flickT <= 0) {
            s.flickT = 0
            s.flick[s.flickEar] = 0
          }
        } else if (still) {
          s.flickGap -= delta
          if (s.flickGap <= 0) {
            s.flickT = EAR_FLICK_DURATION
            s.flickEar = rand() < 0.5 ? 0 : 1
            s.flickGap = EAR_FLICK_MIN_GAP + rand() * (EAR_FLICK_MAX_GAP - EAR_FLICK_MIN_GAP)
            s.flickCount++
          }
        } else {
          // Moving resets the timer, so a flick lands a beat after she settles
          // rather than the instant she stops.
          s.flickGap = EAR_FLICK_MIN_GAP + rand() * (EAR_FLICK_MAX_GAP - EAR_FLICK_MIN_GAP)
        }

        const flatTarget = ctx.crouched ? EAR_FLATTEN_CROUCH : 0
        s.flatten += (flatTarget - s.flatten) * expLerp(EAR_FLATTEN_LAG, delta)

        // Left and right mirror on the swing axis, so the flick sign flips.
        applyEar(bones.earL, s.flick[0], s.flatten, 1)
        applyEar(bones.earR, s.flick[1], s.flatten, -1)

        // --- squash -------------------------------------------------------
        const airborne = ctx.hopHeight > 0.001
        // Latch that she got properly off the ground, then fire on the frame
        // the arc reaches zero. Comparing this frame's height against last
        // frame's does NOT work: the hop is a sine that decays smoothly, so the
        // frame before touchdown sits at about 0.015m and any threshold big
        // enough to mean "airborne" is never the previous value. Measured, not
        // guessed: the first pass with that test fired zero landings and the
        // air stretch alone made it look correct.
        if (ctx.hopHeight > SQUASH_AIR_MIN) s.airborne = true
        if (!airborne && s.airborne) {
          s.airborne = false
          s.sqVel -= SQUASH_LAND_IMPULSE
          s.landings++
        }

        const stretchTarget = airborne
          ? SQUASH_AIR_STRETCH * clamp(ctx.hopHeight / POUNCE_HOP_HEIGHT, 0, 1)
          : 0
        s.stretch += (stretchTarget - s.stretch) * expLerp(SQUASH_AIR_LAG, delta)

        // Damped spring back to neutral. Semi-implicit Euler: velocity first,
        // then position, which stays stable at the deltas this game sees.
        s.sqVel += (-SQUASH_STIFFNESS * s.sq - SQUASH_DAMPING * s.sqVel) * delta
        s.sq += s.sqVel * delta
        if (s.sq > SQUASH_MAX) {
          s.sq = SQUASH_MAX
          s.sqVel = 0
        } else if (s.sq < -SQUASH_MAX) {
          s.sq = -SQUASH_MAX
          s.sqVel = 0
        }

        const vertical = s.sq + s.stretch
        s.scaleY = 1 + vertical
        s.scaleXZ = 1 - vertical * SQUASH_WIDTH_RATIO
        squash.current?.scale.set(s.scaleXZ, s.scaleY, s.scaleXZ)
      },
    }),
    [bones, squash, rand, s],
  )
}

/**
 * Flick swings the ear sideways (local Z), flatten lays it back (local X).
 * The second segment adds a fraction of the same angle so the ear bends along
 * its length instead of pivoting rigidly at the skull.
 */
function applyEar(chain: THREE.Object3D[], flick: number, flatten: number, side: number) {
  for (let i = 0; i < chain.length; i++) {
    const w = i === 0 ? 1 : EAR_TIP_FOLLOW
    const r = chain[i].rotation
    r.set(r.x + flatten * w, r.y, r.z + flick * side * w)
  }
}

/** Frame-rate independent approach factor for an exponential ease. */
function expLerp(rate: number, delta: number) {
  return 1 - Math.exp(-rate * delta)
}

function readZ(b: THREE.Object3D | undefined) {
  return b ? b.rotation.z : 0
}

function readX(b: THREE.Object3D | undefined) {
  return b ? b.rotation.x : 0
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000
}
