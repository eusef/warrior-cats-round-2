import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  PREY_CALM_RADIUS,
  PREY_COUNT,
  PREY_FLEE_RADIUS,
  PREY_FLEE_RADIUS_CROUCHED,
  PREY_FLEE_SPEED,
  PREY_RESPAWN_DELAY,
  PREY_RESPAWN_MIN_DIST,
  PREY_SCALE,
  PREY_SPAWN_MIN_FROM_CAMP,
  PREY_TURN_SPEED,
  PREY_WANDER_RADIUS,
  PREY_WANDER_RETARGET_MAX,
  PREY_WANDER_RETARGET_MIN,
  PREY_WANDER_SPEED,
  WORLD_EDGE_MARGIN,
  WORLD_HALF,
} from '../game/constants'
import { live } from '../game/live'
import { mulberry32 } from '../game/rng'
import { useGame } from '../game/store'
import { clamp, distToCamp, groundHeightAt } from '../game/terrain'
import { mergeGeometries } from '../world/geometry'
import { debugHooks } from '../debug/expose'
import { preyRegistry } from './preyRegistry'

interface Mouse {
  x: number
  z: number
  homeX: number
  homeZ: number
  targetX: number
  targetZ: number
  yaw: number
  alive: boolean
  /** Seconds until this mouse comes back after being caught. */
  respawn: number
  /** Seconds until it picks a new wander target. */
  retarget: number
  bob: number
  fleeing: boolean
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const HIDDEN = new THREE.Vector3(0, 0, 0)

/**
 * All the mice in one InstancedMesh: one draw call for the lot. No skinning,
 * no GLB. The pack has no prey-scale animal, and a 24cm mouse eight metres away
 * does not need a skeleton, it needs to be legible and free.
 */
export function Prey() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const seed = useGame((s) => s.seed)

  const geometry = useMemo(() => buildMouse(), [])

  const mice = useMemo<Mouse[]>(() => {
    const rand = mulberry32(seed ^ 0x9e37)
    const out: Mouse[] = []
    for (let i = 0; i < PREY_COUNT; i++) {
      const { x, z } = scatter(rand)
      out.push({
        x,
        z,
        homeX: x,
        homeZ: z,
        targetX: x,
        targetZ: z,
        yaw: rand() * Math.PI * 2,
        alive: true,
        respawn: 0,
        retarget: PREY_WANDER_RETARGET_MIN + rand() * PREY_WANDER_RETARGET_MAX,
        bob: rand() * Math.PI * 2,
        fleeing: false,
      })
    }
    return out
  }, [seed])

  const rand = useMemo(() => mulberry32(seed ^ 0x51ed), [seed])

  // Publish the catch API for PlayerCat, and the debug inspectors.
  useEffect(() => {
    preyRegistry.tryCatch = (x, z, radius) => {
      let best = -1
      let bestD2 = radius * radius
      for (let i = 0; i < mice.length; i++) {
        const m = mice[i]
        if (!m.alive) continue
        const dx = m.x - x
        const dz = m.z - z
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) {
          bestD2 = d2
          best = i
        }
      }
      if (best < 0) return false
      mice[best].alive = false
      mice[best].respawn = PREY_RESPAWN_DELAY
      return true
    }

    preyRegistry.nearestDist = (x, z) => {
      let best = Infinity
      for (const m of mice) {
        if (!m.alive) continue
        best = Math.min(best, Math.hypot(m.x - x, m.z - z))
      }
      return best
    }

    debugHooks.dumpPrey = () =>
      mice.map((m, i) => ({
        i,
        alive: m.alive,
        fleeing: m.fleeing,
        x: Math.round(m.x * 100) / 100,
        z: Math.round(m.z * 100) / 100,
        dist: Math.round(Math.hypot(m.x - live.cat.pos.x, m.z - live.cat.pos.z) * 100) / 100,
      }))

    debugHooks.forcePreyNear = (dist) => {
      const m = mice.find((x) => x.alive) ?? mice[0]
      // Straight in front of the cat: forward is (-sin yaw, -cos yaw).
      m.alive = true
      m.respawn = 0
      m.fleeing = false // otherwise a previous scenario's panic leaks into this one
      m.x = live.cat.pos.x - Math.sin(live.cat.yaw) * dist
      m.z = live.cat.pos.z - Math.cos(live.cat.yaw) * dist
      m.homeX = m.x
      m.homeZ = m.z
      m.targetX = m.x
      m.targetZ = m.z
      return mice.indexOf(m)
    }

    return () => {
      preyRegistry.tryCatch = null
      preyRegistry.nearestDist = null
      debugHooks.dumpPrey = undefined
      debugHooks.forcePreyNear = undefined
    }
  }, [mice])

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const delta = Math.min(rawDelta, 0.05)
    const playing = useGame.getState().phase === 'playing'
    const cx = live.cat.pos.x
    const cz = live.cat.pos.z
    const fleeRadius = live.cat.crouched ? PREY_FLEE_RADIUS_CROUCHED : PREY_FLEE_RADIUS

    let active = 0

    for (let i = 0; i < mice.length; i++) {
      const m = mice[i]

      if (!m.alive) {
        if (playing) {
          m.respawn -= delta
          if (m.respawn <= 0) respawn(m, rand, cx, cz)
        }
        _m.compose(HIDDEN, _q.identity(), _s.setScalar(0))
        mesh.setMatrixAt(i, _m)
        continue
      }
      active++

      if (playing) {
        const dx = m.x - cx
        const dz = m.z - cz
        const dist = Math.hypot(dx, dz)

        if (dist < fleeRadius) m.fleeing = true
        else if (dist > PREY_CALM_RADIUS) m.fleeing = false

        let vx = 0
        let vz = 0

        if (m.fleeing) {
          const inv = dist > 0.001 ? 1 / dist : 0
          vx = dx * inv * PREY_FLEE_SPEED
          vz = dz * inv * PREY_FLEE_SPEED
        } else {
          m.retarget -= delta
          if (m.retarget <= 0) {
            m.retarget =
              PREY_WANDER_RETARGET_MIN +
              rand() * (PREY_WANDER_RETARGET_MAX - PREY_WANDER_RETARGET_MIN)
            const a = rand() * Math.PI * 2
            const r = rand() * PREY_WANDER_RADIUS
            m.targetX = m.homeX + Math.sin(a) * r
            m.targetZ = m.homeZ + Math.cos(a) * r
          }
          const tx = m.targetX - m.x
          const tz = m.targetZ - m.z
          const td = Math.hypot(tx, tz)
          if (td > 0.25) {
            vx = (tx / td) * PREY_WANDER_SPEED
            vz = (tz / td) * PREY_WANDER_SPEED
          }
        }

        m.x += vx * delta
        m.z += vz * delta

        const limit = WORLD_HALF - WORLD_EDGE_MARGIN
        m.x = clamp(m.x, -limit, limit)
        m.z = clamp(m.z, -limit, limit)

        const moving = vx !== 0 || vz !== 0
        if (moving) {
          const want = Math.atan2(-vx, -vz)
          m.yaw += shortest(m.yaw, want) * Math.min(1, PREY_TURN_SPEED * delta)
          // Scurry hop, faster when bolting.
          m.bob += delta * (m.fleeing ? 26 : 13)
        }
      }

      const hop = Math.abs(Math.sin(m.bob)) * 0.035
      _p.set(m.x, groundHeightAt(m.x, m.z) + hop, m.z)
      _e.set(0, m.yaw, 0)
      _q.setFromEuler(_e)
      _s.setScalar(PREY_SCALE)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
    }

    mesh.instanceMatrix.needsUpdate = true
    live.stats.preyActive = active
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, PREY_COUNT]}
      castShadow
      frustumCulled={false}
    >
      <meshLambertMaterial color="#8a7263" />
    </instancedMesh>
  )
}

function scatter(rand: () => number) {
  const limit = WORLD_HALF - WORLD_EDGE_MARGIN - 4
  for (let tries = 0; tries < 60; tries++) {
    const x = (rand() * 2 - 1) * limit
    const z = (rand() * 2 - 1) * limit
    if (distToCamp(x, z) > PREY_SPAWN_MIN_FROM_CAMP) return { x, z }
  }
  return { x: limit * 0.5, z: limit * 0.5 }
}

/** Comes back somewhere the cat is not looking at, so mice never pop in on screen. */
function respawn(m: Mouse, rand: () => number, cx: number, cz: number) {
  for (let tries = 0; tries < 40; tries++) {
    const { x, z } = scatter(rand)
    if (Math.hypot(x - cx, z - cz) < PREY_RESPAWN_MIN_DIST) continue
    m.x = x
    m.z = z
    m.homeX = x
    m.homeZ = z
    m.targetX = x
    m.targetZ = z
    m.alive = true
    m.fleeing = false
    m.respawn = 0
    m.retarget = 0
    return
  }
  m.respawn = 1 // world is crowded right now, try again shortly
}

function shortest(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Body, head, two ears and a tail, merged once. Faces -Z to match the cat. */
function buildMouse(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.3, 8, 6)
  body.scale(1, 0.85, 1.5)
  body.translate(0, 0.26, 0)

  const head = new THREE.SphereGeometry(0.19, 7, 5)
  head.translate(0, 0.3, -0.42)

  const earL = new THREE.SphereGeometry(0.1, 6, 4)
  earL.scale(1, 1, 0.4)
  earL.translate(0.13, 0.44, -0.4)
  const earR = earL.clone()
  earR.translate(-0.26, 0, 0)

  const tail = new THREE.CylinderGeometry(0.018, 0.05, 0.72, 4)
  tail.rotateX(Math.PI / 2)
  tail.translate(0, 0.2, 0.66)

  return mergeGeometries([body, head, earL, earR, tail])
}
