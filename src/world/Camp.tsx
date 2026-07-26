import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  CAMP_POS,
  CAMP_RADIUS,
  CAMP_RING_OPACITY_IDLE,
  CAMP_RING_OPACITY_RESTING,
  CAMP_RING_WIDTH,
} from '../game/constants'
import { live } from '../game/live'
import { groundHeightAt } from '../game/terrain'
import { mulberry32 } from '../game/rng'
import { CampBeacon } from './CampBeacon'

const BOULDERS = 18
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()

/**
 * The camp: a ring of boulders around a worn clearing with a moss nest in the
 * middle. Standing still inside the ring restores health, so the ring itself
 * has to read as "this is the safe circle" with no HUD text explaining it.
 */
export function Camp() {
  const ringRef = useRef<THREE.Mesh>(null)
  const bouldersRef = useRef<THREE.InstancedMesh>(null)

  const boulderGeo = useMemo(() => {
    const g = new THREE.DodecahedronGeometry(0.8, 0)
    g.scale(1, 0.75, 1)
    return g
  }, [])

  useLayoutEffect(() => {
    const mesh = bouldersRef.current
    if (!mesh) return
    const rand = mulberry32(77)
    for (let i = 0; i < BOULDERS; i++) {
      const a = (i / BOULDERS) * Math.PI * 2 + rand() * 0.12
      // Inside the rest radius, never outside it. These stones were at
      // 7.4-8.3m while resting stops at 7.0, so the only camp boundary she
      // could see sat entirely outside the healing zone: walk to the stones,
      // stand on them, get nothing. Now reaching the stones means resting.
      const r = CAMP_RADIUS - 1.0 - rand() * 0.7
      const x = CAMP_POS[0] + Math.sin(a) * r
      const z = CAMP_POS[1] + Math.cos(a) * r
      _p.set(x, groundHeightAt(x, z) - 0.15, z)
      _e.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
      _q.setFromEuler(_e)
      _s.setScalar(0.55 + rand() * 0.7)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])

  // The ring brightens while the cat rests. The idle value was 0.14, which is
  // close to invisible on grass in daylight, so the one thing marking the
  // healing zone read as nothing at all.
  useFrame((_, rawDelta) => {
    const ring = ringRef.current
    if (!ring) return
    const mat = ring.material as THREE.MeshBasicMaterial
    const target = live.resting ? CAMP_RING_OPACITY_RESTING : CAMP_RING_OPACITY_IDLE
    const k = 1 - Math.exp(-6 * Math.min(rawDelta, 0.05))
    mat.opacity += (target - mat.opacity) * k
  })

  const campY = groundHeightAt(CAMP_POS[0], CAMP_POS[1])

  return (
    <group>
      <mesh
        ref={ringRef}
        position={[CAMP_POS[0], campY + 0.04, CAMP_POS[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[CAMP_RADIUS - CAMP_RING_WIDTH, CAMP_RADIUS, 48]} />
        <meshBasicMaterial
          color="#ffe6a3"
          transparent
          opacity={CAMP_RING_OPACITY_IDLE}
          depthWrite={false}
        />
      </mesh>

      {/* Moss nest. Sized against the 0.82m cat: a bed, not an arena. */}
      <mesh position={[CAMP_POS[0], campY + 0.04, CAMP_POS[1]]} receiveShadow>
        <cylinderGeometry args={[0.95, 1.15, 0.14, 14]} />
        <meshLambertMaterial color="#5c6b3a" />
      </mesh>
      <mesh
        position={[CAMP_POS[0], campY + 0.13, CAMP_POS[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <torusGeometry args={[0.95, 0.16, 6, 16]} />
        <meshLambertMaterial color="#6d5738" />
      </mesh>

      <instancedMesh
        ref={bouldersRef}
        args={[boulderGeo, undefined, BOULDERS]}
        castShadow
        receiveShadow
      >
        <meshLambertMaterial color="#7c7d75" />
      </instancedMesh>

      {/* Nothing else at camp stands taller than a 0.75m boulder, so this is
          the only part of it visible from across the map. */}
      <CampBeacon />
    </group>
  )
}
