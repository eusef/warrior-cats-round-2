// Every tunable number in the game lives here. Nothing else defines a magic number.
// Phil tunes feel by editing this file.

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
export const WORLD_SIZE = 200 // metres, square
export const WORLD_HALF = WORLD_SIZE / 2
export const TERRAIN_SEGMENTS = 96 // heightfield resolution across the whole world
export const TERRAIN_HILL_HEIGHT = 3.2 // metres, peak-to-trough of the rolling hills
export const TERRAIN_HILL_SCALE = 0.018 // lower = broader, gentler hills
export const WORLD_EDGE_MARGIN = 6 // cat is kept this far inside the boundary

// ---------------------------------------------------------------------------
// Cat movement
// ---------------------------------------------------------------------------
export const CAT_WALK_SPEED = 2.6 // m/s at full joystick in walk band
export const CAT_RUN_SPEED = 7.0 // m/s at full joystick
export const CAT_WALK_THRESHOLD = 0.55 // joystick magnitude above which we run
export const CAT_ACCEL = 12 // m/s^2 toward target speed
export const CAT_DECEL = 16 // m/s^2 when the stick is released
export const CAT_TURN_SPEED = 9 // radians/s the cat yaws toward its heading
export const CAT_GROUND_OFFSET = 0.0 // metres the model sits above the ground hit
export const CAT_RAY_START_HEIGHT = 40 // ray origin above the cat for the down-raycast
export const CAT_CROUCH_SPEED_MULT = 0.38 // movement multiplier while stalking
// The Quaternius fox is authored at 5.88 units nose-to-tail. 0.14 lands it at
// ~0.82m long, which reads as a cat next to the trees. Tuned by eye, not by biology.
export const CAT_SCALE = 0.14
// The GLB's rest pose faces +Z; our yaw convention has 0 = -Z. Verified in Chrome.
export const CAT_MODEL_YAW_OFFSET = Math.PI

// ---------------------------------------------------------------------------
// Character creation
// ---------------------------------------------------------------------------
// The palette she picks from. `main` and `light` map onto the fox GLB's "Main"
// and "Main_Light" materials; light is the chest, muzzle and tail tip. Index 0
// is the ginger cat the game shipped with, so an old save that predates
// creation looks exactly as it did.
//
// Saves store the INDEX, not the hex, so retuning a colour here updates the cat
// she already made. Never reorder this list: it would repaint her cat.
export interface Pelt {
  label: string
  main: string
  light: string
}

export const PELTS: readonly Pelt[] = [
  { label: 'Ginger', main: '#c8763a', light: '#f0e0c8' },
  { label: 'Grey', main: '#7c8792', light: '#dee4ea' },
  { label: 'Black', main: '#3b3b45', light: '#71717e' },
  { label: 'White', main: '#ece5d6', light: '#ffffff' },
  { label: 'Tabby', main: '#8a6136', light: '#d9c39a' },
  { label: 'Cream', main: '#e0b984', light: '#f8eeda' },
]

export const EYE_COLORS: readonly { label: string; color: string }[] = [
  { label: 'Green', color: '#7fd45c' },
  { label: 'Amber', color: '#f0a51e' },
  { label: 'Blue', color: '#58a8e8' },
  { label: 'Copper', color: '#d1622a' },
]

export const DEFAULT_PELT = 0
export const DEFAULT_EYES = 0
export const DEFAULT_PREFIX = 0

// The creation screen parks the camera close in on the cat. The look point sits
// BELOW her feet on purpose: that pushes the cat into the upper part of the
// frame, clear of the choices sheet along the bottom. Tuned by screenshot at
// 1180x820 — at the first pass (2.8m) the cat was a 110px smudge on the screen
// whose entire job is to show her the cat.
export const CREATE_CAM_DISTANCE = 1.75 // metres
export const CREATE_CAM_HEIGHT = 0.45 // metres above the cat's feet
export const CREATE_CAM_LOOK_HEIGHT = -0.16 // metres; negative aims under the feet
export const CREATE_CAM_ORBIT_SPEED = 0.42 // radians/sec; a full turn every ~15s
// Camp is flat and the camera is only 1.75m out, so the play-mode clearance
// (0.7m) would shove the camera up above CREATE_CAM_HEIGHT and undo the framing.
export const CREATE_CAM_MIN_CLEARANCE = 0.3
// Yaw the orbit starts at. 0 is directly behind the cat, which meant she met her
// new cat tail-first. Just past PI is a three-quarter view of the face.
export const CREATE_CAM_START_YAW = Math.PI * 0.82
export const CREATE_SHEET_HEIGHT = 300 // CSS px the choices sheet occupies

// Animation blending
export const ANIM_FADE = 0.18 // seconds to cross-fade between clips
export const ANIM_WALK_CYCLE_SPEED = 2.2 // m/s the Walk clip looks natural at
export const ANIM_RUN_CYCLE_SPEED = 7.5 // m/s the Gallop clip looks natural at
export const ANIM_TIMESCALE_MIN = 0.55
export const ANIM_TIMESCALE_MAX = 1.7

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
// Tuned by eye in Chrome against the 0.82m cat. At 8.5m/3.4m the cat was a
// 60px smudge and the view was near top-down; this sits it behind the shoulder
// and makes the cat the obvious subject of the screen.
export const CAM_DISTANCE = 4.2 // metres behind the cat
export const CAM_HEIGHT = 1.45 // metres above the cat's feet
export const CAM_LOOK_HEIGHT = 0.55 // metres above the feet that the camera aims at
export const CAM_FOLLOW_LAG = 6.5 // higher = snappier follow
export const CAM_ORBIT_SENSITIVITY = 0.0075 // radians per pixel dragged
export const CAM_PITCH_MIN = -0.35 // radians, looking down-ish limit
export const CAM_PITCH_MAX = 0.75 // radians, looking up-ish limit
export const CAM_FOV = 62
export const CAM_NEAR = 0.3
export const CAM_FAR = 320
export const CAM_MIN_GROUND_CLEARANCE = 0.7 // camera never dips below terrain + this
// The aim point trails the cat instead of being nailed to her. Below about 5
// the horizon visibly swims when she turns; above about 12 there is nothing to
// see. This is the whole of "camera lag": the position already eased, but the
// lookAt was exact, which is what made hard turns feel rigid.
export const CAM_LOOK_LAG = 7.5
// Extra metres the camera eases back at full run. Deliberately small: this is a
// 0.82m cat at 4.2m, so a big dolly shrinks her rather than reading as speed.
export const CAM_SPEED_DOLLY = 1.1
export const CAM_DOLLY_LAG = 1.8 // higher = the dolly opens and closes faster

// ---------------------------------------------------------------------------
// Needs
// ---------------------------------------------------------------------------
export const NEED_MAX = 100
export const HUNGER_DECAY_PER_SEC = 0.35 // generous on purpose: ~4.75 min from full to empty
export const HUNGER_LOW_THRESHOLD = 30 // HUD turns urgent below this
export const HUNGER_STARVING_THRESHOLD = 0 // health starts draining at/below this
export const HEALTH_DRAIN_WHEN_STARVING = 1.2 // hp/sec
export const MEAL_HUNGER_RESTORE = 34 // one mouse
export const CAT_START_HEALTH = 100
export const CAT_START_HUNGER = 78

// ---------------------------------------------------------------------------
// Camp
// ---------------------------------------------------------------------------
export const CAMP_POS: readonly [number, number] = [0, 12] // x, z
// A fresh cat starts in camp, beside the nest rather than in it. The old (0,0)
// spawn dropped her inside a fern that completely hid the cat.
export const CAT_SPAWN: readonly [number, number] = [2.5, 13.6]
export const CAMP_RADIUS = 7 // metres; inside this the cat can rest
export const CAMP_HEAL_PER_SEC = 9 // hp/sec while resting at camp
// The ground ring marks the true rest boundary, so it has to be legible.
export const CAMP_RING_WIDTH = 1.1 // metres, inward from CAMP_RADIUS
export const CAMP_RING_OPACITY_IDLE = 0.3
export const CAMP_RING_OPACITY_RESTING = 0.8
export const CAMP_REST_HUNGER_MULT = 0.4 // hunger decays slower while resting

// Camp beacon: a shaft of sunlight standing in the clearing. This is the only
// way to find camp from across the map, so it is tuned for legibility at range
// rather than realism. Trees top out at 12m (canopy cone apex 8.0 * TREE_MAX_SCALE)
// and camp sits in a flattened bowl, so the beam has to clear the treeline by a
// wide margin. FOLIAGE_CLEARING_RADIUS guarantees nothing grows in its way.
export const CAMP_BEACON_HEIGHT = 38 // metres tall; ~3x the tallest tree
export const CAMP_BEACON_RADIUS_TOP = 1.5
export const CAMP_BEACON_RADIUS_BOTTOM = 3.8 // widens downward, like a real sun shaft
// Saturated warm gold. Verified in Chrome: additive blending looked better over
// the dark trees but vanished completely against the bright sky, which is the
// part above the treeline that actually does the wayfinding. Normal blending
// with a saturated colour tints the sky instead of adding to it, so the beam
// reads against both.
export const CAMP_BEACON_COLOR = '#ffc247'
export const CAMP_BEACON_OPACITY = 0.5 // at full strength, seen from far away
export const CAMP_BEACON_FADE_NEAR = 16 // metres: invisible at/below this, she has arrived
export const CAMP_BEACON_FADE_FAR = 44 // metres: full strength at/above this
export const CAMP_BEACON_FADE_LERP = 4 // higher = the beam pops in faster as she leaves
// The beam is solid up to this fraction of its height, then dissolves into sky.
// 0.35 of 38m = 13.3m, which keeps it opaque past the 12m treeline.
export const CAMP_BEACON_SOLID_FRACTION = 0.35
export const CAMP_BEACON_SPIN_SPEED = 0.07 // radians/sec; a slow shimmer, not a rotation
export const CAMP_BEACON_SHIMMER = 0.22 // 0 = an even column, 1 = strongly banded
// The backlog asks for a shaft that "stays visible through the trees". A single
// depth-tested beam does not: verified in Chrome at 80m, one near tree hid all
// but a sliver of it. So the beam draws a second time with depth testing off, at
// this fraction of its opacity, which reads as light diffusing through canopy.
// Raise it if she still loses camp behind a trunk; drop it toward 0 if it starts
// looking like a decal painted on the screen.
export const CAMP_BEACON_GHOST_OPACITY = 0.3

// ---------------------------------------------------------------------------
// Prey (mice)
// ---------------------------------------------------------------------------
export const PREY_COUNT = 14
// A real mouse would be ~0.24. Bumped for legibility: at 0.24 a mouse eight
// metres away is a two-pixel speck and she cannot find one to hunt.
export const PREY_SCALE = 0.32
export const PREY_WANDER_SPEED = 0.9 // m/s
export const PREY_FLEE_SPEED = 4.4 // m/s
export const PREY_FLEE_RADIUS = 7.5 // cat within this and prey bolts
export const PREY_FLEE_RADIUS_CROUCHED = 3.2 // stalking lets you get much closer
export const PREY_CALM_RADIUS = 13 // beyond this prey settles back to wandering
export const PREY_WANDER_RETARGET_MIN = 1.4 // seconds
export const PREY_WANDER_RETARGET_MAX = 4.0 // seconds
export const PREY_WANDER_RADIUS = 9 // how far a mouse strays from its home point
export const PREY_TURN_SPEED = 7 // radians/s
export const PREY_RESPAWN_DELAY = 9 // seconds after being eaten
export const PREY_RESPAWN_MIN_DIST = 28 // respawn at least this far from the cat
export const PREY_SPAWN_MIN_FROM_CAMP = 16 // keep the camp clearing mouse-free-ish

// ---------------------------------------------------------------------------
// Hunting
// ---------------------------------------------------------------------------
export const POUNCE_RANGE = 3.4 // metres; a pounce catches prey inside this
export const POUNCE_DURATION = 0.62 // seconds the pounce arc lasts
export const POUNCE_FORWARD_SPEED = 8.5 // m/s during the pounce
export const POUNCE_HOP_HEIGHT = 0.9 // metres of vertical arc
export const POUNCE_COOLDOWN = 0.35 // seconds before another pounce
export const EAT_DURATION = 1.1 // seconds the cut-away eat beat lasts
export const HUNTS_TO_WARRIOR = 5 // successful hunts before the warrior ceremony

// ---------------------------------------------------------------------------
// Foliage
// ---------------------------------------------------------------------------
export const TREE_COUNT = 190
export const FERN_COUNT = 260
export const ROCK_COUNT = 55
export const FOLIAGE_CLEARING_RADIUS = 15 // no trees inside this radius of camp
export const TREE_MIN_SCALE = 0.8
export const TREE_MAX_SCALE = 1.5

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
export const SAVE_KEY = 'warrior-cats-save-v1'
export const SAVE_INTERVAL_SEC = 10

// ---------------------------------------------------------------------------
// Feedback timings
// ---------------------------------------------------------------------------
export const TOAST_DURATION = 1.8 // seconds a HUD toast stays up
export const CEREMONY_LINE_DELAY = 1.15 // seconds between ceremony lines landing
export const CEREMONY_AUTO_DISMISS = 12 // seconds before the ceremony closes itself

// ---------------------------------------------------------------------------
// Juice
//
// Procedural motion laid on top of the GLB clips: tail, ears, and the squash on
// a pounce landing. It is applied AFTER the AnimationMixer has written the pose
// for the frame, because the mixer rewrites every bone quaternion from the clip
// every frame. Applied before, none of this exists.
//
// The Fox rig's bones each extend along their own local +Y (verified from the
// GLB: every child sits at (0, L, 0) in its parent), so local Z is the
// side-to-side swing and local X is the up/down bend. Tail1 and Ear1 are the
// bases of their chains, Tail8 and Ear4 the tips.
// ---------------------------------------------------------------------------

// Tail. Every angle here is the TOTAL deflection at the tip, in radians, and
// the code normalises the eight-bone ramp so that stays true. Rotations
// compound down a chain, so a per-bone value would mean 4.5x what it says: the
// first pass set crouch droop to -0.3 and bent the tail 77 degrees, folding it
// inside the body where it could not be seen at all.
export const TAIL_SWAY_IDLE = 0.34 // ~19 deg; a standing cat's tail is never quite still
export const TAIL_SWAY_RUN = 0.7 // ~40 deg
export const TAIL_WAVE_RATE_IDLE = 1.7 // radians/sec the travelling wave advances
export const TAIL_WAVE_RATE_RUN = 5.5
export const TAIL_WAVE_LAG = 0.55 // radians of phase offset per bone; 0 = a rigid wag
// The tip swings out against a hard turn and takes a moment to catch up. This
// is the single term that reads most like an animal rather than a puppet.
export const TAIL_TURN_AMOUNT = 0.8 // ~46 deg at a full-speed 90 degree turn
export const TAIL_TURN_REF = 4.0 // rad/sec of yaw that counts as a full-strength turn
export const TAIL_TURN_LAG = 6 // higher = the counter-swing settles faster
export const TAIL_LIFT_RUN = 1.0 // ~57 deg; tail streams up behind a running cat
export const TAIL_LIFT_CROUCH = -0.5 // ~29 deg down while stalking
export const TAIL_LIFT_LAG = 3.5

// Ears. A flick fires on a random timer while she is standing still, one ear at
// a time, never both: two ears twitching together reads as a glitch.
export const EAR_FLICK_MIN_GAP = 2.2 // seconds
export const EAR_FLICK_MAX_GAP = 6.5
export const EAR_FLICK_DURATION = 0.34
// Unlike the tail these are the angle at the BASE of the ear, not the total:
// the chain is only two bones deep, so the tip lands at 1 + EAR_TIP_FOLLOW
// times these.
export const EAR_FLICK_AMOUNT = 0.5 // radians at the peak of the twitch
export const EAR_FLICK_WOBBLES = 2.5 // half-cycles inside one flick
export const EAR_FLATTEN_CROUCH = 0.42 // radians the ears lay back while stalking
export const EAR_FLATTEN_LAG = 7
export const EAR_TIP_FOLLOW = 0.55 // fraction of the base angle the next segment adds

// Squash. A damped spring on the model's scale, fired on touchdown from a
// pounce. Stiffness 190 gives a ~0.45s period and damping 15 leaves it
// underdamped, so it lands with one visible bounce rather than a dead stop.
export const SQUASH_LAND_IMPULSE = 3.2 // scale-units/sec of compression on landing
export const SQUASH_STIFFNESS = 190
export const SQUASH_DAMPING = 15
export const SQUASH_MAX = 0.28 // hard clamp; a safety net, not the shape
export const SQUASH_AIR_STRETCH = 0.14 // vertical stretch at the top of the arc
export const SQUASH_AIR_LAG = 12
// Metres of hop that count as "properly airborne", which is what arms the
// landing. A hop that never clears this lands without a squash, so a scuffed
// half-pounce does not thump.
export const SQUASH_AIR_MIN = 0.15
export const SQUASH_WIDTH_RATIO = 0.55 // how much of the vertical change goes to width

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export const JOYSTICK_RADIUS = 62 // CSS px the thumb can travel from centre
export const JOYSTICK_DEADZONE = 0.12 // normalised magnitude below which input is zero

// ---------------------------------------------------------------------------
// Audio
//
// Every sound is synthesised in src/audio/engine.ts. There are no audio files,
// so these numbers are the whole mix: there is no sample to re-record.
// Gains are pre-master and stack multiplicatively with AUDIO_MASTER_GAIN.
// ---------------------------------------------------------------------------
export const AUDIO_MASTER_GAIN = 0.55 // everything passes through this one fader

// Paws. Cadence is per second at the named speed and scales linearly in
// between, so a half-pushed stick gives half-speed footfalls without a
// separate walk/run switch.
export const AUDIO_STEP_CADENCE_WALK = 2.2 // paw sounds per second at CAT_WALK_SPEED
export const AUDIO_STEP_CADENCE_RUN = 4.0 // paw sounds per second at CAT_RUN_SPEED
export const AUDIO_STEP_GAIN = 0.34
export const AUDIO_STEP_CROUCH_MULT = 0.45 // stalking is quieter; matches the animation duck
export const AUDIO_STEP_MIN_SPEED = 0.15 // m/s below which paws go silent

// Purr. 25Hz is close to a real cat's purr rate; the fade keeps arriving at
// and leaving camp from clicking.
export const AUDIO_PURR_GAIN = 0.2
export const AUDIO_PURR_RATE = 25 // Hz of amplitude modulation
export const AUDIO_PURR_FADE = 0.35 // seconds to fade in and out

// One-shots.
export const AUDIO_MEOW_GAIN = 0.34
export const AUDIO_POUNCE_GAIN = 0.3
export const AUDIO_CATCH_GAIN = 0.3
export const AUDIO_CEREMONY_GAIN = 0.34
export const AUDIO_TICK_GAIN = 0.13 // creation-sheet taps, deliberately near-subliminal

// Birdsong. Gaps are seconds of real time between one bird and the next.
export const AUDIO_BIRD_GAIN = 0.14
export const AUDIO_BIRD_MIN_GAP = 4
export const AUDIO_BIRD_MAX_GAP = 11
export const AUDIO_BIRD_FIRST_GAP = 1.5 // seconds before the first bird after audio starts
