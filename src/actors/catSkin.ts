import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { EYE_COLORS, PELTS } from '../game/constants'
import type { Identity } from '../game/store'

/**
 * One cat's worth of clone-and-recolour, for every cat in the game.
 *
 * `Cat.glb` is a single mesh with five primitives and five materials: `Main`,
 * `Main_Light`, `Grey`, `Black`, `Eyes`. Two of those five are shared across all
 * cats and three are not, and which is which is the whole point of this module.
 *
 * `Main`, `Main_Light` and `Eyes` are the per-cat colours: the pelt she picked in
 * creation, the rival's fixed browns, whatever a networked peer sends. Each cat
 * gets its own clone of those three, because sharing them means painting one cat
 * repaints every cat, and two identical cats in a scuffle at arm's length on an
 * iPad is unreadable.
 *
 * `Grey` and `Black` are the inner ear, paw pads, claws, nose leather and mouth
 * line, and **nothing anywhere recolours them** -- not creation, not the rival's
 * fixed hexes, not `paintFixed`, which has no argument for them. So there is one
 * instance of each for the whole game, cloned lazily off the first material of
 * that name any cat walks past and handed to every cat after that.
 *
 * **Anything that ever needs to recolour Grey or Black must stop sharing it
 * first.** A write to a shared material tints every cat on screen in the same
 * frame, and it reads as a bug in the other cat rather than in the line that did
 * it.
 *
 * The arithmetic, against the 22-material budget in CLAUDE.md. Cloning all five
 * per cat costs 5, 10, 15 for one, two, three cats. Two shared plus three cloned
 * per cat costs 5, 8, 11. The third cat therefore moves the budget 22 -> 23
 * instead of 22 -> 27, which is over.
 */

/** The three GLB material slots a cat's colours are painted onto. */
export interface PeltSlots {
  main: THREE.MeshStandardMaterial[]
  light: THREE.MeshStandardMaterial[]
  eyes: THREE.MeshStandardMaterial[]
}

// The two shared instances, created on first use. Cloned rather than used
// straight off the GLB because `useGLTF` caches that scene and hands the very
// same materials to the next cat that loads it: mutating one would reach back
// into the cache.
let sharedGrey: THREE.MeshStandardMaterial | null = null
let sharedBlack: THREE.MeshStandardMaterial | null = null

/**
 * A fresh scene graph for one cat, plus handles on the materials it can paint.
 *
 * `SkeletonUtils.clone` is mandatory and is R3F rule 2 in CLAUDE.md: a plain
 * `useGLTF` reuse shares the skeleton, and every cat animates identically. This
 * project has hit that more than once. It also keeps StrictMode's double mount
 * from attaching the same scene graph twice.
 */
export function cloneCatSkin(scene: THREE.Object3D): { model: THREE.Group; slots: PeltSlots } {
  const cloned = skeletonClone(scene) as THREE.Group
  const slots: PeltSlots = { main: [], light: [], eyes: [] }
  cloned.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.frustumCulled = false // skinned bounds go stale mid-animation
    const src = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
    mesh.material = Array.isArray(src) ? src.map((m) => track(slots, m)) : track(slots, src)
  })
  return { model: cloned, slots }
}

/**
 * Per-cat clone for the three painted slots, the one shared instance for the two
 * that are never painted.
 *
 * An unrecognised name is cloned. That is defensive and should never happen with
 * `Cat.glb`, but nothing here can know whether some future caller paints it, and
 * a wrongly shared material is a bug that shows up on a different cat.
 */
function track(slots: PeltSlots, m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if (m.name === 'Grey') {
    if (!sharedGrey) sharedGrey = m.clone()
    return sharedGrey
  }
  if (m.name === 'Black') {
    if (!sharedBlack) sharedBlack = m.clone()
    return sharedBlack
  }
  const c = m.clone()
  if (m.name === 'Main') slots.main.push(c)
  else if (m.name === 'Main_Light') slots.light.push(c)
  else if (m.name === 'Eyes') slots.eyes.push(c)
  return c
}

/**
 * Paint from a saved identity: indices into PELTS and EYE_COLORS, never hex.
 * The `?? [0]` fallbacks are what make a junk index render a ginger cat rather
 * than throw on `pelt.main`.
 */
export function paint(slots: PeltSlots, id: Identity): void {
  const pelt = PELTS[id.pelt] ?? PELTS[0]
  const eye = EYE_COLORS[id.eyes] ?? EYE_COLORS[0]
  paintFixed(slots, pelt.main, pelt.light, eye.color)
}

/**
 * Paint from three hexes, for a cat whose colours are not a PELTS index: the
 * rival's fixed browns, and later a peer's cat off the wire.
 *
 * Discrete, not per-frame: this runs on a swatch tap or once at spawn, never in
 * useFrame. `color.set` on an existing material costs nothing and adds no draw
 * call, so the whole of character creation is free at runtime.
 */
export function paintFixed(slots: PeltSlots, main: string, light: string, eyes: string): void {
  for (const m of slots.main) m.color.set(main)
  for (const m of slots.light) m.color.set(light)
  for (const m of slots.eyes) m.color.set(eyes)
}
