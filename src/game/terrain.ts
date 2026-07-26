import {
  CAMP_POS,
  CAMP_RADIUS,
  TERRAIN_HILL_HEIGHT,
  TERRAIN_HILL_SCALE,
} from './constants'

/**
 * The single source of truth for ground height.
 *
 * The terrain mesh is built by sampling this function, and every actor samples
 * it directly instead of raycasting. Same function, so the cat is exactly on
 * the surface with no ray jitter and no per-frame BVH cost. See CLAUDE.md note
 * in the commit message: this replaces the raycast-down approach.
 */
export function groundHeightAt(x: number, z: number): number {
  const s = TERRAIN_HILL_SCALE
  let h =
    Math.sin(x * s * 2.1 + 1.7) * Math.cos(z * s * 1.7 - 0.4) * 0.55 +
    Math.sin((x + z) * s * 1.15 + 3.1) * 0.3 +
    Math.cos(x * s * 3.7 - 2.2) * Math.sin(z * s * 3.1 + 0.9) * 0.15
  h *= TERRAIN_HILL_HEIGHT
  return h * campFlatten(x, z)
}

/** 0 at the centre of camp, 1 outside it: flattens the clearing to a bowl. */
function campFlatten(x: number, z: number): number {
  const dx = x - CAMP_POS[0]
  const dz = z - CAMP_POS[1]
  const d = Math.sqrt(dx * dx + dz * dz)
  return smoothstep(CAMP_RADIUS * 0.7, CAMP_RADIUS * 2.4, d)
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function distToCamp(x: number, z: number): number {
  const dx = x - CAMP_POS[0]
  const dz = z - CAMP_POS[1]
  return Math.sqrt(dx * dx + dz * dz)
}
