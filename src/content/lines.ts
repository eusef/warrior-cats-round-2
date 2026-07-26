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

/**
 * The warrior suffix for each prefix above, *by the same index*. Every pair is
 * that cat's real name from the books: Firepaw becomes Fireheart, Sandpaw
 * becomes Sandstorm. Sharing the index with NAME_PREFIXES is why the save never
 * has to store a second number.
 *
 * Same rules as NAME_PREFIXES, plus one: keep this array exactly as long as
 * that one. Never reorder, append only, and append to both together.
 */
export const WARRIOR_SUFFIXES = [
  'heart', // Fire    -> Fireheart
  'fur', //   Blue    -> Bluefur
  'claw', //  Bramble -> Brambleclaw
  'wing', //  Dove    -> Dovewing
  'leaf', //  Holly   -> Hollyleaf
  'fur', //   Ash     -> Ashfur
  'cloud', // Fern    -> Ferncloud
  'fur', //   Frost   -> Frostfur
  'wing', //  Robin   -> Robinwing
  'storm', // Sand    -> Sandstorm
  'claw', //  Thistle -> Thistleclaw
  'pelt', //  Willow  -> Willowpelt
] as const

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

// ---------------------------------------------------------------------------
// Warrior name ceremony
// ---------------------------------------------------------------------------

/**
 * The ceremony, in the leader's voice. The leader is never named, never drawn
 * and never answered: these are four lines of ceremony, not a conversation and
 * not an NPC. Two of them are fixed templates with a single slot filled only
 * from NAME_PREFIXES / WARRIOR_SUFFIXES, so the complete set of strings this
 * screen can ever show is enumerable by reading this file. Same closed-list
 * rule as `nameToast`.
 *
 * Second person throughout ("you have hunted well") because the cat has no
 * stated gender and the leader is speaking to her anyway.
 */
export const CEREMONY_CALL = 'I call upon StarClan to look down on this apprentice.'
export const CEREMONY_PRAISE = 'You have hunted well and you know the warrior code.'
export const CEREMONY_WELCOME = 'The Clan welcomes you as a warrior.'
export const CEREMONY_DISMISS = 'Continue'

/** `Firepaw, from this moment you will be known as` */
export function ceremonyRename(apprentice: string): string {
  return `${apprentice}, from this moment you will be known as`
}
