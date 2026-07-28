import {
  DUEL_ARENA_HALF,
  DUEL_ARENA_MIN_HALF,
  DUEL_ARENA_TREE_CLEARANCE,
  DUEL_BODY_RADIUS,
  DUEL_HIT_ARC,
  DUEL_HIT_FLINCH,
  DUEL_MIN_SEPARATION,
  DUEL_STAGGER_DURATION,
  JUMPKICK,
  Move,
  POUNCE,
  RIVAL_WEIGHT_JUMPKICK,
  RIVAL_WEIGHT_POUNCE,
  RIVAL_WEIGHT_SWIPE,
  SWIPE,
} from './constants'

/**
 * The whole duel rule set, as pure functions over plain data.
 *
 * No R3F import, no store import, no `live` import. That is deliberate and it
 * is the same call landmarks.ts makes: every rule in here is assertable
 * headlessly from a console one-liner, without a scene, a frame, or a cat.
 * PlayerCat and RivalCat own the *timing* and the *positions*; this file owns
 * what those mean.
 *
 * Cats do not die. Nothing in here can take a combatant below zero health into
 * anything except a yield. See the content policy in CLAUDE.md.
 */

export type MoveId = 'swipe' | 'pounce' | 'jumpkick'
export type DuelPhase = 'neutral' | 'windup' | 'strike' | 'recovery' | 'stagger'

export const MOVES: Record<MoveId, Move> = {
  swipe: SWIPE,
  pounce: POUNCE,
  jumpkick: JUMPKICK,
}

/** Longest reach of any move. Below this the CPU has something it can throw. */
export const MAX_REACH = Math.max(SWIPE.reach, POUNCE.reach, JUMPKICK.reach)

/**
 * One side of a duel. Both the player and the rival carry one of these on
 * `live`, so the machine is identical for both and there is no "player rules"
 * versus "CPU rules" fork to keep in sync.
 */
export interface Combatant {
  phase: DuelPhase
  move: MoveId | null
  /** Seconds left in the current phase. Meaningless while neutral. */
  phaseT: number
  /** Seconds left of the hit-react flinch. Purely cosmetic, never gates input. */
  flinchT: number
  /** Rises on the frame a hit lands on this cat. The audio driver watches it. */
  hitT: number
}

export function makeCombatant(): Combatant {
  return { phase: 'neutral', move: null, phaseT: 0, flinchT: 0, hitT: 0 }
}

export function resetCombatant(c: Combatant) {
  c.phase = 'neutral'
  c.move = null
  c.phaseT = 0
  c.flinchT = 0
  c.hitT = 0
}

/** True while the cat is committed and the joystick must not move it. */
export function isLocked(c: Combatant): boolean {
  return c.phase !== 'neutral'
}

/** True while a move can be cancelled out from under this cat. */
export function isInterruptible(c: Combatant): boolean {
  return c.phase === 'windup'
}

/**
 * Begin a move. Returns false if the cat is not neutral, which is the only
 * thing stopping a mashed button from queueing four jump-kicks. There is no
 * input buffer and no cancel by design: the spec says no combo system.
 */
export function startMove(c: Combatant, move: MoveId): boolean {
  if (c.phase !== 'neutral') return false
  c.move = move
  c.phase = 'windup'
  c.phaseT = MOVES[move].windup
  return true
}

export type PhaseEvent = 'strike' | 'recover' | 'neutral' | null

/**
 * Tick the phase timer. Returns the transition that happened this frame, or
 * null if the cat is still in the same phase.
 *
 * 'strike' is the one the caller must act on: it means the wind-up just
 * completed and this is the frame to test reach and apply damage. It fires
 * exactly once per move, before the lunge has travelled a single metre, which
 * is what makes "the CPU backed off mid-wind-up" a clean miss rather than a
 * hit that catches up.
 */
export function advance(c: Combatant, delta: number): PhaseEvent {
  if (c.flinchT > 0) c.flinchT = Math.max(0, c.flinchT - delta)
  if (c.hitT > 0) c.hitT = Math.max(0, c.hitT - delta)

  if (c.phase === 'neutral') return null

  c.phaseT -= delta
  if (c.phaseT > 0) return null

  const overshoot = -c.phaseT
  const move = c.move ? MOVES[c.move] : null

  switch (c.phase) {
    case 'windup':
      // The strike phase starts with whatever time the wind-up overran by
      // already spent, so a long frame cannot stretch a move.
      c.phase = 'strike'
      c.phaseT = Math.max(0, (move?.strike ?? 0) - overshoot)
      return 'strike'
    case 'strike':
      c.phase = 'recovery'
      c.phaseT = Math.max(0, (move?.recovery ?? 0) - overshoot)
      return 'recover'
    case 'recovery':
    case 'stagger':
      c.phase = 'neutral'
      c.phaseT = 0
      c.move = null
      return 'neutral'
  }
}

/**
 * How far through the current phase, 0 at the start and 1 at the end. Used to
 * shape the lunge arc; returns 0 for a phase with no duration.
 */
export function phaseProgress(c: Combatant): number {
  if (c.phase === 'neutral' || !c.move) return 0
  const m = MOVES[c.move]
  const full =
    c.phase === 'windup'
      ? m.windup
      : c.phase === 'strike'
        ? m.strike
        : c.phase === 'recovery'
          ? m.recovery
          : DUEL_STAGGER_DURATION
  if (full <= 0) return 1
  return clamp01(1 - c.phaseT / full)
}

export interface Drive {
  speed: number
  hop: number
}

/**
 * Forward speed and hop height for a cat mid-strike, so pounce and jump-kick
 * visibly lunge instead of teleporting their damage.
 *
 * The speed follows a sine hump over the strike, same shape as the hunting
 * pounce, and is scaled so the area under it is exactly the move's `lunge` in
 * metres: the integral of sin(pi*t) over one half period is 2/pi, so the peak
 * has to be lunge*pi/(2*strike) for the cat to arrive where the number says.
 *
 * Writes into a caller-owned `out` rather than returning a fresh object,
 * because this is called twice a frame forever.
 */
export function strikeDrive(c: Combatant, out: Drive): Drive {
  out.speed = 0
  out.hop = 0
  if (c.phase !== 'strike' || !c.move) return out
  const m = MOVES[c.move]
  if (m.strike <= 0) return out
  const s = Math.sin(phaseProgress(c) * Math.PI)
  out.speed = s * ((m.lunge * Math.PI) / (2 * m.strike))
  out.hop = s * m.hop
  return out
}

/**
 * Which animation pose this cat should be in, or null to fall back to ordinary
 * locomotion. Every string here is also a CatAction; duel.ts cannot import that
 * type because live.ts imports this file, and a cycle between the two would be
 * a genuinely miserable thing to debug.
 */
export type DuelPose = 'swipe' | 'pounce' | 'kick' | 'hit' | 'stagger' | null

export function duelPose(c: Combatant): DuelPose {
  if (c.phase === 'stagger') return 'stagger'
  if (c.phase !== 'neutral' && c.move) {
    return c.move === 'swipe' ? 'swipe' : c.move === 'pounce' ? 'pounce' : 'kick'
  }
  // Flinch only shows once the cat is free again, so a hit taken mid-recovery
  // does not cut the recovery pose short and hide the punish window.
  if (c.phase === 'neutral' && c.flinchT > 0) return 'hit'
  return null
}

/**
 * Does a strike from (ax, az) facing `ayaw` connect with a cat at (bx, bz)?
 *
 * Two tests, both required: inside `reach` centre-to-centre plus both body
 * radii, and inside DUEL_HIT_ARC of straight ahead. The arc is what makes
 * turning away from a wind-up a real defence, and it is why a jump-kick thrown
 * at someone circling behind you whiffs into empty air.
 *
 * Yaw convention matches the cat everywhere else in the game: 0 faces -Z.
 */
export function inReach(
  ax: number,
  az: number,
  ayaw: number,
  bx: number,
  bz: number,
  reach: number,
): boolean {
  const dx = bx - ax
  const dz = bz - az
  const dist = Math.hypot(dx, dz)
  if (dist > reach + DUEL_BODY_RADIUS * 2) return false
  // Dead on top of each other: no meaningful direction, so call it a hit.
  if (dist < 1e-4) return true
  const fx = -Math.sin(ayaw)
  const fz = -Math.cos(ayaw)
  const dot = (fx * dx + fz * dz) / dist
  return dot >= Math.cos(DUEL_HIT_ARC)
}

export type HitResult = 'interrupted' | 'hit'

/**
 * THE INTERRUPT RULE, and the only place it lives.
 *
 * Taking a hit during a wind-up cancels that move entirely: it deals zero and
 * goes straight to a short stagger. The strike never resolves because a strike
 * only ever fires on the windup -> strike transition in advance(), which can no
 * longer happen once the phase has been moved to 'stagger'.
 *
 * Getting hit in any other phase hurts but does not stagger. Only the wind-up
 * is interruptible, which is exactly what makes the jump-kick a gamble: its
 * 1.2s of commit is long enough for a 0.35s swipe to land inside it.
 *
 * The cancelled move deals zero. The incoming hit still deals its damage.
 * Health is clamped at zero and nothing here can push it lower.
 */
export function applyHit(target: Combatant, health: number, damage: number): {
  health: number
  result: HitResult
} {
  const next = Math.max(0, health - Math.max(0, damage))
  target.flinchT = DUEL_HIT_FLINCH
  target.hitT = DUEL_HIT_FLINCH

  if (isInterruptible(target)) {
    target.phase = 'stagger'
    target.phaseT = DUEL_STAGGER_DURATION
    target.move = null
    return { health: next, result: 'interrupted' }
  }
  return { health: next, result: 'hit' }
}

/**
 * Weighted-random move pick for the CPU, biased to swipe and pounce with an
 * occasional jump-kick. Moves that cannot cover the current gap are dropped
 * first, so she never throws a swipe from four metres out and looks broken.
 *
 * `rand` is passed in rather than called, so a seeded generator makes the whole
 * fight reproducible under __game.step().
 */
// ---------------------------------------------------------------------------
// The fighting stage
// ---------------------------------------------------------------------------

/**
 * A duel runs on a line, fixed when the fight opens and never recomputed.
 *
 * `(ax, az)` is a horizontal unit vector, `(cx, cz)` the centre, and `neg`/`pos`
 * are how far along the axis the stage extends each way. Everything about the
 * Mortal-Kombat feel falls out of projecting both cats onto this every frame:
 * it IS the left/right-only control scheme, it IS the leash that stops either
 * cat leaving, and it is what lets the camera be a fixed side-on rig rather
 * than a chase.
 *
 * `neg` is negative and `pos` is positive. They are not symmetric: a tree or
 * the world edge trims one side without touching the other.
 */
export interface Stage {
  ax: number
  az: number
  cx: number
  cz: number
  neg: number
  pos: number
}

/** Anything that stops the line. Structurally a tree collider. */
export interface LineBlocker {
  x: number
  z: number
  r: number
}

/** Signed distance along the axis from the stage centre. */
export function alongOf(x: number, z: number, s: Stage): number {
  return (x - s.cx) * s.ax + (z - s.cz) * s.az
}

/**
 * Signed distance from the line, positive on the left of the axis. Nothing in
 * the game reads this: it exists so verification can assert that a cat in a
 * duel is ON the line rather than eyeballing it in a screenshot.
 */
export function lateralOf(x: number, z: number, s: Stage): number {
  return (x - s.cx) * -s.az + (z - s.cz) * s.ax
}

export interface StagePoint {
  x: number
  z: number
  along: number
}

/**
 * Put a position on the line and inside the stage. This is the single rule that
 * removes lateral drift, the rival's circling, the player's forward and back,
 * and any push-out a tree applied on the way. Deliberately runs AFTER the tree
 * push-out rather than instead of it, so the push-out still separates the cats
 * from trunks near the line before the projection flattens what is left.
 *
 * `push` is the body-separation slide from separationPush, applied before the
 * clamp so that being shoved never puts a cat outside the stage.
 */
export function projectToStage(
  x: number,
  z: number,
  push: number,
  s: Stage,
  out: StagePoint,
): StagePoint {
  let along = alongOf(x, z, s) + push
  if (along < s.neg) along = s.neg
  else if (along > s.pos) along = s.pos
  out.along = along
  out.x = s.cx + s.ax * along
  out.z = s.cz + s.az * along
  return out
}

/**
 * How far this cat has to slide to stop standing inside the other one.
 *
 * HALF the overlap, not all of it: the other cat runs the same rule against
 * this one in the same frame, so the two corrections add up to exactly the
 * overlap and neither has to know where the other is going to end up. When one
 * of them is pinned against the end of the stage the other only gets its half,
 * and the remainder converges geometrically over the next few frames, which
 * reads as a shove rather than as a wall.
 *
 * `bias` breaks the tie when they are exactly coincident and there is no
 * direction to push in. +1 for the player, -1 for the rival, so the two never
 * pick the same way and stay welded together.
 */
export function separationPush(mine: number, theirs: number, bias: number): number {
  const d = mine - theirs
  const dist = Math.abs(d)
  if (dist >= DUEL_MIN_SEPARATION) return 0
  const dir = dist < 1e-4 ? bias : Math.sign(d)
  return dir * (DUEL_MIN_SEPARATION - dist) * 0.5
}

/**
 * How far the stage can extend each way from its centre before it runs into a
 * tree or off the edge of the world. Computed once when a duel opens.
 *
 * Trimming is not cosmetic. Projecting onto a line that a trunk sits on would
 * slide a cat straight through it every frame, and from a side-on camera that
 * is the most obvious bug on screen. A trunk within `DUEL_ARENA_TREE_CLEARANCE`
 * of the line blocks a span of it, and the stage stops just short.
 *
 * Two deliberate overrides, in this order. A stage trimmed below
 * DUEL_ARENA_MIN_HALF is opened back up to it, because a corridor the width of
 * a cat is unplayable and a trunk clipped once in a thicket is the cheaper
 * failure. The world edge then wins outright, because walking off the terrain
 * is not a cheaper failure than anything.
 *
 * There is a third case that is NOT handled, and it is the one to know about: a
 * trunk whose blocked span covers the stage centre is skipped entirely. The
 * cats' own push-out cannot rule this out, because the centre is the MIDPOINT
 * between them and two cats 2.6m apart can straddle a trunk while both sit
 * clear of it. Excluding it properly would mean sliding the centre off the
 * trunk, which can then push the far cat outside the trimmed span and yank her.
 * Measured over 60 stages placed across the map: 10 were trimmed by a tree, and
 * the worst trunk left standing on a stage cleared the line by 0.07m -- close
 * enough for a cat's flank to pass through it for a step. It is cosmetic, it is
 * rare, and it is cheaper than the yank.
 *
 * Pure over a plain array, so it is assertable against a synthetic list of
 * blockers with no scene, no frame and no cat.
 */
export function arenaSpan(
  cx: number,
  cz: number,
  ax: number,
  az: number,
  blockers: readonly LineBlocker[],
  worldLimit: number,
): { neg: number; pos: number } {
  let neg = -DUEL_ARENA_HALF
  let pos = DUEL_ARENA_HALF

  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i]
    const dx = b.x - cx
    const dz = b.z - cz
    const R = b.r + DUEL_ARENA_TREE_CLEARANCE
    // Perpendicular distance from the line. Outside R it cannot block anything.
    const perp = dx * -az + dz * ax
    if (perp > R || perp < -R) continue
    const proj = dx * ax + dz * az
    const half = Math.sqrt(Math.max(0, R * R - perp * perp))
    const lo = proj - half
    const hi = proj + half
    // Straddling the centre. Trimming to either side would exclude the centre
    // itself and hand back an inverted span, so this trunk is skipped and lives
    // inside the stage. See the note in the doc comment: it is the one gap in
    // the guarantee and it is deliberate.
    if (lo <= 0 && hi >= 0) continue
    if (proj > 0) {
      if (lo < pos) pos = lo
    } else if (hi > neg) {
      neg = hi
    }
  }

  if (pos < DUEL_ARENA_MIN_HALF) pos = DUEL_ARENA_MIN_HALF
  if (neg > -DUEL_ARENA_MIN_HALF) neg = -DUEL_ARENA_MIN_HALF

  // The world edge, applied last and never overridden. Solving each axis
  // separately and taking the tighter answer is exact for an axis-aligned box.
  pos = Math.min(pos, boxLimit(cx, ax, worldLimit), boxLimit(cz, az, worldLimit))
  neg = Math.max(neg, -boxLimit(cx, -ax, worldLimit), -boxLimit(cz, -az, worldLimit))
  return { neg, pos }
}

/** How far `c + d*t` can travel before |value| leaves `limit`. */
function boxLimit(c: number, d: number, limit: number): number {
  if (d > 1e-6) return (limit - c) / d
  if (d < -1e-6) return (-limit - c) / d
  return Infinity
}

export function pickCpuMove(gap: number, rand: () => number): MoveId | null {
  const weights: [MoveId, number][] = [
    ['swipe', RIVAL_WEIGHT_SWIPE],
    ['pounce', RIVAL_WEIGHT_POUNCE],
    ['jumpkick', RIVAL_WEIGHT_JUMPKICK],
  ]
  // A move is worth throwing if its reach plus its lunge can still arrive.
  const usable = weights.filter(([id]) => {
    const m = MOVES[id]
    return gap <= m.reach + m.lunge + DUEL_BODY_RADIUS * 2
  })
  if (!usable.length) return null

  let total = 0
  for (const [, w] of usable) total += w
  let roll = rand() * total
  for (const [id, w] of usable) {
    roll -= w
    if (roll <= 0) return id
  }
  return usable[usable.length - 1][0]
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
