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

// --- Named landmarks --------------------------------------------------------
// One name and one journal entry per landmark, in table order. APPEND ONLY:
// the save persists landmark ids as bit positions, so reordering these renames
// the places she has already found.
//
// The Thunderpath is a hazard she is told to respect from the grass, and that
// is the whole of it: nothing is hurt on it, on screen or in the text.

export const LANDMARK_NAMES = [
  'Fourtrees',
  'Sunningrocks',
  'the Thunderpath',
] as const

export const LANDMARK_ENTRIES = [
  'Four great oaks in a ring.\nThe Clans meet here under a full moon.',
  'Smooth stone, warm all afternoon.\nThe best napping in the whole forest.',
  'Hard black stone that hums.\nMonsters race along it. Watch from the grass.',
] as const

/** The discovery toast: the name, then the entry underneath it. */
export function landmarkToast(id: number): string {
  return `You found ${LANDMARK_NAMES[id]}.\n${LANDMARK_ENTRIES[id]}`
}

// --- Combat -----------------------------------------------------------------
// A rival warrior from another Clan, over the border where she should not be.
// She is chased off, never beaten down: nobody is hurt beyond a number on a
// bar, nobody dies, and there is not one taunt in here. Every line is a beat in
// a scuffle between two cats who both go home afterwards.

export const RIVAL_NAME = 'Ripplefoot'

/** Button faces. Short enough to read on a 96px circle at arm's length. */
export const FIGHT_LABEL = 'Fight'
export const MOVE_LABEL_SWIPE = 'Swipe'
export const MOVE_LABEL_POUNCE = 'Pounce'
export const MOVE_LABEL_JUMPKICK = 'Jump-kick'
export const MOVE_LABEL_FLEE = 'Run away'

export function duelStartToast(name: string): string {
  return `${name} blocks the path.`
}

/** She yields and runs. Picked by hunt count so it varies without a coin flip. */
export const DUEL_WIN_LINES = [
  'yields and slips away over the border.',
  'has had enough. Off she goes.',
  'backs off, tail low. The territory holds.',
  'turns and runs for the stream.',
] as const

export function duelWinToast(name: string, n: number): string {
  return `${name} ${DUEL_WIN_LINES[Math.abs(n) % DUEL_WIN_LINES.length]}`
}

/** Losing costs nothing but the moment. No lost ground, no lost progress. */
export const DUEL_LOSS_LINES = [
  'You back away. Not today.',
  'You give ground and shake out your fur.',
  'Enough. You let her have the clearing.',
] as const

export const DUEL_FLEE_LINES = [
  'You slip away into the ferns.',
  'You break off and run.',
] as const

// --- Two cats, two iPads ----------------------------------------------------
// The connect flow, in her words rather than the network's. Nothing in here says
// relay, socket, host, guest, WebRTC or code-that-failed: a ten-year-old holding
// an iPad needs to know what to do next, and nothing else.
//
// Every failure line ends somewhere she can act, and none of them suggest the
// game is broken. Solo play is one tap away from every screen (US-1), so the
// worst outcome any of these describes is playing on her own.
//
// No apostrophes anywhere in this section, matching the rest of the file.

/** Title screen. Starts a forest and puts the code on the table. */
export const COOP_HOST_LABEL = 'Play with a friend'

/** Title screen, but only when the page was opened from a scanned code: the room
 *  already exists and she is walking into it, not opening one. */
export const COOP_JOIN_LABEL = 'Join your friend'

/**
 * The host wait screen: the code is on the screen and nothing else is happening
 * yet. The typed-letters sentence is not a footnote. The native Camera app misses
 * the QR often enough at a kid-held angle that a child with no fallback simply
 * decides it does not work.
 */
export const COOP_HOST_TITLE = 'Waiting for your friend'
export const COOP_HOST_HINT =
  'Have your friend point a camera at this code. If the camera will not read it, the letters underneath can be typed in instead.'

/** The guest wait screen. One line, because there is nothing for her to do. */
export const COOP_JOIN_WAIT = 'Looking for the forest your friend opened...'

/** Back out to solo play. On every connect screen, at every moment, one tap
 *  (US-1). Named for what she gets, not for what it cancels. */
export const COOP_SOLO_LABEL = 'Play by myself'

export const COOP_RETRY_LABEL = 'Try again'

/**
 * Throws the code on screen away and opens a fresh forest with a fresh code.
 *
 * On the waiting screen, not just the failure one, because the thing it fixes
 * does not look like a failure. A code that has been sitting out while she wanders
 * off and comes back is dead on the relay, and a friend scanning it gets told her
 * code is too old -- on the OTHER iPad, where nobody is looking. From this side
 * the QR is still sitting there looking perfectly fine. One tap replaces it.
 */
export const COOP_NEW_CODE_LABEL = 'New code'

/**
 * One line per failure, one short sentence each, no jargon and no error codes.
 * She never sees more than one of these at a time, and `COOP_SOLO_LABEL` is
 * always on the same screen.
 */
export const COOP_FAIL_RELAY = 'Cannot reach the laptop, so the forest will not open.'
export const COOP_FAIL_FULL = 'That forest already has two cats in it.'
export const COOP_FAIL_STALE = 'That code is too old, so ask your friend for a new one.'
export const COOP_FAIL_TIMEOUT = 'Nobody arrived in time.'
export const COOP_FAIL_OTHER = 'That did not work, and nothing is broken.'

/**
 * Fixed templates, one slot each, filled only with a name `catName()` built from
 * NAME_PREFIXES and WARRIOR_SUFFIXES. The name arrives as four small integers on
 * the wire and is assembled on this device, so no text a friend typed can ever
 * reach this string. Same closed-list rule as `nameToast`.
 */
export function friendJoinToast(name: string): string {
  return `${name} is here. Two cats in the forest.`
}

/** The leaving line carries the whole of US-8: a child whose friend puts an iPad
 *  down must not read it as the game breaking. So it says the forest is still
 *  hers and to keep going, in that order. */
export function friendLeftToast(name: string): string {
  return `${name} went home. The forest is still yours, keep hunting.`
}
