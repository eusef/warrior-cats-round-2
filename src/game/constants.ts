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

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export const JOYSTICK_RADIUS = 62 // CSS px the thumb can travel from centre
export const JOYSTICK_DEADZONE = 0.12 // normalised magnitude below which input is zero
