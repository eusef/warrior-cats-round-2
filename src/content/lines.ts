/**
 * Every line in the game is a hand-written string in this file.
 * No generated text, no LLM calls, ever. See the content policy in CLAUDE.md.
 */

export const CATCH_LINES = [
  'Caught it!',
  'Clean pounce!',
  'Got one!',
  'Nice catch!',
  'Straight off the leaves!',
  'Quick paws!',
] as const

export const EAT_LINES = [
  'Fresh-kill. Belly full.',
  'That hit the spot.',
  'Good hunting.',
  'Well fed.',
] as const

export const HUNGER_LINES = [
  'Getting hungry. Find a mouse.',
  'Very hungry! Time to hunt.',
] as const

export const CAMP_LINES = [
  'Resting at camp.',
  'Safe in camp.',
] as const

export const TITLE_HINT = 'Tap to begin'

// ---------------------------------------------------------------------------
// Character creation
// ---------------------------------------------------------------------------

/**
 * Apprentice name prefixes. Warrior Cats convention: an apprentice is
 * <Prefix>paw, and the ceremony in the backlog swaps `paw` for a suffix later.
 *
 * Hand-written and closed, like every other string here. Never reorder: a save
 * stores the index. Append to the end if you add more.
 */
export const NAME_PREFIXES = [
  'Fire',
  'Blue',
  'Bramble',
  'Dove',
  'Holly',
  'Ash',
  'Fern',
  'Frost',
  'Robin',
  'Sand',
  'Thistle',
  'Willow',
] as const

export const APPRENTICE_SUFFIX = 'paw'

export const CREATE_TITLE = 'Make your cat'
export const CREATE_PELT_LABEL = 'Pelt'
export const CREATE_EYES_LABEL = 'Eyes'
export const CREATE_NAME_LABEL = 'Name'
export const CREATE_BEGIN = 'Begin'

/**
 * Fixed template, one slot, filled only from NAME_PREFIXES above. Every string
 * it can produce is enumerable from this file. No generated text.
 */
export function nameToast(name: string): string {
  return `You are ${name}.`
}
