import { useMemo } from 'react'
import * as THREE from 'three'
import {
  TERRAIN_SEGMENTS,
  WORLD_SIZE,
  WORLD_HALF,
  CAMP_RADIUS,
} from '../game/constants'
import { distToCamp, groundHeightAt, smoothstep } from '../game/terrain'

const GRASS_DARK = new THREE.Color('#3c5a2b')
const GRASS_LIGHT = new THREE.Color('#6b8f42')
const DIRT = new THREE.Color('#7a6444')

/**
 * One displaced plane built from groundHeightAt(). Vertex colours give the
 * ground variation for free, so the whole 200m world is a single draw call
 * with a single material.
 */
export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      WORLD_SIZE,
      WORLD_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS,
    )
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, groundHeightAt(x, z))

      // Patchy grass, worn to dirt in the camp clearing.
      const patch =
        0.5 +
        0.5 *
          Math.sin(x * 0.21 + 2.3) *
          Math.cos(z * 0.17 - 1.1) *
          Math.sin((x + z) * 0.09)
      c.copy(GRASS_DARK).lerp(GRASS_LIGHT, patch)
      const worn = 1 - smoothstep(CAMP_RADIUS * 0.35, CAMP_RADIUS * 1.15, distToCamp(x, z))
      c.lerp(DIRT, worn * 0.75)

      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    pos.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow frustumCulled={false}>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

/**
 * A dark skirt around the world edge so the horizon never shows the void.
 * Cheap: one open-ended cylinder, backfaces only.
 */
export function WorldSkirt() {
  return (
    <mesh position={[0, -8, 0]}>
      <cylinderGeometry args={[WORLD_HALF * 1.06, WORLD_HALF * 1.06, 26, 24, 1, true]} />
      <meshBasicMaterial color="#2c3f22" side={THREE.BackSide} fog />
    </mesh>
  )
}
