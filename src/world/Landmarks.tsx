import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  FOURTREES_POS,
  FOURTREES_RING_RADIUS,
  FOURTREES_SCALE,
  LANDMARK_COLOR_CANOPY,
  LANDMARK_COLOR_ROCK,
  LANDMARK_COLOR_TRUNK,
  LANDMARK_ROAD_COLOR,
  SUNNINGROCKS_COUNT,
  SUNNINGROCKS_POS,
  SUNNINGROCKS_SPREAD,
  THUNDERPATH_LIFT,
  THUNDERPATH_SEGMENTS,
  THUNDERPATH_WIDTH,
  THUNDERPATH_Z,
  WORLD_HALF,
} from '../game/constants'
import { mulberry32 } from '../game/rng'
import { useGame } from '../game/store'
import { groundHeightAt } from '../game/terrain'
import { foliageMaterial, treeColliders } from './Foliage'
import { mergeGeometries } from './geometry'

/**
 * The three named places, drawn.
 *
 * Everything here reuses `foliageMaterial` from Foliage, so all of this costs
 * ZERO new materials against the 17 budget. That material takes its colour from
 * instanceColor rather than a uniform, which is why even the single road quad is
 * an InstancedMesh of one: a plain <mesh> would render it untinted white.
 *
 * Four draw calls total (trunks, canopies, rocks, road) and each is its own mesh
 * rather than one merged super-geometry, so a landmark on the far side of the
 * world frustum-culls instead of being submitted every frame.
 *
 * Nothing here animates and nothing subscribes to useFrame: these are static
 * props. The discovery rule lives in game/landmarks.ts, not here.
 */

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _euler = new THREE.Euler()
const _color = new THREE.Color()

interface Prop {
  x: number
  y: number
  z: number
  scale: number
  rot: number
  lean: number
}

/** One instanced draw of a shared geometry, coloured per instance. */
function PropField({
  props,
  geometry,
  color,
  castShadow = false,
}: {
  props: Prop[]
  geometry: THREE.BufferGeometry
  color: string
  castShadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    _color.set(color)
    for (let i = 0; i < props.length; i++) {
      const p = props[i]
      _p.set(p.x, p.y, p.z)
      _euler.set(p.lean, p.rot, p.lean * 0.6)
      _q.setFromEuler(_euler)
      _s.setScalar(p.scale)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
      mesh.setColorAt(i, _color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [props, geometry, color])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, foliageMaterial, props.length]}
      castShadow={castShadow}
      receiveShadow={false}
    />
  )
}

export function Landmarks() {
  // Not used to place anything: only to re-push the oak colliders after Foliage
  // rebuilds. Foliage clears treeColliders inside a useMemo on every seed
  // change, which would silently drop the oaks and let her walk through the
  // ring. Foliage renders before this component, and effects run after render,
  // so by the time this re-pushes the forest list has already been rebuilt.
  const seed = useGame((s) => s.seed)

  // Fixed seed, not the world seed: these three places are hand-placed
  // landmarks, so they must look the same in every world she loads.
  const { oaks, rocks } = useMemo(() => {
    const rand = mulberry32(20260727)

    const oaks: Prop[] = []
    for (let i = 0; i < 4; i++) {
      // Exactly four, on the diagonals, so the gap between them reads as a way
      // in from any direction she approaches from.
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const x = FOURTREES_POS[0] + Math.cos(a) * FOURTREES_RING_RADIUS
      const z = FOURTREES_POS[1] + Math.sin(a) * FOURTREES_RING_RADIUS
      oaks.push({
        x,
        y: groundHeightAt(x, z),
        z,
        scale: FOURTREES_SCALE * (0.92 + rand() * 0.16),
        rot: rand() * Math.PI * 2,
        // Leaning outward would open the ring; they lean in, over the clearing.
        lean: -0.05,
      })
    }

    const rocks: Prop[] = []
    for (let i = 0; i < SUNNINGROCKS_COUNT; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * SUNNINGROCKS_SPREAD
      const x = SUNNINGROCKS_POS[0] + Math.cos(a) * r
      const z = SUNNINGROCKS_POS[1] + Math.sin(a) * r
      rocks.push({
        x,
        // Sunk slightly so they read as outcrop rather than dropped pebbles.
        y: groundHeightAt(x, z) - 0.35,
        z,
        scale: 2.6 + rand() * 2.4,
        rot: rand() * Math.PI * 2,
        lean: (rand() - 0.5) * 0.5,
      })
    }

    return { oaks, rocks }
  }, [])

  const geo = useMemo(() => {
    // The same recipe as an ordinary tree, scaled up by FOURTREES_SCALE at the
    // instance. Rebuilt here rather than imported so Foliage keeps its geometry
    // private and these can be tuned without touching the forest.
    const trunk = new THREE.CylinderGeometry(0.26, 0.42, 3.6, 6)
    trunk.translate(0, 1.8, 0)

    const c1 = new THREE.ConeGeometry(2.4, 3.2, 8)
    c1.translate(0, 4.4, 0)
    const c2 = new THREE.ConeGeometry(1.85, 2.8, 8)
    c2.translate(0, 6.0, 0)
    const c3 = new THREE.ConeGeometry(1.15, 2.4, 8)
    c3.translate(0, 7.4, 0)
    const canopy = mergeGeometries([c1, c2, c3])

    const rock = new THREE.DodecahedronGeometry(0.62, 0)
    rock.scale(1.25, 0.66, 1.0)

    // The Thunderpath drapes over the hills instead of cutting them: sampling
    // groundHeightAt per vertex keeps it on the surface without touching that
    // function, which every actor and the terrain mesh also read.
    const road = new THREE.PlaneGeometry(
      WORLD_HALF * 2,
      THUNDERPATH_WIDTH,
      THUNDERPATH_SEGMENTS,
      1,
    )
    road.rotateX(-Math.PI / 2)
    const pos = road.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i) + THUNDERPATH_Z
      pos.setY(i, groundHeightAt(x, z) + THUNDERPATH_LIFT)
    }
    road.computeVertexNormals()

    return { trunk, canopy, rock, road }
  }, [])

  // Four geometries owned outright by this component and shared across its
  // instanced meshes, so nothing else can be holding them at unmount.
  useEffect(
    () => () => {
      geo.trunk.dispose()
      geo.canopy.dispose()
      geo.rock.dispose()
      geo.road.dispose()
    },
    [geo],
  )

  // The great oaks are solid, exactly like every other tree. Without this she
  // walks straight through the ring and it reads as scenery, not a place.
  useEffect(() => {
    const added = oaks.map((o) => ({ x: o.x, z: o.z, r: 0.5 * o.scale }))
    treeColliders.push(...added)
    return () => {
      for (const c of added) {
        const i = treeColliders.indexOf(c)
        if (i >= 0) treeColliders.splice(i, 1)
      }
    }
  }, [oaks, seed])

  const roadProp = useMemo<Prop[]>(
    () => [{ x: 0, y: 0, z: THUNDERPATH_Z, scale: 1, rot: 0, lean: 0 }],
    [],
  )

  return (
    <group>
      <PropField props={oaks} geometry={geo.trunk} color={LANDMARK_COLOR_TRUNK} />
      <PropField props={oaks} geometry={geo.canopy} color={LANDMARK_COLOR_CANOPY} castShadow />
      <PropField props={rocks} geometry={geo.rock} color={LANDMARK_COLOR_ROCK} />
      <PropField props={roadProp} geometry={geo.road} color={LANDMARK_ROAD_COLOR} />
    </group>
  )
}
