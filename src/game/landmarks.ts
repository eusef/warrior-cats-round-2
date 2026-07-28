import {
  FOURTREES_KEEPOUT,
  FOURTREES_POS,
  FOURTREES_TRIGGER_RADIUS,
  SUNNINGROCKS_KEEPOUT,
  SUNNINGROCKS_POS,
  SUNNINGROCKS_TRIGGER_RADIUS,
  THUNDERPATH_KEEPOUT_HALF_WIDTH,
  THUNDERPATH_TRIGGER_HALF_WIDTH,
  THUNDERPATH_Z,
} from './constants'
import { LANDMARK_NAMES } from '../content/lines'

/**
 * The three named places, and the pure geometry of finding them.
 *
 * No R3F import and no store import, so the whole discovery rule is assertable
 * headlessly: `undiscoveredHit(x, z, mask)` is a function of position and the
 * bitmask, nothing else. `Landmarks.tsx` draws these, `PlayerCat` tests them,
 * `Foliage` reads the keep-outs. This file is the single source for all three.
 *
 * Discovery needs no rising-edge flag, unlike camp resting: the bit is set
 * permanently on arrival, so the test can never fire twice. `store.reset()`
 * clears the mask and it correctly becomes findable again.
 */

/** A circle is a point; the Thunderpath is a stripe across the whole world. */
export type LandmarkShape = 'circle' | 'bandZ'

export interface Landmark {
  readonly id: number
  readonly name: string
  readonly x: number
  readonly z: number
  readonly shape: LandmarkShape
  /** Radius for a circle, half-width on z for a band. */
  readonly trigger: number
  /** Foliage inside this is removed. Half-width on z for a band. */
  readonly keepOut: number
}

/**
 * APPEND ONLY. `id` is the bit position in the persisted save, so reordering
 * this list hands her the wrong journal entries for the places she has found.
 */
export const LANDMARKS: readonly Landmark[] = [
  {
    id: 0,
    name: LANDMARK_NAMES[0],
    x: FOURTREES_POS[0],
    z: FOURTREES_POS[1],
    shape: 'circle',
    trigger: FOURTREES_TRIGGER_RADIUS,
    keepOut: FOURTREES_KEEPOUT,
  },
  {
    id: 1,
    name: LANDMARK_NAMES[1],
    x: SUNNINGROCKS_POS[0],
    z: SUNNINGROCKS_POS[1],
    shape: 'circle',
    trigger: SUNNINGROCKS_TRIGGER_RADIUS,
    keepOut: SUNNINGROCKS_KEEPOUT,
  },
  {
    id: 2,
    name: LANDMARK_NAMES[2],
    x: 0, // unused for a band; the road spans the world on x
    z: THUNDERPATH_Z,
    shape: 'bandZ',
    trigger: THUNDERPATH_TRIGGER_HALF_WIDTH,
    keepOut: THUNDERPATH_KEEPOUT_HALF_WIDTH,
  },
]

/** Every bit set. `discovered === LANDMARK_ALL_MASK` means she has found them all. */
export const LANDMARK_ALL_MASK = (1 << LANDMARKS.length) - 1

/**
 * Distance to a landmark in its own shape's terms: true distance for a circle,
 * perpendicular distance to the centre line for a band. Comparable against
 * `trigger` and `keepOut` either way.
 */
export function landmarkDistance(l: Landmark, x: number, z: number): number {
  if (l.shape === 'bandZ') return Math.abs(z - l.z)
  const dx = x - l.x
  const dz = z - l.z
  return Math.sqrt(dx * dx + dz * dz)
}

export function isDiscovered(mask: number, id: number): boolean {
  return (mask & (1 << id)) !== 0
}

export function withDiscovered(mask: number, id: number): number {
  return mask | (1 << id)
}

export function discoveredCount(mask: number): number {
  let n = 0
  for (const l of LANDMARKS) if (isDiscovered(mask, l.id)) n++
  return n
}

/**
 * The id of an undiscovered landmark she is standing in, or -1.
 *
 * Called every frame from `PlayerCat`, so it allocates nothing. Once all three
 * bits are set the loop still runs but can never match, which is three cheap
 * compares; not worth an early-out that would need its own invalidation.
 */
export function undiscoveredHit(x: number, z: number, mask: number): number {
  for (const l of LANDMARKS) {
    if (isDiscovered(mask, l.id)) continue
    if (landmarkDistance(l, x, z) < l.trigger) return l.id
  }
  return -1
}

/** True inside any landmark's keep-out. Foliage placement uses this to clear out. */
export function insideAnyKeepOut(x: number, z: number): boolean {
  for (const l of LANDMARKS) {
    if (landmarkDistance(l, x, z) < l.keepOut) return true
  }
  return false
}
