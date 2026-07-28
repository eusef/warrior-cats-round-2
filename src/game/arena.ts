import { WORLD_EDGE_MARGIN, WORLD_HALF } from './constants'
import { arenaSpan, lateralOf } from './duel'
import { live } from './live'
import { clamp } from './terrain'
import { treeColliders } from '../world/Foliage'

/**
 * Lays out the fighting stage: the line the duel runs on, how far it extends,
 * and which side the camera watches from.
 *
 * This is the geometry half of opening a duel and it deliberately does NOT live
 * in `store.startDuel` with the other half. It needs the tree list, the tree
 * list lives in Foliage, and Foliage imports the store -- so a store that
 * imported Foliage back would be a cycle. PlayerCat calls this on the first
 * frame of a fight instead, one call after the store opened it, which is also
 * the only place that already owns `treeColliders`.
 *
 * Called once per duel. `live.duel.onStage` is both the "already built" guard
 * and the flag every consumer reads, so there is no second piece of state to
 * keep in step with it.
 */
export function openStage() {
  const d = live.duel
  const cat = live.cat
  const r = live.rival
  const s = d.stage

  // The line runs through both cats, so neither of them has to be moved to get
  // on it and a fight never opens with a snap.
  let ax = r.pos.x - cat.pos.x
  let az = r.pos.z - cat.pos.z
  const len = Math.hypot(ax, az)
  if (len < 1e-3) {
    // Standing exactly on top of each other: there is no direction between them
    // to use, so fall back to the way she is looking.
    ax = -Math.sin(cat.yaw)
    az = -Math.cos(cat.yaw)
  } else {
    ax /= len
    az /= len
  }

  s.ax = ax
  s.az = az
  // Clamped into the world box. In play this is always a no-op, because both
  // cats are themselves clamped inside it every frame and a midpoint of two
  // legal points is legal. It matters for a centre that is NOT legal, which
  // __game.startDuel can produce by dropping the rival past the boundary: the
  // world trim would then hand back pos < 0, an inverted stage that yanks both
  // cats to one side of a centre neither of them can stand on.
  const limit = WORLD_HALF - WORLD_EDGE_MARGIN
  s.cx = clamp((cat.pos.x + r.pos.x) * 0.5, -limit, limit)
  s.cz = clamp((cat.pos.z + r.pos.z) * 0.5, -limit, limit)

  const span = arenaSpan(s.cx, s.cz, ax, az, treeColliders, limit)
  s.neg = span.neg
  s.pos = span.pos

  // Watch from whichever side the camera is already on. Picking a fixed side
  // instead would mirror the whole world on the frame the fight opens about
  // half the time, and "left" would mean the opposite of what her thumb had
  // just been doing.
  const camX = cat.pos.x + Math.sin(live.camera.yaw) * live.camera.dist
  const camZ = cat.pos.z + Math.cos(live.camera.yaw) * live.camera.dist
  d.camSide = lateralOf(camX, camZ, s) < 0 ? -1 : 1

  d.onStage = true
}
