/**
 * Lets PlayerCat ask the prey system for a catch without importing Prey.tsx,
 * which would make the two modules circular.
 */
export const preyRegistry: {
  /** Returns true if a mouse was inside `radius` of (x, z) and was caught. */
  tryCatch: ((x: number, z: number, radius: number) => boolean) | null
  /** Distance to the nearest live mouse, or Infinity. Used for HUD hints. */
  nearestDist: ((x: number, z: number) => number) | null
} = {
  tryCatch: null,
  nearestDist: null,
}
