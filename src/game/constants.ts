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
export const CAT_PELT_COLOR = '#c8763a' // Main
export const CAT_PELT_LIGHT = '#f0e0c8' // Main_Light (chest, muzzle, tail tip)
export const CAT_EYE_COLOR = '#7fd45c'
// The GLB's rest pose faces +Z; our yaw convention has 0 = -Z. Verified in Chrome.
export const CAT_MODEL_YAW_OFFSET = Math.PI

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
