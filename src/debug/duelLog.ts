import { DEBUG } from './expose'

/**
 * Every move in a duel, logged under ?debug=1: who threw it, what it was, the
 * gap at the moment reach was tested, hit or miss, the damage, and what it did
 * to the target.
 *
 * This is not decoration. An interrupt is over in a third of a second and
 * leaves nothing behind on screen except a health bar that did not move, so the
 * console is the only way to tell "the swipe cancelled the jump-kick" from "the
 * jump-kick missed" from "the button did nothing".
 *
 * Lives in its own file so PlayerCat and RivalCat can both call it without
 * importing each other, and takes both health values as arguments rather than
 * reading `live`, so nothing in the debug layer can end up in a cycle with the
 * state it is reporting on.
 */
export function logMove(
  who: 'player' | 'rival',
  move: string,
  gap: number,
  hit: boolean,
  damage: number,
  result: string,
  playerHealth: number,
  rivalHealth: number,
) {
  if (!DEBUG) return
  // eslint-disable-next-line no-console
  console.log(
    `[duel] ${who} ${move} gap=${gap.toFixed(2)} ${hit ? 'HIT' : 'miss'} dmg=${damage}` +
      ` -> ${result} | player=${playerHealth.toFixed(1)} rival=${rivalHealth.toFixed(1)}`,
  )
}
