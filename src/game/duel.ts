import {
  DUEL_BODY_RADIUS,
  DUEL_HIT_ARC,
  DUEL_HIT_FLINCH,
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
