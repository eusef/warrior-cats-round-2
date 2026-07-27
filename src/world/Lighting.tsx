import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { DAY_START_T, SUN_DISTANCE } from '../game/constants'
import { live } from '../game/live'
import { useGame } from '../game/store'
import {
  advanceTime,
  lightDirection,
  sampleSky,
  sky,
  sunDirection,
  sunElevation,
} from './daylight'

const SHADOW_EXTENT = 20

// Hoisted per the R3F rules: nothing is allocated inside the frame loop.
const _sunDir = new THREE.Vector3()
const _lightDir = new THREE.Vector3()

// Only ever visible for the frame between mount and the first useFrame, but a
// module-level vector rather than an inline literal so no re-render can hand
// the sky shader a fresh object to copy.
const INITIAL_SUN = sunDirection(DAY_START_T, new THREE.Vector3())

/**
 * One directional light with one 1024 shadow map, per the iPad budget. The
 * light rig is parented to nothing and simply chases the cat each frame so the
 * shadow frustum stays tight enough to look sharp at 1024.
 *
 * This is also the whole day/night cycle: the only caller of `advanceTime`, and
 * the only writer of `live.night` and `live.sunElev`. Everything the clock
 * touches is applied here by mutation, never by props, because a prop change
 * per frame re-renders and in the hemisphere light's case rebuilds the object.
 */
export function Lighting() {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  // drei's <Sky> forwards its ref to the underlying mesh, but the exported type
  // does not reach material.uniforms, so this one is loose on purpose.
  const skyRef = useRef<any>(null)
  const targetRef = useRef<THREE.Object3D>(null)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)

  // Created exactly once and then mutated below. It has to be an object we hold
  // on to: the old `if (!scene.fog)` built it at render time, which meant its
  // colour could never change and dusk left the fog stuck at noon blue. The
  // constructor values are the noon key and are overwritten on the first frame,
  // before anything is painted.
  const fog = useMemo(() => new THREE.Fog('#b9cfd8', 55, 190), [])
  if (scene.fog !== fog) scene.fog = fog

  useFrame((_, rawDelta) => {
    // Same clamp as every other useFrame here. It matters more in this one: an
    // unclamped delta from a backgrounded tab flings the sun across the sky.
    const delta = Math.min(rawDelta, 0.05)

    // Read the phase without subscribing. Subscribing would re-render the light
    // rig every frame; getState is the established pattern (see AudioDriver).
    // The clock only runs in play, so the title and creation screens hold at the
    // fixed pretty time the save or the default put us at.
    if (useGame.getState().phase === 'playing') advanceTime(delta)

    // Sampled and applied every frame regardless of phase, so the title screen
    // gets the same palette the world will have when she taps through.
    const t = live.timeOfDay
    sampleSky(t)
    live.night = sky.night
    live.sunElev = sunElevation(t)

    fog.color.copy(sky.fog)
    fog.near = sky.fogNear
    fog.far = sky.fogFar
    gl.toneMappingExposure = sky.exposure

    const hemi = hemiRef.current
    if (hemi) {
      hemi.color.copy(sky.hemiSky)
      hemi.groundColor.copy(sky.hemiGround)
      hemi.intensity = sky.hemiIntensity
    }

    // The shader gets the TRUE sun, which is allowed below the horizon: that
    // crossing is what actually produces sunset and night in the scattering.
    const u = skyRef.current?.material?.uniforms
    if (u) {
      u.sunPosition.value.copy(sunDirection(t, _sunDir))
      u.turbidity.value = sky.turbidity
      u.rayleigh.value = sky.rayleigh
      u.mieCoefficient.value = sky.mie
    }

    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return
    // Assigned here rather than as a prop: the ref is null on first render.
    if (light.target !== target) light.target = target
    light.color.copy(sky.sun)
    light.intensity = sky.sunIntensity
    const p = live.cat.pos
    target.position.set(p.x, p.y, p.z)
    target.updateMatrixWorld()
    // The light rig gets the clamped arc, never the true sun, so shadows never
    // come up from under the terrain once the sun has set.
    lightDirection(t, _lightDir)
    light.position.set(
      p.x + _lightDir.x * SUN_DISTANCE,
      p.y + _lightDir.y * SUN_DISTANCE,
      p.z + _lightDir.z * SUN_DISTANCE,
    )
  })

  return (
    <>
      {/* Every value below is an initial value only. The frame loop owns them
          from mount onward and writes straight to the uniforms, because a new
          prop each frame would re-render this whole subtree. */}
      <Sky
        ref={skyRef}
        distance={45000}
        sunPosition={INITIAL_SUN}
        turbidity={4}
        rayleigh={1.4}
        mieCoefficient={0.006}
        mieDirectionalG={0.8}
      />
      {/* args are CONSTRUCTOR arguments: changing them would make R3F dispose
          and rebuild the light every frame. Mutated through hemiRef instead. */}
      <hemisphereLight ref={hemiRef} args={['#cfe3ef', '#4a5c33', 0.95]} />
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
