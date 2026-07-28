import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  CAT_ACCEL,
  CAT_CROUCH_SPEED_MULT,
  CAT_DECEL,
  CAT_GROUND_OFFSET,
  CAT_MODEL_YAW_OFFSET,
  CAT_RUN_SPEED,
  CAT_SCALE,
  CAT_TURN_SPEED,
  CAT_WALK_SPEED,
  CAT_WALK_THRESHOLD,
  CAMP_RADIUS,
  EAT_DURATION,
  FLEE_SPEED_BONUS,
  MEAL_HUNGER_RESTORE,
  POUNCE_COOLDOWN,
  POUNCE_DURATION,
  POUNCE_FORWARD_SPEED,
  POUNCE_HOP_HEIGHT,
  POUNCE_RANGE,
  SAVE_INTERVAL_SEC,
  WORLD_EDGE_MARGIN,
  WORLD_HALF,
  EYE_COLORS,
  PELTS,
} from '../game/constants'
import {
  MOVES,
  advance,
  applyHit,
  duelPose,
  inReach,
  isLocked,
  resetCombatant,
  startMove,
  strikeDrive,
  type Drive,
} from '../game/duel'
import { undiscoveredHit } from '../game/landmarks'
import { live, resetLive } from '../game/live'
import { feed, tickNeeds } from '../game/needs'
import { useGame, type Identity } from '../game/store'
import { clamp, distToCamp, groundHeightAt } from '../game/terrain'
import { input } from '../input/useTouchInput'
import { treeColliders } from '../world/Foliage'
import { logMove } from '../debug/duelLog'
import { debugHooks } from '../debug/expose'
import { preyRegistry } from './preyRegistry'
import { useCatAnimation } from './useCatAnimation'
import { useCatJuice, type JuiceContext } from './useCatJuice'
import { CAMP_LINES, CATCH_LINES, EAT_LINES, HUNGER_LINES } from '../content/lines'

const MODEL_URL = '/models/Fox.glb'
useGLTF.preload(MODEL_URL)

// Hoisted. Nothing is allocated inside useFrame.
const _dir = new THREE.Vector2()
const _desired = new THREE.Vector2()
const _drive: Drive = { speed: 0, hop: 0 }
const _juice: JuiceContext = {
  action: 'idle',
  speed: 0,
  crouched: false,
  yawRate: 0,
  hopHeight: 0,
}

/** The three GLB material slots character creation paints. */
interface PeltSlots {
  main: THREE.MeshStandardMaterial[]
  light: THREE.MeshStandardMaterial[]
  eyes: THREE.MeshStandardMaterial[]
}

/**
 * Discrete, not per-frame: this runs on a swatch tap, never in useFrame.
 * `color.set` on an existing material costs nothing and adds no draw call, so
 * the whole of character creation is free at runtime.
 */
function paint(slots: PeltSlots, id: Identity) {
  const pelt = PELTS[id.pelt] ?? PELTS[0]
  const eye = EYE_COLORS[id.eyes] ?? EYE_COLORS[0]
  for (const m of slots.main) m.color.set(pelt.main)
  for (const m of slots.light) m.color.set(pelt.light)
  for (const m of slots.eyes) m.color.set(eye.color)
}

export function PlayerCat() {
  const group = useRef<THREE.Group>(null)
  // A plain Object3D wrapper the squash spring scales. Costs no draw call and
  // no material; scaling here rather than on `group` keeps the pounce hop and
  // the ground placement out of the squash maths.
  const squash = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(MODEL_URL)
  const identity = useGame((s) => s.identity)

  // SkeletonUtils.clone is mandatory here: a plain useGLTF reuse shares the
  // skeleton, and every cat would animate identically. Also keeps StrictMode's
  // double mount from attaching the same scene graph twice.
  const { model, slots } = useMemo(() => {
    const cloned = skeletonClone(scene) as THREE.Group
    const found: PeltSlots = { main: [], light: [], eyes: [] }
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.frustumCulled = false // skinned bounds go stale mid-animation
      // Clone the materials so recolouring one cat never tints another, and
      // keep a handle on each one so creation can repaint it on a tap.
      const src = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
      const track = (m: THREE.MeshStandardMaterial) => {
        const c = m.clone()
        if (m.name === 'Main') found.main.push(c)
        else if (m.name === 'Main_Light') found.light.push(c)
        else if (m.name === 'Eyes') found.eyes.push(c)
        return c
      }
      mesh.material = Array.isArray(src) ? src.map(track) : track(src)
    })
    return { model: cloned, slots: found }
  }, [scene])

  // Only fires when the identity object actually changes, which is a swatch tap
  // or a load. Never during play.
  useEffect(() => {
    paint(slots, identity)
  }, [slots, identity])

  const animator = useCatAnimation(model, animations)
  const juice = useCatJuice(model, squash)
  const prevYaw = useRef(0)
  const saveTimer = useRef(0)
  const pounceResolved = useRef(false)
  // Seeded true, not false. The cat spawns standing in camp, so a false seed
  // fired "Resting at camp." on the first frame of play, which both said
  // nothing (she has not gone anywhere yet) and instantly overwrote the
  // "You are <Name>." beat that creation had just earned. The camp line now
  // waits for a real arrival.
  const wasResting = useRef(true)
  const restCount = useRef(0)

  useEffect(() => {
    const g = useGame.getState()
    if (!g.load()) resetLive()
    return () => {
      useGame.getState().save()
    }
  }, [])

  // Lets verification read the colours actually on the GPU-bound materials
  // instead of trusting the store, which is the only claim worth making.
  useEffect(() => {
    debugHooks.catColors = () => ({
      main: hexOf(slots.main[0]),
      light: hexOf(slots.light[0]),
      eyes: hexOf(slots.eyes[0]),
    })
    return () => {
      debugHooks.catColors = undefined
    }
  }, [slots])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const cat = live.cat
    // The ceremony overlay swallows new touches, but it cannot let go of a
    // thumb that was already on the joystick when the eat beat ended: input
    // keeps its last vector and the cat walks out of frame while her name is
    // being read. Standing her down here is what makes the beat hold still.
    const gs = useGame.getState()
    const playing = gs.phase === 'playing' && gs.ceremony === null

    if (cat.pounceCooldown > 0) cat.pounceCooldown -= delta

    // --- duel ---------------------------------------------------------------
    // Her half of the machine. The rival owns her own half and the duel-level
    // bookkeeping; this block is only ever about what Mila's thumb just did.
    const duel = live.duel
    const inDuel = playing && duel.active

    // Run away is checked before anything else and is never gated on a phase.
    // It is a safety valve, not a mechanic to balance: she should never be able
    // to feel trapped in a fight she is losing, so a tap always lands, even
    // mid-wind-up. The move she was committed to is simply dropped.
    if (input.fleeTap) {
      input.fleeTap = false
      if (inDuel) {
        resetCombatant(cat.duel)
        if (live.rival.duel.phase !== 'strike') {
          // Nothing is in the air, so there is nothing to run out from under.
          useGame.getState().endDuel('fled')
        } else {
          duel.fleeing = true
        }
      }
    }

    if (input.fightTap) {
      input.fightTap = false
      if (playing && duel.inRange) useGame.getState().startDuel()
    }

    if (input.duelMove) {
      const wanted = input.duelMove
      input.duelMove = null
      // startMove refuses unless she is neutral, which is the whole of why a
      // mashed button cannot queue four jump-kicks. No buffer, no cancel.
      if (inDuel && startMove(cat.duel, wanted)) {
        logMove('player', wanted, duel.gap, false, 0, 'windup', live.health, live.rival.health)
      }
    }

    if (playing) {
      const ev = advance(cat.duel, delta)
      if (ev === 'strike' && cat.duel.move) {
        // Reach is tested here, at the END of the wind-up, before the lunge has
        // travelled a metre. That is what makes "the rival backed off during
        // the wind-up" an honest miss rather than a hit that catches up.
        const m = MOVES[cat.duel.move]
        const r = live.rival
        const hit =
          r.active &&
          duel.active &&
          inReach(cat.pos.x, cat.pos.z, cat.yaw, r.pos.x, r.pos.z, m.reach)
        if (hit) {
          const res = applyHit(r.duel, r.health, m.damage)
          r.health = res.health
          logMove('player', cat.duel.move, duel.gap, true, m.damage, res.result, live.health, r.health)
        } else {
          logMove('player', cat.duel.move, duel.gap, false, 0, 'miss', live.health, live.rival.health)
        }
      }
    }

    const locked = playing && isLocked(cat.duel)

    // --- intent -------------------------------------------------------------
    const busy = cat.eatT > 0
    // No stalking mice mid-fight: the paw button is the duel's problem now, and
    // a crouch during a duel would silently halve her speed for no visible reason.
    cat.crouched = playing && !busy && !inDuel && !locked && input.action && cat.pounceT <= 0

    if (playing && !busy && !inDuel && !locked && input.actionReleased) {
      input.actionReleased = false
      if (cat.pounceT <= 0 && cat.pounceCooldown <= 0) {
        cat.pounceT = POUNCE_DURATION
        cat.pounceCooldown = POUNCE_DURATION + POUNCE_COOLDOWN
        cat.crouched = false
      }
    } else if (input.actionReleased) {
      input.actionReleased = false
    }

    // --- movement -----------------------------------------------------------
    const camYaw = live.camera.yaw
    const fx = -Math.sin(camYaw)
    const fz = -Math.cos(camYaw)
    const rx = Math.cos(camYaw)
    const rz = -Math.sin(camYaw)

    _dir.set(
      rx * input.move.x + fx * input.move.y,
      rz * input.move.x + fz * input.move.y,
    )
    const wantMag = playing && !busy ? Math.min(_dir.length(), 1) : 0
    if (wantMag > 0.0001) _dir.multiplyScalar(1 / _dir.length())

    if (locked) {
      // Committed. Wind-up, recovery and stagger are all dead stops -- this is
      // the punish window and it has to actually cost something -- and the
      // strike drives its own lunge along the heading she committed on.
      strikeDrive(cat.duel, _drive)
      if (cat.duel.phase === 'strike') {
        const sx = -Math.sin(cat.yaw)
        const sz = -Math.cos(cat.yaw)
        cat.vel.set(sx * _drive.speed, 0, sz * _drive.speed)
        cat.speed = _drive.speed
        cat.hopHeight = _drive.hop
      } else {
        cat.vel.set(0, 0, 0)
        cat.speed = 0
        cat.hopHeight = 0
      }
    } else if (cat.pounceT > 0) {
      // The pounce commits: it drives straight along the current heading.
      cat.pounceT -= delta
      const prog = 1 - clamp(cat.pounceT / POUNCE_DURATION, 0, 1)
      cat.hopHeight = Math.sin(prog * Math.PI) * POUNCE_HOP_HEIGHT
      const px = -Math.sin(cat.yaw)
      const pz = -Math.cos(cat.yaw)
      const arc = Math.sin(prog * Math.PI) * POUNCE_FORWARD_SPEED
      cat.vel.set(px * arc, 0, pz * arc)
      cat.speed = arc

      // Contact lands a little past the apex, which is where it reads as a hit.
      if (prog >= 0.45 && !pounceResolved.current) {
        pounceResolved.current = true
        const caught = preyRegistry.tryCatch?.(cat.pos.x, cat.pos.z, POUNCE_RANGE) ?? false
        if (caught) {
          cat.eatT = EAT_DURATION
          const g = useGame.getState()
          g.addHunt()
          g.showToast(pick(CATCH_LINES, g.huntCount))
        }
      }
      if (cat.pounceT <= 0) {
        cat.pounceT = 0
        cat.hopHeight = 0
        pounceResolved.current = false
      }
    } else if (busy) {
      cat.eatT -= delta
      cat.vel.set(0, 0, 0)
      cat.speed = 0
      if (cat.eatT <= 0) {
        cat.eatT = 0
        feed(MEAL_HUNGER_RESTORE)
        const g = useGame.getState()
        // The ceremony replaces the eat line, it does not race it. The toast
        // has no queue, so both on the same frame means one of them is never
        // seen. This is the same collision the `wasResting` seed above fixes.
        if (g.pendingCeremony) g.promote()
        else g.showToast(pick(EAT_LINES, g.huntCount))
      }
    } else {
      // Crouching always resolves against the walk band. Scaling the run band
      // instead let a stalking cat hit 2.7 m/s, which does not read as sneaking.
      const runBand = wantMag > CAT_WALK_THRESHOLD && !cat.crouched
      let top = runBand ? CAT_RUN_SPEED : CAT_WALK_SPEED
      if (cat.crouched) top *= CAT_CROUCH_SPEED_MULT
      // Between moves a duel is ordinary movement at ordinary speed: full 360
      // control, same as outside combat. Distance management is the skill the
      // fight is teaching and it cannot be taught through treacle.
      if (duel.fleeing) top *= FLEE_SPEED_BONUS
      cat.hopHeight = 0
      const targetSpeed = wantMag * top

      _desired.set(_dir.x * targetSpeed, _dir.y * targetSpeed)
      const rate = targetSpeed > cat.speed ? CAT_ACCEL : CAT_DECEL
      const step = rate * delta

      cat.vel.x += clampAbs(_desired.x - cat.vel.x, step)
      cat.vel.z += clampAbs(_desired.y - cat.vel.z, step)
      cat.speed = Math.hypot(cat.vel.x, cat.vel.z)
      if (cat.speed < 0.02) {
        cat.vel.set(0, 0, 0)
        cat.speed = 0
      }
    }

    // --- integrate ----------------------------------------------------------
    cat.pos.x += cat.vel.x * delta
    cat.pos.z += cat.vel.z * delta

    pushOutOfTrees(cat.pos)

    const limit = WORLD_HALF - WORLD_EDGE_MARGIN
    cat.pos.x = clamp(cat.pos.x, -limit, limit)
    cat.pos.z = clamp(cat.pos.z, -limit, limit)
    cat.pos.y = groundHeightAt(cat.pos.x, cat.pos.z) + CAT_GROUND_OFFSET

    // --- facing -------------------------------------------------------------
    // A committed move locks the heading, same as the hunting pounce: the whole
    // point of the wind-up is that she has already chosen where the hit goes.
    if (cat.speed > 0.05 && cat.pounceT <= 0 && !locked) {
      const want = Math.atan2(-cat.vel.x, -cat.vel.z)
      cat.yaw += shortestAngle(cat.yaw, want) * Math.min(1, CAT_TURN_SPEED * delta)
    }

    // --- state --------------------------------------------------------------
    // Standing still in camp rests, full stop. It used to require !crouched,
    // which meant a thumb left on the paw button silently blocked all healing
    // with nothing on screen to explain why. She hunts with that button held,
    // so that was the common case, not the edge case.
    // Standing still mid-wind-up is not resting, and healing through a fight
    // would make the health bar meaningless.
    const atCamp = distToCamp(cat.pos.x, cat.pos.z) < CAMP_RADIUS
    live.resting =
      playing && atCamp && cat.speed < 0.05 && !busy && cat.pounceT <= 0 && !duel.active

    // Combat outranks everything: a swing, a flinch or a stumble is the one
    // thing on screen that has to read, and it is over in a third of a second.
    // Resting outranks crouch below it so the curled-up animation is an
    // unambiguous "this is working". Any movement drops straight back to crouch.
    const pose = playing ? duelPose(cat.duel) : null
    cat.action =
      pose ??
      (cat.pounceT > 0
        ? 'pounce'
        : busy
          ? 'eat'
          : live.resting
            ? 'rest'
            : cat.crouched
              ? 'crouch'
              : cat.speed > CAT_WALK_SPEED * 0.98
                ? 'run'
                : cat.speed > 0.05
                  ? 'walk'
                  : 'idle')

    if (playing) {
      // Rising edge only: say it once on arrival, not every frame she stands there.
      if (live.resting && !wasResting.current) {
        useGame.getState().showToast(pick(CAMP_LINES, restCount.current++))
      }
      wasResting.current = live.resting

      const event = tickNeeds(delta, live.resting)
      if (event === 'hunger-low' || event === 'hunger-empty') {
        useGame.getState().showToast(pick(HUNGER_LINES, event === 'hunger-empty' ? 1 : 0))
      }

      // Last toast written in the frame, so it wins: the toast has no queue, and
      // arriving somewhere new outranks a mouse. No edge flag is needed because
      // discover() sets the bit permanently and guards its own repeat.
      const found = undiscoveredHit(cat.pos.x, cat.pos.z, useGame.getState().discovered)
      if (found >= 0) useGame.getState().discover(found)

      saveTimer.current += delta
      if (saveTimer.current >= SAVE_INTERVAL_SEC) {
        saveTimer.current = 0
        useGame.getState().save()
      }
    }

    // --- apply --------------------------------------------------------------
    const g = group.current
    if (g) {
      g.position.set(cat.pos.x, cat.pos.y + cat.hopHeight, cat.pos.z)
      g.rotation.y = cat.yaw + CAT_MODEL_YAW_OFFSET
    }
    animator.update(cat.action, cat.speed, delta)

    // Strictly after the animator. The mixer rewrites every bone from the clip
    // inside animator.update, so tail and ear offsets written before this line
    // are erased in the same frame and the whole system looks like it is off.
    _juice.action = cat.action
    _juice.speed = cat.speed
    _juice.crouched = cat.crouched
    // Guard the divide. A frame with delta 0 -- which rAF hands you on the very
    // first frame, and again whenever two frames share a timestamp -- makes this
    // 0/0, and the resulting NaN is permanent: it flows into the tail's smoothed
    // counter-swing, and every later frame smooths NaN toward NaN. That wrote
    // NaN quaternions into all eight tail bones and deleted the tail and the
    // rump on screen. `__game.step()` always passes a fixed 1/60, so no amount
    // of stepped verification could ever reach this.
    _juice.yawRate = delta > 0 ? shortestAngle(prevYaw.current, cat.yaw) / delta : 0
    _juice.hopHeight = cat.hopHeight
    prevYaw.current = cat.yaw
    juice.update(_juice, delta)
  })

  return (
    <group ref={group}>
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

/** Circular push-out against trunks. 190 checks a frame is cheaper than a grid.
 *  Exported so the rival collides with the same trees rather than carrying a
 *  second copy of this loop that could drift out of step with it. */
export function pushOutOfTrees(pos: THREE.Vector3) {
  const bodyR = 0.35
  for (let i = 0; i < treeColliders.length; i++) {
    const t = treeColliders[i]
    const dx = pos.x - t.x
    const dz = pos.z - t.z
    const min = t.r + bodyR
    if (dx > min || dx < -min || dz > min || dz < -min) continue
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min || d2 === 0) continue
    const d = Math.sqrt(d2)
    const push = (min - d) / d
    pos.x += dx * push
    pos.z += dz * push
  }
}

function pick<T>(arr: readonly T[], n: number): T {
  return arr[Math.abs(n) % arr.length]
}

function hexOf(m: THREE.MeshStandardMaterial | undefined): string {
  return m ? `#${m.color.getHexString()}` : 'none'
}
