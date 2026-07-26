import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { live } from '../game/live'

/** Mid-morning sun. Fixed for v1; the day/night cycle is backlog item 5. */
const SUN_DIR = new THREE.Vector3(0.42, 0.72, 0.55).normalize()
const SUN_DISTANCE = 42
const SHADOW_EXTENT = 20

/**
 * One directional light with one 1024 shadow map, per the iPad budget. The
 * light rig is parented to nothing and simply chases the cat each frame so the
 * shadow frustum stays tight enough to look sharp at 1024.
 */
export function Lighting() {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)
  const scene = useThree((s) => s.scene)

  if (!scene.fog) {
    scene.fog = new THREE.Fog('#b9cfd8', 55, 190)
  }

  useFrame(() => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return
    // Assigned here rather than as a prop: the ref is null on first render.
    if (light.target !== target) light.target = target
    const p = live.cat.pos
    target.position.set(p.x, p.y, p.z)
    target.updateMatrixWorld()
    light.position.set(
      p.x + SUN_DIR.x * SUN_DISTANCE,
      p.y + SUN_DIR.y * SUN_DISTANCE,
      p.z + SUN_DIR.z * SUN_DISTANCE,
    )
  })

  return (
    <>
      <Sky
        distance={45000}
        sunPosition={[SUN_DIR.x, SUN_DIR.y, SUN_DIR.z]}
        turbidity={4}
        rayleigh={1.4}
        mieCoefficient={0.006}
        mieDirectionalG={0.8}
      />
      <hemisphereLight args={['#cfe3ef', '#4a5c33', 0.95]} />
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        castShadow
        intensity={1.35}
        color="#fff3dd"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-bias={-0.0009}
        shadow-normalBias={0.02}
      />
    </>
  )
}
