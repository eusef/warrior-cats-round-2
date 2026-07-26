import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  FERN_COUNT,
  FOLIAGE_CLEARING_RADIUS,
  ROCK_COUNT,
  TREE_COUNT,
  TREE_MAX_SCALE,
  TREE_MIN_SCALE,
  WORLD_HALF,
} from '../game/constants'
import { distToCamp, groundHeightAt } from '../game/terrain'
import { mulberry32 } from '../game/rng'
import { useGame } from '../game/store'
import { mergeGeometries } from './geometry'

export interface TreeCollider {
  x: number
  z: number
  r: number
}

/** Trunk positions, read by PlayerCat for push-out. Rebuilt whenever the seed changes. */
export const treeColliders: TreeCollider[] = []

interface Placement {
  x: number
  z: number
  y: number
  scale: number
  rot: number
  tint: number
}

function placeField(
  rand: () => number,
  count: number,
  minScale: number,
  maxScale: number,
  clearing: number,
): Placement[] {
  const out: Placement[] = []
  let guard = 0
  while (out.length < count && guard < count * 40) {
    guard++
    const x = (rand() * 2 - 1) * (WORLD_HALF - 6)
    const z = (rand() * 2 - 1) * (WORLD_HALF - 6)
    if (distToCamp(x, z) < clearing) continue
    out.push({
      x,
      z,
      y: groundHeightAt(x, z),
      scale: minScale + rand() * (maxScale - minScale),
      rot: rand() * Math.PI * 2,
      tint: rand(),
    })
  }
  return out
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _euler = new THREE.Euler()
const _color = new THREE.Color()

/**
 * One material for every field. Per-instance colour rides on instanceColor, so
 * trunks, canopies, ferns and rocks all share it. That is 1 material instead of
 * 4 against the 15-material budget; draw calls are unaffected.
 */
const foliageMaterial = new THREE.MeshLambertMaterial({ vertexColors: false })

interface FieldProps {
  placements: Placement[]
  geometry: THREE.BufferGeometry
  colorA: string
  colorB: string
  /** Multiplies the placement scale, per geometry. */
  scaleMult?: number
  /** Random lean, radians. Trees get a little, rocks get a lot. */
  lean?: number
  castShadow?: boolean
}

function Field({
  placements,
  geometry,
  colorA,
  colorB,
  scaleMult = 1,
  lean = 0,
  castShadow = false,
}: FieldProps) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const a = new THREE.Color(colorA)
    const b = new THREE.Color(colorB)
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]
      _p.set(p.x, p.y, p.z)
      _euler.set(
        lean ? (p.tint - 0.5) * lean : 0,
        p.rot,
        lean ? (p.scale % 1 - 0.5) * lean : 0,
      )
      _q.setFromEuler(_euler)
      _s.setScalar(p.scale * scaleMult)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
      mesh.setColorAt(i, _color.copy(a).lerp(b, p.tint))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [placements, geometry, colorA, colorB, scaleMult, lean])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, foliageMaterial, placements.length]}
      castShadow={castShadow}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}

export function Foliage() {
  const seed = useGame((s) => s.seed)

  const { trees, ferns, rocks } = useMemo(() => {
    const rand = mulberry32(seed)
    const t = placeField(rand, TREE_COUNT, TREE_MIN_SCALE, TREE_MAX_SCALE, FOLIAGE_CLEARING_RADIUS)
    const f = placeField(rand, FERN_COUNT, 0.6, 1.4, FOLIAGE_CLEARING_RADIUS * 0.55)
    const r = placeField(rand, ROCK_COUNT, 0.5, 1.7, FOLIAGE_CLEARING_RADIUS * 0.7)

    treeColliders.length = 0
    for (const p of t) treeColliders.push({ x: p.x, z: p.z, r: 0.45 * p.scale })

    return { trees: t, ferns: f, rocks: r }
  }, [seed])

  // Geometry is shared across every instance, built once for the lifetime of the app.
  const geo = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5)
    trunk.translate(0, 1.6, 0)

    const canopyLow = new THREE.ConeGeometry(2.1, 3.0, 7)
    canopyLow.translate(0, 4.1, 0)
    const canopyMid = new THREE.ConeGeometry(1.6, 2.6, 7)
    canopyMid.translate(0, 5.6, 0)
    const canopyTop = new THREE.ConeGeometry(1.0, 2.2, 7)
    canopyTop.translate(0, 6.9, 0)
    const canopy = mergeGeometries([canopyLow, canopyMid, canopyTop])

    // A fern is three crossed blades, cheap and reads as undergrowth.
    const blade = new THREE.ConeGeometry(0.42, 1.1, 4)
    blade.translate(0, 0.55, 0)
    const b2 = blade.clone()
    b2.rotateZ(0.5)
    b2.translate(0.3, 0, 0.1)
    const b3 = blade.clone()
    b3.rotateZ(-0.45)
    b3.translate(-0.28, 0, -0.15)
    const fern = mergeGeometries([blade, b2, b3])

    const rock = new THREE.DodecahedronGeometry(0.55, 0)
    rock.scale(1, 0.62, 1.15)
    rock.translate(0, 0.2, 0)

    return { trunk, canopy, fern, rock }
  }, [])

  return (
    <group>
      <Field placements={trees} geometry={geo.trunk} colorA="#4a3524" colorB="#63482f" lean={0.09} />
      <Field
        placements={trees}
        geometry={geo.canopy}
        colorA="#2f5225"
        colorB="#4c7a30"
        lean={0.09}
        castShadow
      />
      <Field placements={ferns} geometry={geo.fern} colorA="#3f6b2a" colorB="#66933c" lean={0.35} />
      <Field placements={rocks} geometry={geo.rock} colorA="#6d6f68" colorB="#8f9188" lean={0.6} />
    </group>
  )
}
