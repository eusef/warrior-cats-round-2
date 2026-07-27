import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  FIREFLY_BLINK_RATE_MAX,
  FIREFLY_BLINK_RATE_MIN,
  FIREFLY_AHEAD_MIN_SPEED,
  FIREFLY_AHEAD_SPREAD,
  FIREFLY_BLINK_SHARPNESS,
  FIREFLY_BOB_AMOUNT,
  FIREFLY_BOB_RATE,
  FIREFLY_COLOR,
  FIREFLY_COUNT,
  FIREFLY_DRIFT_SPEED,
  FIREFLY_FADE_BAND,
  FIREFLY_MAX_HEIGHT,
  FIREFLY_MIN_HEIGHT,
  FIREFLY_NIGHT_THRESHOLD,
  FIREFLY_OPACITY,
  FIREFLY_RADIUS,
  FIREFLY_RESPAWN_INWARD_SPREAD,
  FIREFLY_SIZE,
} from '../game/constants'
import { live } from '../game/live'
import { mulberry32 } from '../game/rng'
import { groundHeightAt, smoothstep } from '../game/terrain'
import { useGame } from '../game/store'

const TAU = Math.PI * 2

// Coarse, but not as coarse as it first was: additive blending does NOT hide
// the facets. A meshBasic sphere under additive draws as a disc of uniform
// brightness, so at 6x4 a close mote was a visible octagon on screen. 8x6 plus
// the smaller FIREFLY_SIZE is what makes it read as a point of light.
// 80 triangles each, 5600 for the swarm.
const SPHERE_SEGMENTS_W = 8
const SPHERE_SEGMENTS_H = 6

const _m = new THREE.Matrix4()
const _color = new THREE.Color()

/**
 * One material for the whole swarm, so the field is a single draw call.
 *
 * Additive is right *here* specifically because fireflies only ever exist
 * against a dark night sky, where adding light is what a glow does. The camp
 * beacon reached the opposite answer for the opposite reason: it has to read
 * against a bright daytime sky, where additive washes out to nothing. Do not
 * "fix" one to match the other.
 *
 * Because it is additive, per-instance brightness in `instanceColor` does all
 * the fading work: a mote at brightness 0 adds nothing and is genuinely
 * invisible, whatever the opacity says. That is why nothing here animates
 * `opacity`, and why the colours written below are grayscale (instanceColor
 * multiplies the material colour rather than replacing it).
 */
const fireflyMaterial = new THREE.MeshBasicMaterial({
  color: FIREFLY_COLOR,
  transparent: true,
  opacity: FIREFLY_OPACITY,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  fog: false,
})

interface Swarm {
  /** Absolute world position. The disc follows the cat; the motes do not. */
  x: Float32Array
  z: Float32Array
  /** 0..1 between FIREFLY_MIN_HEIGHT and FIREFLY_MAX_HEIGHT. */
  height: Float32Array
  /** Drift direction, radians. */
  heading: Float32Array
  blinkRate: Float32Array
  blinkPhase: Float32Array
  bobPhase: Float32Array
}

/**
 * A field of glowing motes that exists only at night, in a disc that follows
 * the cat.
 *
 * Three deliberate choices:
 *
 * - **The disc is cat-relative.** 48 motes scattered over a 200m world would be
 *   one firefly every 20 metres, which reads as nothing. Keeping them within
 *   FIREFLY_RADIUS of her means the atmosphere is always where she is looking,
 *   for a count the iPad does not notice.
 * - **Additive blending**, for the reason on the material above.
 * - **Hidden by day.** The useFrame bails before the transform loop whenever
 *   the night factor is below FIREFLY_NIGHT_THRESHOLD, so for most of the cycle
 *   this component costs one comparison and zero draw calls.
 */
export function Fireflies() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const seed = useGame((s) => s.seed)
  const clockRef = useRef(0)

  // Salted the way Prey salts its seed, so the swarm is not laid out on the
  // same number stream as the trees and the mice.
  const swarm = useMemo<Swarm>(() => {
    const rand = mulberry32(seed ^ 0x1e0f)
    const s: Swarm = {
      x: new Float32Array(FIREFLY_COUNT),
      z: new Float32Array(FIREFLY_COUNT),
      height: new Float32Array(FIREFLY_COUNT),
      heading: new Float32Array(FIREFLY_COUNT),
      blinkRate: new Float32Array(FIREFLY_COUNT),
      blinkPhase: new Float32Array(FIREFLY_COUNT),
      bobPhase: new Float32Array(FIREFLY_COUNT),
    }
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      // sqrt of a uniform draw spreads the scatter evenly over the disc's area.
      // Without it they clump at the centre, on top of the cat.
      const r = Math.sqrt(rand()) * FIREFLY_RADIUS
      const a = rand() * TAU
      s.x[i] = live.cat.pos.x + Math.cos(a) * r
      s.z[i] = live.cat.pos.z + Math.sin(a) * r
      s.height[i] = rand()
      s.heading[i] = rand() * TAU
      s.blinkRate[i] =
        FIREFLY_BLINK_RATE_MIN + rand() * (FIREFLY_BLINK_RATE_MAX - FIREFLY_BLINK_RATE_MIN)
      s.blinkPhase[i] = rand() * TAU
      s.bobPhase[i] = rand() * TAU
    }
    return s
  }, [seed])

  // A second stream for the wrap, so respawning never disturbs the placement
  // sequence above. Calling it inside useFrame allocates nothing.
  const rand = useMemo(() => mulberry32(seed ^ 0x7c25), [seed])

  const geometry = useMemo(
    () => new THREE.SphereGeometry(FIREFLY_SIZE, SPHERE_SEGMENTS_W, SPHERE_SEGMENTS_H),
    [],
  )

  // The mesh does not own a geometry passed through args, so R3F will not
  // dispose it for us. Matters for HMR more than for shutdown, but it is a line.
  useEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    // Seeding every instance dark here does two jobs: the first rendered frame
    // cannot flash a wall of motes at the origin, and `setColorAt` allocates
    // `instanceColor` now instead of inside the first useFrame.
    _color.setScalar(0)
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      mesh.setMatrixAt(i, _m.makeTranslation(swarm.x[i], 0, swarm.z[i]))
      mesh.setColorAt(i, _color)
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor.needsUpdate = true
    }
    // Hidden is the safe default: a save that loads at night gets corrected by
    // the first useFrame, whereas visible-first would flash the swarm by day.
    mesh.visible = false
  }, [swarm])

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current
    if (!mesh) return

    // Lighting is the first useFrame subscriber inside <Suspense>, so this is
    // this frame's night factor rather than last frame's.
    const amount = smoothstep(FIREFLY_NIGHT_THRESHOLD, 1, live.night)
    if (amount <= 0) {
      // Out before the transform loop, deliberately: for most of the day/night
      // cycle this whole component is one comparison and no draw call.
      mesh.visible = false
      return
    }
    mesh.visible = true

    const delta = Math.min(rawDelta, 0.05)
    // A local accumulator rather than state.clock: nothing else in this project
    // reads state.clock, and this one steps correctly under __game.step().
    const clock = (clockRef.current += delta)

    const cx = live.cat.pos.x
    const cz = live.cat.pos.z
    // Read once per frame, not per mote: the respawn below aims at her heading.
    const vx = live.cat.vel.x
    const vz = live.cat.vel.z
    const speed = Math.hypot(vx, vz)
    const fadeStart = FIREFLY_RADIUS - FIREFLY_FADE_BAND
    const heightSpan = FIREFLY_MAX_HEIGHT - FIREFLY_MIN_HEIGHT

    for (let i = 0; i < FIREFLY_COUNT; i++) {
      // The heading swings on the bob's own clock, so a mote traces a lazy curve
      // instead of a straight line. Driven by the clock rather than by rand(),
      // because an RNG call per frame would make the drift depend on how many
      // frames happened to elapse.
      swarm.heading[i] +=
        Math.cos(clock * FIREFLY_BOB_RATE + swarm.bobPhase[i]) * FIREFLY_BOB_RATE * delta
      const heading = swarm.heading[i]
      let x = (swarm.x[i] += Math.cos(heading) * FIREFLY_DRIFT_SPEED * delta)
      let z = (swarm.z[i] += Math.sin(heading) * FIREFLY_DRIFT_SPEED * delta)

      let dist = Math.hypot(x - cx, z - cz)

      if (dist > FIREFLY_RADIUS) {
        // Wrapped to a fresh angle on the rim. This teleport is invisible only
        // because brightness is already 0 out here, which is the entire reason
        // FIREFLY_FADE_BAND exists.
        //
        // The angle is NOT uniform while she is moving. Measured in Chrome: at
        // a 7 m/s run she crosses the disc in two seconds against a 0.35 m/s
        // drift, so a uniform rim angle strands most of the swarm behind her
        // and the meadow goes dark precisely when she is out exploring. Drawing
        // from a cone centred on her heading means she runs into them instead.
        const moving = speed > FIREFLY_AHEAD_MIN_SPEED
        const base = moving ? Math.atan2(vz, vx) : rand() * TAU
        const a = moving ? base + (rand() - 0.5) * FIREFLY_AHEAD_SPREAD : base
        x = swarm.x[i] = cx + Math.cos(a) * FIREFLY_RADIUS
        z = swarm.z[i] = cz + Math.sin(a) * FIREFLY_RADIUS
        // Aimed back across the disc rather than at random, so the population
        // circulates through the bright middle instead of piling up on the rim.
        swarm.heading[i] = a + Math.PI + (rand() - 0.5) * FIREFLY_RESPAWN_INWARD_SPREAD
        dist = FIREFLY_RADIUS
      }

      const fade = 1 - smoothstep(fadeStart, FIREFLY_RADIUS, dist)

      const y =
        groundHeightAt(x, z) +
        FIREFLY_MIN_HEIGHT +
        swarm.height[i] * heightSpan +
        Math.sin(clock * FIREFLY_BOB_RATE * TAU + swarm.bobPhase[i]) * FIREFLY_BOB_AMOUNT

      // The raw sine spends half its cycle bright and reads as a slow pulse, so
      // it gets pushed toward dark to leave the flash. Measured in Chrome:
      // cubed left only one or two of the swarm lit at once, which read as a
      // rendering bug rather than a meadow. FIREFLY_BLINK_SHARPNESS is the dial.
      const raw = 0.5 + 0.5 * Math.sin(clock * swarm.blinkRate[i] * TAU + swarm.blinkPhase[i])
      const blink = Math.pow(raw, FIREFLY_BLINK_SHARPNESS)

      // Scale stays 1: the size is baked into the geometry radius.
      mesh.setMatrixAt(i, _m.makeTranslation(x, y, z))
      mesh.setColorAt(i, _color.setScalar(blink * fade * amount))
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, fireflyMaterial, FIREFLY_COUNT]}
      // The disc moves with the cat every frame, so a bounding sphere computed
      // once would be wrong immediately.
      frustumCulled={false}
    />
  )
}
