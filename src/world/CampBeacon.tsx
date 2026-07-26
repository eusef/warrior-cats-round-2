import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  CAMP_BEACON_COLOR,
  CAMP_BEACON_FADE_FAR,
  CAMP_BEACON_FADE_LERP,
  CAMP_BEACON_FADE_NEAR,
  CAMP_BEACON_GHOST_OPACITY,
  CAMP_BEACON_HEIGHT,
  CAMP_BEACON_OPACITY,
  CAMP_BEACON_RADIUS_BOTTOM,
  CAMP_BEACON_RADIUS_TOP,
  CAMP_BEACON_SHIMMER,
  CAMP_BEACON_SOLID_FRACTION,
  CAMP_BEACON_SPIN_SPEED,
  CAMP_POS,
} from '../game/constants'
import { live } from '../game/live'
import { distToCamp, groundHeightAt, smoothstep } from '../game/terrain'

const RADIAL_SEGMENTS = 16
// The vertical alpha ramp is baked into vertex colours, so it needs enough rings
// to curve. 14 costs 448 triangles, which is nothing against the 150k budget.
const HEIGHT_SEGMENTS = 14
const SHIMMER_BANDS = 3

/**
 * A shaft of sunlight falling into the camp clearing: the only thing about camp
 * that is visible from across the map.
 *
 * Three deliberate choices, all for legibility rather than realism:
 *
 * - `fog={false}`. Scene fog saturates at 190m toward a pale blue-grey, which
 *   would erase the beam exactly when it is most needed. Opting out is the
 *   whole point of the feature.
 * - `meshBasicMaterial`. The directional light's shadow box only follows the
 *   cat by ±20m, so camp is effectively unlit at range. Anything lighting-
 *   dependent would go dark precisely when she is far away.
 * - It fades out as she arrives. Standing inside a 38m pillar of light is ugly
 *   and hides the cat, so the beam hands off to the ground ring, which already
 *   brightens while resting.
 */
export function CampBeacon() {
  const groupRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const ghostMatRef = useRef<THREE.MeshBasicMaterial>(null)

  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(
      CAMP_BEACON_RADIUS_TOP,
      CAMP_BEACON_RADIUS_BOTTOM,
      CAMP_BEACON_HEIGHT,
      RADIAL_SEGMENTS,
      HEIGHT_SEGMENTS,
      true, // open ended: caps would read as a lid on the beam
    )

    // Per-vertex alpha. three.js uses the 4th component when the colour
    // attribute has itemSize 4 (USE_COLOR_ALPHA), so this needs no shader.
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 4)
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + CAMP_BEACON_HEIGHT / 2) / CAMP_BEACON_HEIGHT // 0 base, 1 top
      // Solid through the treeline, then dissolving into the sky above it.
      let a = 1 - smoothstep(CAMP_BEACON_SOLID_FRACTION, 1, t)
      // Soften where it meets the ground so the base is not a hard cut rim.
      a *= smoothstep(0, 0.04, t)
      // Vary around the circumference so the slow spin below actually reads.
      const theta = Math.atan2(pos.getZ(i), pos.getX(i))
      a *= 1 - CAMP_BEACON_SHIMMER + CAMP_BEACON_SHIMMER * Math.sin(theta * SHIMMER_BANDS)
      colors[i * 4 + 0] = 1
      colors[i * 4 + 1] = 1
      colors[i * 4 + 2] = 1
      colors[i * 4 + 3] = a
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4))
    return g
  }, [])

  // Both meshes share this geometry and neither owns it, so R3F will not dispose
  // it for us. Only matters for HMR during development, but it is one line.
  useEffect(() => () => geo.dispose(), [geo])

  useFrame((_, rawDelta) => {
    const group = groupRef.current
    const mat = matRef.current
    const ghost = ghostMatRef.current
    if (!group || !mat || !ghost) return

    const delta = Math.min(rawDelta, 0.05)

    // Camp mounts before PlayerCat, so this position is one frame stale. That is
    // invisible under an exponential lerp and matches how the rest ring already
    // reads live.resting.
    const d = distToCamp(live.cat.pos.x, live.cat.pos.z)
    const target = smoothstep(CAMP_BEACON_FADE_NEAR, CAMP_BEACON_FADE_FAR, d) * CAMP_BEACON_OPACITY
    mat.opacity += (target - mat.opacity) * (1 - Math.exp(-CAMP_BEACON_FADE_LERP * delta))
    ghost.opacity = mat.opacity * CAMP_BEACON_GHOST_OPACITY

    // Skip both draw calls entirely once she is in camp and it has faded out.
    group.visible = mat.opacity > 0.003
    if (group.visible) group.rotation.y += CAMP_BEACON_SPIN_SPEED * delta
  })

  const campY = groundHeightAt(CAMP_POS[0], CAMP_POS[1])

  return (
    <group
      ref={groupRef}
      position={[CAMP_POS[0], campY + CAMP_BEACON_HEIGHT / 2, CAMP_POS[1]]}
    >
      {/* Pass 1: depth-tested, so the beam sits properly behind whatever is in
          front of it and reads as a real thing standing in the world. */}
      <mesh geometry={geo}>
        <meshBasicMaterial
          ref={matRef}
          color={CAMP_BEACON_COLOR}
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Pass 2: the same shaft with depth testing off, faint. This is the half
          that survives a trunk standing between her and camp. renderOrder keeps
          it after the opaque pass so it lays over the canopy rather than under. */}
      <mesh geometry={geo} renderOrder={10}>
        <meshBasicMaterial
          ref={ghostMatRef}
          color={CAMP_BEACON_COLOR}
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
          fog={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
