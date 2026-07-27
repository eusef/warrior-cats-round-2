import * as THREE from 'three'
import {
  DAY_LENGTH_SEC,
  LIGHT_MIN_ELEVATION,
  SKY_KEYS,
  SUN_AZIMUTH_OFFSET,
  SUN_ELEV_AMP,
  SUN_ELEV_MID,
  type SkyKey,
} from '../game/constants'
import { live } from '../game/live'

/**
 * The clock and the sky palette, as pure functions over `live.timeOfDay`.
 *
 * Kept out of Lighting.tsx and free of any R3F import so the whole cycle can be
 * sampled and asserted from the debug bridge without a canvas, and so Fireflies
 * and AudioDriver can read the night factor without importing the light rig.
 *
 * Lighting.tsx is the only caller of `advanceTime`. Everything else reads.
 */

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const LIGHT_MIN_Y = Math.sin(LIGHT_MIN_ELEVATION * DEG)

/** Hex parsing is not free, so every key's colours are built once at load. */
interface BakedKey extends SkyKey {
  sunC: THREE.Color
  hemiSkyC: THREE.Color
  hemiGroundC: THREE.Color
  fogC: THREE.Color
}

const KEYS: BakedKey[] = SKY_KEYS.map((k) => ({
  ...k,
  sunC: new THREE.Color(k.sun),
  hemiSkyC: new THREE.Color(k.hemiSky),
  hemiGroundC: new THREE.Color(k.hemiGround),
  fogC: new THREE.Color(k.fog),
}))

/**
 * The sampled palette for the current frame. A single mutable object rather
 * than a fresh one per frame: this is read inside useFrame.
 */
export const sky = {
  sun: new THREE.Color(),
  sunIntensity: 0,
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  hemiIntensity: 0,
  fog: new THREE.Color(),
  fogNear: 0,
  fogFar: 0,
  exposure: 1,
  turbidity: 0,
  rayleigh: 0,
  mie: 0,
  night: 0,
}

/** Wraps into [0, 1). Handles negatives, which a bare % does not. */
export function wrapTime(t: number) {
  const w = t % 1
  return w < 0 ? w + 1 : w
}

/**
 * Advances the clock. Delta is clamped by the caller the same way every other
 * useFrame in the project clamps it, so a backgrounded tab coming back does not
 * fling the sun across the sky in one frame.
 */
export function advanceTime(delta: number) {
  live.timeOfDay = wrapTime(live.timeOfDay + delta / DAY_LENGTH_SEC)
}

/** Sun elevation in degrees at time t. Negative means below the horizon. */
export function sunElevation(t: number) {
  return SUN_ELEV_MID + SUN_ELEV_AMP * Math.sin(TAU * (t - 0.25))
}

/**
 * True sun direction, unit length. This is what the sky shader gets: it is
 * allowed to go below the horizon, which is what makes sunset and night.
 */
export function sunDirection(t: number, out: THREE.Vector3) {
  const elev = sunElevation(t) * DEG
  const az = TAU * (t - 0.25) + SUN_AZIMUTH_OFFSET
  const ce = Math.cos(elev)
  return out.set(ce * Math.sin(az), Math.sin(elev), ce * Math.cos(az))
}

/**
 * Where the shadow-casting light actually sits. The same arc as the sun, but
 * never allowed below LIGHT_MIN_ELEVATION, so light never comes from under the
 * terrain. The horizontal sweep continues through the night, which is why this
 * reads as a moon crossing the sky rather than the sun teleporting at dusk.
 */
export function lightDirection(t: number, out: THREE.Vector3) {
  sunDirection(t, out)
  if (out.y < LIGHT_MIN_Y) {
    out.y = LIGHT_MIN_Y
    out.normalize()
  }
  return out
}

/**
 * Interpolates the palette into `sky`. Linear between adjacent keys, wrapping
 * from the last key back through midnight to the first.
 */
export function sampleSky(t: number) {
  const n = KEYS.length
  let i = n - 1
  for (let k = 0; k < n; k++) {
    if (KEYS[k].t > t) {
      i = k - 1
      break
    }
  }
  // Before the first key means we are between the last key and the wrap.
  const a = KEYS[i < 0 ? n - 1 : i]
  const b = KEYS[i < 0 ? 0 : (i + 1) % n]
  // The span crossing midnight is measured the long way round the circle.
  const span = b.t > a.t ? b.t - a.t : b.t + 1 - a.t
  const local = t >= a.t ? t - a.t : t + 1 - a.t
  const f = span > 0 ? Math.min(1, Math.max(0, local / span)) : 0

  sky.sun.copy(a.sunC).lerp(b.sunC, f)
  sky.hemiSky.copy(a.hemiSkyC).lerp(b.hemiSkyC, f)
  sky.hemiGround.copy(a.hemiGroundC).lerp(b.hemiGroundC, f)
  sky.fog.copy(a.fogC).lerp(b.fogC, f)
  sky.sunIntensity = mix(a.sunIntensity, b.sunIntensity, f)
  sky.hemiIntensity = mix(a.hemiIntensity, b.hemiIntensity, f)
  sky.fogNear = mix(a.fogNear, b.fogNear, f)
  sky.fogFar = mix(a.fogFar, b.fogFar, f)
  sky.exposure = mix(a.exposure, b.exposure, f)
  sky.turbidity = mix(a.turbidity, b.turbidity, f)
  sky.rayleigh = mix(a.rayleigh, b.rayleigh, f)
  sky.mie = mix(a.mie, b.mie, f)
  sky.night = mix(a.night, b.night, f)
  return sky
}

function mix(a: number, b: number, f: number) {
  return a + (b - a) * f
}

/** "06:42". Debug readout only; the game never shows a clock. */
export function clockString(t: number) {
  const total = wrapTime(t) * 24 * 60
  const h = Math.floor(total / 60) % 24
  const m = Math.floor(total % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A word for the debug overlay, so a glance says more than a number. */
export function phaseName(t: number) {
  const e = sunElevation(t)
  const rising = Math.cos(TAU * (t - 0.25)) > 0
  if (e > 45) return 'midday'
  if (e > 12) return rising ? 'morning' : 'afternoon'
  if (e > 2) return rising ? 'sunrise' : 'golden'
  if (e > -6) return rising ? 'dawn' : 'sunset'
  // -8 rather than -16: the palette is already fully at night by the time the
  // sun is that far down, and calling 02:24 "first light" made the readout
  // disagree with what was on the screen.
  if (e > -8) return rising ? 'first light' : 'dusk'
  return 'night'
}
