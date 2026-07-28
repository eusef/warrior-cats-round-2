import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  CAT_GROUND_OFFSET,
  CAT_MODEL_YAW_OFFSET,
  CAT_SCALE,
  CAT_WALK_SPEED,
  DUEL_END_DELAY,
  DUEL_PROMPT_RADIUS,
  FLEE_DISTANCE,
  RIVAL_ACCEL,
  RIVAL_APPROACH_SPEED,
  RIVAL_BACKOFF_SPEED,
  RIVAL_DECEL,
  RIVAL_DECIDE_MAX,
  RIVAL_DECIDE_MIN,
  RIVAL_EYE_COLOR,
  RIVAL_FLEE_SPEED,
  RIVAL_HOME_RADIUS,
  RIVAL_LIGHT_COLOR,
  RIVAL_MAIN_COLOR,
  RIVAL_NOTICE_RADIUS,
  RIVAL_PREFERRED_GAP,
  RIVAL_REPOSITION_CHANCE,
  RIVAL_REPOSITION_TIME,
  RIVAL_SPAWN,
  RIVAL_START_HEALTH,
  RIVAL_TURN_SPEED,
  RIVAL_WANDER_RETARGET_MAX,
  RIVAL_WANDER_RETARGET_MIN,
  RIVAL_WANDER_SPEED,
  WORLD_EDGE_MARGIN,
  WORLD_HALF,
} from '../game/constants'
import {
  MOVES,
  advance,
  alongOf,
  applyHit,
  duelPose,
  inReach,
  isLocked,
  pickCpuMove,
  projectToStage,
  separationPush,
  startMove,
  strikeDrive,
  type Drive,
  type StagePoint,
} from '../game/duel'
import { live } from '../game/live'
import { mulberry32 } from '../game/rng'
import { useGame } from '../game/store'
import { clamp, groundHeightAt } from '../game/terrain'
import { logMove } from '../debug/duelLog'
import { DEBUG, debugHooks } from '../debug/expose'
import { pushOutOfTrees } from './PlayerCat'
import { useCatAnimation } from './useCatAnimation'
import { useCatJuice, type JuiceContext } from './useCatJuice'

const MODEL_URL = '/models/Fox.glb'
useGLTF.preload(MODEL_URL)

// Hoisted. Nothing is allocated inside useFrame.
const _drive: Drive = { speed: 0, hop: 0 }
const _pt: StagePoint = { x: 0, z: 0, along: 0 }
const _juice: JuiceContext = {
  action: 'idle',
  speed: 0,
  crouched: false,
  yawRate: 0,
  hopHeight: 0,
}

/**
 * Seeded, so a fight plays out identically under __game.step() twice in a row.
 * A CPU that picks differently every run cannot be verified, only watched.
 */
const rand = mulberry32(0x51ca7)

/**
 * A rival warrior from another Clan, over the border where she should not be.
 *
 * Two behaviours and nothing else: she wanders her patch until Mila walks into
 * her, and once a duel starts she approaches, attacks, and occasionally backs
 * off to circle. There is no difficulty curve, no adaptive AI, no reaction
 * dodging and no counters, on purpose. Watch Mila play first.
 *
 * She runs the same duel machine as the player, from the same pure module, so
 * there is no "CPU rules" fork to keep in sync with the real ones. She is also
 * interruptible on exactly the same terms she can interrupt on.
 *
 * Owns all duel bookkeeping the player half does not: the gap, the Fight
 * prompt, the yield beat, the flee, and the rematch timer.
 */
export function RivalCat() {
  const group = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(MODEL_URL)

  // SkeletonUtils.clone, exactly as PlayerCat does: a plain useGLTF reuse would
  // share one skeleton between the two cats and they would animate in lockstep,
  // which is the single bug this project has hit more than once.
  const model = useMemo(() => {
    const cloned = skeletonClone(scene) as THREE.Group
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.frustumCulled = false // skinned bounds go stale mid-animation
      const src = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
      // Her colours are fixed hexes, not a PELTS index, so she is a visibly
      // different cat whatever pelt Mila chose. Two ginger cats in a scuffle at
      // arm's length on an iPad is unreadable.
      const track = (m: THREE.MeshStandardMaterial) => {
        const c = m.clone()
        if (m.name === 'Main') c.color.set(RIVAL_MAIN_COLOR)
        else if (m.name === 'Main_Light') c.color.set(RIVAL_LIGHT_COLOR)
        else if (m.name === 'Eyes') c.color.set(RIVAL_EYE_COLOR)
        return c
      }
      mesh.material = Array.isArray(src) ? src.map(track) : track(src)
    })
    return cloned
  }, [scene])

  const animator = useCatAnimation(model, animations)
  const juice = useCatJuice(model, squash)
  const prevYaw = useRef(0)

  useEffect(() => {
    if (!DEBUG) return
    debugHooks.rival = () => {
      const r = live.rival
      return {
        active: r.active,
        health: Math.round(r.health * 100) / 100,
        phase: r.duel.phase,
        move: r.duel.move ?? 'none',
        phaseT: Math.round(r.duel.phaseT * 1000) / 1000,
        action: r.action,
        speed: Math.round(r.speed * 100) / 100,
        pos: { x: Math.round(r.pos.x * 100) / 100, z: Math.round(r.pos.z * 100) / 100 },
        fleeT: Math.round(r.fleeT * 100) / 100,
      }
    }
    return () => {
      debugHooks.rival = undefined
    }
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const r = live.rival
    const d = live.duel
    const cat = live.cat
    const gs = useGame.getState()
    const playing = gs.phase === 'playing' && gs.ceremony === null

    if (d.rematchT > 0) d.rematchT = Math.max(0, d.rematchT - delta)

    // --- presence -----------------------------------------------------------
    // She is simply out there during play. Off the title and creation screens
    // she is parked at spawn and hidden, so nothing of hers ticks.
    if (!playing) {
      const g0 = group.current
      if (g0) g0.visible = false
      d.inRange = false
      return
    }
    if (!r.active && r.fleeT <= 0 && d.rematchT <= 0) {
      r.active = true
      r.health = RIVAL_START_HEALTH
      r.pos.set(RIVAL_SPAWN[0], groundHeightAt(RIVAL_SPAWN[0], RIVAL_SPAWN[1]), RIVAL_SPAWN[1])
      r.vel.set(0, 0, 0)
      r.speed = 0
      r.wanderX = RIVAL_SPAWN[0]
      r.wanderZ = RIVAL_SPAWN[1]
      r.wanderT = 0
    }

    const g = group.current
    if (g) g.visible = r.active
    if (!r.active) {
      d.inRange = false
      d.gap = Infinity
      return
    }

    // --- gap ----------------------------------------------------------------
    const dx = cat.pos.x - r.pos.x
    const dz = cat.pos.z - r.pos.z
    const gap = Math.hypot(dx, dz)
    d.gap = gap
    // The Fight prompt only offers a fight that can actually start.
    d.inRange = !d.active && r.fleeT <= 0 && d.rematchT <= 0 && gap <= DUEL_PROMPT_RADIUS
    // Standing her ground because Mila is walking up. See the branch below.
    const noticing = !d.active && r.fleeT <= 0 && gap <= RIVAL_NOTICE_RADIUS
    // Pinned to the fight line. PlayerCat lays the line out, one component
    // earlier in the same frame, so this is never a frame behind, and it also
    // clears the flag the frame Mila taps Run away.
    const onStage = d.active && d.onStage

    // --- her half of the duel machine ---------------------------------------
    const ev = advance(r.duel, delta)
    if (ev === 'strike' && r.duel.move) {
      const m = MOVES[r.duel.move]
      const hit = inReach(r.pos.x, r.pos.z, r.yaw, cat.pos.x, cat.pos.z, m.reach)
      if (hit) {
        const res = applyHit(cat.duel, live.health, m.damage)
        live.health = res.health
        logMove('rival', r.duel.move, gap, true, m.damage, res.result, live.health, r.health)
      } else {
        live.duel.whiffs += 1
        logMove('rival', r.duel.move, gap, false, 0, 'miss', live.health, r.health)
      }
    }

    // --- movement -----------------------------------------------------------
    let wantX = 0
    let wantZ = 0
    let top = 0

    if (r.fleeT > 0) {
      // Yielded. She runs directly away from the player and despawns.
      r.fleeT -= delta
      const away = gap > 0.001 ? 1 / gap : 0
      wantX = -dx * away
      wantZ = -dz * away
      top = RIVAL_FLEE_SPEED
      if (r.fleeT <= 0) {
        r.fleeT = 0
        r.active = false
        r.health = RIVAL_START_HEALTH
      }
    } else if (d.active && !isLocked(r.duel)) {
      // --- duel AI: approach, attack, reposition ----------------------------
      r.decideT -= delta
      if (r.repositionT > 0) r.repositionT -= delta

      if (r.decideT <= 0) {
        r.decideT = RIVAL_DECIDE_MIN + rand() * (RIVAL_DECIDE_MAX - RIVAL_DECIDE_MIN)
        if (rand() < RIVAL_REPOSITION_CHANCE) {
          r.repositionT = RIVAL_REPOSITION_TIME
          r.circleDir = rand() < 0.5 ? -1 : 1
        } else {
          const move = pickCpuMove(gap, rand)
          if (move && startMove(r.duel, move)) logMove('rival', move, gap, false, 0, 'windup', live.health, r.health)
        }
      }

      if (!isLocked(r.duel)) {
        const toX = gap > 0.001 ? dx / gap : 0
        const toZ = gap > 0.001 ? dz / gap : 0
        if (r.repositionT > 0) {
          // Back off along the line and slide around it at the same time.
          const perpX = -toZ * r.circleDir
          const perpZ = toX * r.circleDir
          wantX = -toX * 0.55 + perpX
          wantZ = -toZ * 0.55 + perpZ
          top = RIVAL_BACKOFF_SPEED
        } else if (gap > RIVAL_PREFERRED_GAP) {
          wantX = toX
          wantZ = toZ
          top = RIVAL_APPROACH_SPEED
        }
      }
    } else if (noticing) {
      // --- noticed her --------------------------------------------------------
      // She sees Mila coming and stands her ground. Without this she carries on
      // ambling to her next wander target while Mila walks up, which reads as a
      // cat who keeps running away from a fight rather than as one patrolling.
      // Deliberately wider than DUEL_PROMPT_RADIUS so she has already stopped by
      // the time the Fight button appears.
      r.wanderT = 0
    } else if (!d.active) {
      // --- wander -----------------------------------------------------------
      r.wanderT -= delta
      if (r.wanderT <= 0) {
        r.wanderT = RIVAL_WANDER_RETARGET_MIN + rand() * (RIVAL_WANDER_RETARGET_MAX - RIVAL_WANDER_RETARGET_MIN)
        const a = rand() * Math.PI * 2
        const rad = Math.sqrt(rand()) * RIVAL_HOME_RADIUS
        r.wanderX = RIVAL_SPAWN[0] + Math.cos(a) * rad
        r.wanderZ = RIVAL_SPAWN[1] + Math.sin(a) * rad
      }
      const wx = r.wanderX - r.pos.x
      const wz = r.wanderZ - r.pos.z
      const wd = Math.hypot(wx, wz)
      if (wd > 0.6) {
        wantX = wx / wd
        wantZ = wz / wd
        top = RIVAL_WANDER_SPEED
      }
    }

    // Flatten her intent onto the line before the accel step, not after the
    // fact with the position projection below. Her back-off-and-circle is
    // mostly perpendicular, and letting the projection eat it afterwards would
    // still feed the whole 3.4 m/s into r.speed: she would play a full run
    // animation while actually sliding along the line at a third of that.
    if (onStage) {
      const s = d.stage
      const alongWant = wantX * s.ax + wantZ * s.az
      wantX = s.ax * alongWant
      wantZ = s.az * alongWant
    }

    // A strike drives its own velocity and overrides everything above, exactly
    // the way the hunting pounce does.
    strikeDrive(r.duel, _drive)
    if (r.duel.phase === 'strike') {
      const fx = -Math.sin(r.yaw)
      const fz = -Math.cos(r.yaw)
      r.vel.set(fx * _drive.speed, 0, fz * _drive.speed)
      r.speed = _drive.speed
      r.hopHeight = _drive.hop
    } else if (isLocked(r.duel)) {
      // Wind-up, recovery and stagger are all committed: she cannot move.
      r.vel.set(0, 0, 0)
      r.speed = 0
      r.hopHeight = 0
    } else {
      r.hopHeight = 0
      const tx = wantX * top
      const tz = wantZ * top
      const rate = top > r.speed ? RIVAL_ACCEL : RIVAL_DECEL
      const step = rate * delta
      r.vel.x += clampAbs(tx - r.vel.x, step)
      r.vel.z += clampAbs(tz - r.vel.z, step)
      r.speed = Math.hypot(r.vel.x, r.vel.z)
      if (r.speed < 0.02) {
        r.vel.set(0, 0, 0)
        r.speed = 0
      }
    }

    // --- integrate ----------------------------------------------------------
    r.pos.x += r.vel.x * delta
    r.pos.z += r.vel.z * delta
    pushOutOfTrees(r.pos)
    if (onStage) {
      // The leash. She cannot circle off the line and she cannot back out of
      // the stage, so the only way this fight ends early is Mila's own tap on
      // Run away. Bias -1 against the player's +1, so if they ever land exactly
      // on top of each other the two shoves pick opposite directions instead of
      // welding them together.
      const s = d.stage
      const push = separationPush(
        alongOf(r.pos.x, r.pos.z, s),
        alongOf(cat.pos.x, cat.pos.z, s),
        -1,
      )
      projectToStage(r.pos.x, r.pos.z, push, s, _pt)
      r.pos.x = _pt.x
      r.pos.z = _pt.z
    }
    const limit = WORLD_HALF - WORLD_EDGE_MARGIN
    r.pos.x = clamp(r.pos.x, -limit, limit)
    r.pos.z = clamp(r.pos.z, -limit, limit)
    r.pos.y = groundHeightAt(r.pos.x, r.pos.z) + CAT_GROUND_OFFSET

    // --- facing -------------------------------------------------------------
    // In a duel she always squares up to the player, so her wind-up telegraphs
    // where the hit is going. She also turns to face Mila walking up, because a
    // cat that stops but keeps staring at a bush does not read as "noticed you".
    // Out of both she just faces where she is walking.
    if ((d.active || noticing) && r.duel.phase !== 'strike') {
      const want = Math.atan2(-dx, -dz)
      r.yaw += shortestAngle(r.yaw, want) * Math.min(1, RIVAL_TURN_SPEED * delta)
    } else if (r.speed > 0.05 && r.duel.phase !== 'strike') {
      const want = Math.atan2(-r.vel.x, -r.vel.z)
      r.yaw += shortestAngle(r.yaw, want) * Math.min(1, RIVAL_TURN_SPEED * delta)
    }

    // --- state --------------------------------------------------------------
    const pose = duelPose(r.duel)
    r.action =
      pose ??
      (r.speed > CAT_WALK_SPEED * 0.98 ? 'run' : r.speed > 0.05 ? 'walk' : 'idle')

    // --- duel end -----------------------------------------------------------
    // A yield beat, so the fight does not cut to a toast the instant a bar
    // empties. Written here rather than in the store so it ticks on a ref.
    if (d.active) {
      const over = r.health <= 0 || live.health <= 0
      if (over && d.endT <= 0) d.endT = DUEL_END_DELAY
      if (d.endT > 0) {
        d.endT -= delta
        if (d.endT <= 0) {
          d.endT = 0
          useGame.getState().endDuel(r.health <= 0 ? 'won' : 'lost')
        }
      } else if (d.fleeing && gap >= FLEE_DISTANCE) {
        useGame.getState().endDuel('fled')
      }
    }

    // --- apply --------------------------------------------------------------
    if (g) {
      g.position.set(r.pos.x, r.pos.y + r.hopHeight, r.pos.z)
      g.rotation.y = r.yaw + CAT_MODEL_YAW_OFFSET
    }
    animator.update(r.action, r.speed, delta)

    // Strictly after the animator, same as PlayerCat: the mixer rewrites every
    // bone from the clip inside update(), so juice written before it is erased.
    _juice.action = r.action
    _juice.speed = r.speed
    _juice.crouched = false
    // Guarded divide. A zero delta makes this 0/0, and one NaN permanently
    // destroys all eight tail bones for the rest of the session.
    _juice.yawRate = delta > 0 ? shortestAngle(prevYaw.current, r.yaw) / delta : 0
    _juice.hopHeight = r.hopHeight
    prevYaw.current = r.yaw
    juice.update(_juice, delta)
  })

  return (
    <group ref={group} visible={false}>
      <group ref={squash}>
        <primitive object={model} scale={CAT_SCALE} />
      </group>
    </group>
  )
}

function clampAbs(v: number, max: number) {
  return v > max ? max : v < -max ? -max : v
}

function shortestAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

