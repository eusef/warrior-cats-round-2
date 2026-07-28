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

// Combat stings. One per move so the three attacks are tellable apart with the
// screen off, plus an impact for a hit and a whiff for a miss. A miss that
// sounds like nothing reads as a broken button, which is why whiff exists.
export const AUDIO_SWIPE_GAIN = 0.24
export const AUDIO_KICK_GAIN = 0.32
export const AUDIO_IMPACT_GAIN = 0.36
export const AUDIO_WHIFF_GAIN = 0.17

// Birdsong. Gaps are seconds of real time between one bird and the next.
export const AUDIO_BIRD_GAIN = 0.14
export const AUDIO_BIRD_MIN_GAP = 4
export const AUDIO_BIRD_MAX_GAP = 11
export const AUDIO_BIRD_FIRST_GAP = 1.5 // seconds before the first bird after audio starts

// Night voices. Crickets are a sustained bed that fades in with the night
// factor; the owl is a rare one-shot. Both are silent by day.
export const AUDIO_BIRD_MIN_SUN = 2 // degrees of sun elevation below which birds stop
export const AUDIO_BIRD_DUSK_MULT = 3 // gaps stretch by up to this much as the sun drops
export const AUDIO_CRICKET_GAIN = 0.05
export const AUDIO_CRICKET_RATE = 4.2 // chirps per second
export const AUDIO_CRICKET_FADE = 2.5 // seconds to fade the bed in and out
export const AUDIO_CRICKET_NIGHT_THRESHOLD = 0.4 // night factor at which crickets start
export const AUDIO_OWL_GAIN = 0.09
export const AUDIO_OWL_MIN_GAP = 18 // seconds
export const AUDIO_OWL_MAX_GAP = 40
export const AUDIO_OWL_NIGHT_THRESHOLD = 0.6 // deeper into night than the crickets

// ---------------------------------------------------------------------------
// Day and night
//
// Time of day is a single number in [0, 1): 0 is midnight, 0.5 is noon. It
// lives in live.ts, not the store, because it changes every frame.
//
// The sun rides a tilted circle, so DAY_LENGTH_SEC does not split evenly into
// day and night. With the mid/amplitude below the sun is above the horizon for
// about 65% of the cycle, which keeps night short without a non-uniform clock.
// ---------------------------------------------------------------------------
export const DAY_LENGTH_SEC = 180 // real seconds for one full cycle
export const DAY_START_T = 0.36 // where a brand-new cat starts: mid-morning
// Sun elevation in degrees = MID + AMP * sin(). Peak +58, lowest -22.
export const SUN_ELEV_MID = 18
export const SUN_ELEV_AMP = 40
// Rotates the whole arc so noon lands where the old fixed sun was, which is
// what the shadow direction across camp was composed against.
export const SUN_AZIMUTH_OFFSET = -0.92 // radians
export const SUN_DISTANCE = 42 // how far the light rig sits from the cat
// The shadow-casting light never drops below this, so shadows never come from
// underneath the world. Below the horizon the sun's direction keeps sweeping
// but its height is pinned here, which reads as a moon and avoids the visible
// shadow snap you get from flipping to the antipode at the horizon crossing.
export const LIGHT_MIN_ELEVATION = 8 // degrees

/** One entry in the sky palette. Everything the time of day drives. */
export interface SkyKey {
  /** Time of day, 0..1. Keys must be sorted; the list wraps back to the first. */
  t: number
  /** Directional (sun/moon) light. */
  sun: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  fog: string
  fogNear: number
  fogFar: number
  /** Renderer tone-mapping exposure. A cheap global brightness lever. */
  exposure: number
  /** drei <Sky> shader uniforms. */
  turbidity: number
  rayleigh: number
  mie: number
  /** 0 = full day, 1 = deep night. Drives fireflies, crickets, owl, beacon. */
  night: number
}

// The palette. This table IS the look of the game across the cycle; tune here
// and nowhere else. The noon row is the old fixed v1 lighting verbatim, so
// midday still looks exactly like the build she has already played.
//
// The `t` values are NOT free. With the sun arc above, the sun crosses the
// horizon at t = 0.176 and again at t = 0.824, symmetric about noon, so the
// morning rows must mirror the evening rows about t = 0.5 (0.10<->0.90,
// 0.16<->0.84, 0.22<->0.78, 0.28<->0.72, 0.36<->0.64). Spacing them by eye
// instead put the whole morning ramp about 0.1 of a cycle late, which rendered
// deep-blue night fog and fireflies with the sun 20 degrees above the horizon.
// Change SUN_ELEV_MID or SUN_ELEV_AMP and these crossings move: recompute
// t = 0.25 +/- asin(-MID/AMP) / TAU and re-space, do not guess.
//
// Second trap, and it is the one that will fool you: these hex values are sRGB
// but three lights in LINEAR space, and the grass albedo is dark. Picking night
// colours that "look like a dark blue" in a colour picker renders pure black.
// A hemisphere sky of #2a3b5c at intensity 0.35 puts the ground at 0.004 linear,
// which tone-maps to 14/255. The night rows below are set so the ground lands
// near 0.048 linear, about a quarter of noon, which is roughly 58/255 and is
// actually readable. Judge a night row by measuring a ground pixel, never by
// how the swatch looks.
export const SKY_KEYS: SkyKey[] = [
  // midnight
  { t: 0.0, sun: '#aac2f0', sunIntensity: 1.0, hemiSky: '#6b85bd', hemiGround: '#2f3d24', hemiIntensity: 2.55, fog: '#243252', fogNear: 45, fogFar: 150, exposure: 0.9, turbidity: 1.2, rayleigh: 0.6, mie: 0.002, night: 1 },
  // still night, holds the midnight look until first light
  { t: 0.1, sun: '#aac2f0', sunIntensity: 1.0, hemiSky: '#6b85bd', hemiGround: '#2f3d24', hemiIntensity: 2.55, fog: '#243252', fogNear: 45, fogFar: 150, exposure: 0.9, turbidity: 1.2, rayleigh: 0.6, mie: 0.002, night: 1 },
  // first light. Cooler and pinker than the matching dusk row on purpose:
  // dawn is the one time of day the palette is not a mirror of the evening.
  { t: 0.16, sun: '#c9a7c8', sunIntensity: 0.6, hemiSky: '#8290b8', hemiGround: '#38452c', hemiIntensity: 2.76, fog: '#5d6a86', fogNear: 46, fogFar: 158, exposure: 0.95, turbidity: 6, rayleigh: 4.0, mie: 0.005, night: 0.75 },
  // sunrise
  { t: 0.22, sun: '#ffb37a', sunIntensity: 0.9, hemiSky: '#a9bcd2', hemiGround: '#3e4c2c', hemiIntensity: 1.84, fog: '#c9a98f', fogNear: 48, fogFar: 172, exposure: 0.98, turbidity: 8, rayleigh: 3.2, mie: 0.008, night: 0.4 },
  // early morning
  { t: 0.28, sun: '#ffd9a8', sunIntensity: 1.15, hemiSky: '#bcc9d8', hemiGround: '#445426', hemiIntensity: 1.24, fog: '#c4c4bd', fogNear: 52, fogFar: 180, exposure: 1.02, turbidity: 6, rayleigh: 2.4, mie: 0.007, night: 0.15 },
  // morning
  { t: 0.36, sun: '#fff0d2', sunIntensity: 1.3, hemiSky: '#c6dced', hemiGround: '#48592f', hemiIntensity: 0.99, fog: '#b9cfd8', fogNear: 55, fogFar: 188, exposure: 1.05, turbidity: 5, rayleigh: 1.8, mie: 0.006, night: 0.03 },
  // noon: the v1 lighting, unchanged
  { t: 0.5, sun: '#fff3dd', sunIntensity: 1.35, hemiSky: '#cfe3ef', hemiGround: '#4a5c33', hemiIntensity: 0.95, fog: '#b9cfd8', fogNear: 55, fogFar: 190, exposure: 1.05, turbidity: 4, rayleigh: 1.4, mie: 0.006, night: 0 },
  // afternoon
  { t: 0.64, sun: '#ffeccb', sunIntensity: 1.3, hemiSky: '#cadfec', hemiGround: '#4a5c33', hemiIntensity: 0.99, fog: '#bcd0d6', fogNear: 55, fogFar: 188, exposure: 1.05, turbidity: 5, rayleigh: 1.8, mie: 0.006, night: 0.03 },
  // golden hour
  { t: 0.72, sun: '#ffc98a', sunIntensity: 1.15, hemiSky: '#d9c3b4', hemiGround: '#4a5030', hemiIntensity: 1.29, fog: '#cfb69a', fogNear: 52, fogFar: 180, exposure: 1.02, turbidity: 7, rayleigh: 2.4, mie: 0.007, night: 0.15 },
  // sunset
  { t: 0.78, sun: '#ff9a5c', sunIntensity: 0.9, hemiSky: '#c09a92', hemiGround: '#38401f', hemiIntensity: 2.1, fog: '#d09070', fogNear: 48, fogFar: 172, exposure: 0.98, turbidity: 9, rayleigh: 3.2, mie: 0.01, night: 0.4 },
  // dusk
  { t: 0.84, sun: '#b083a8', sunIntensity: 0.6, hemiSky: '#8290b8', hemiGround: '#38452c', hemiIntensity: 2.76, fog: '#6a6a8c', fogNear: 46, fogFar: 158, exposure: 0.95, turbidity: 6, rayleigh: 4.0, mie: 0.006, night: 0.75 },
  // nightfall, back to the midnight look
  { t: 0.9, sun: '#aac2f0', sunIntensity: 1.0, hemiSky: '#6b85bd', hemiGround: '#2f3d24', hemiIntensity: 2.55, fog: '#243252', fogNear: 45, fogFar: 150, exposure: 0.9, turbidity: 1.2, rayleigh: 0.6, mie: 0.002, night: 1 },
]

// The camp beacon is meshBasic + fog:false + toneMapped:false, so it ignores
// every light in the scene and would read as a neon pillar at midnight. This
// scales its opacity down at night rather than touching the tuned day values.
export const CAMP_BEACON_NIGHT_MULT = 0.45

// ---------------------------------------------------------------------------
// Fireflies
//
// One instanced mesh, one material, hidden entirely by day. They live in a disc
// that follows the cat and wrap when they fall behind, so 48 of them look like
// a forest full rather than a sparse scatter across 200m of world.
// ---------------------------------------------------------------------------
export const FIREFLY_COUNT = 70
export const FIREFLY_RADIUS = 14 // metres; the disc that follows the cat
export const FIREFLY_FADE_BAND = 5 // metres of fade at the outer edge, so none pop
export const FIREFLY_MIN_HEIGHT = 0.3 // above ground
export const FIREFLY_MAX_HEIGHT = 2.2
export const FIREFLY_SIZE = 0.05 // radius of one mote. At 0.09 a lit mote read as a
// hard-edged octagon rather than a glowing point: additive + meshBasic gives a
// disc of uniform brightness, so the only thing keeping it soft is being small.
export const FIREFLY_DRIFT_SPEED = 0.35 // m/s of lazy horizontal wander
export const FIREFLY_BOB_RATE = 0.7 // Hz of vertical bob
export const FIREFLY_BOB_AMOUNT = 0.35 // metres
export const FIREFLY_BLINK_RATE_MIN = 0.6 // Hz
export const FIREFLY_BLINK_RATE_MAX = 1.6
// Exponent applied to the raw sine, to push most of the cycle dark so what reads
// is the flash. Cubed left only one or two of the swarm lit at any instant,
// which looked like a bug rather than a meadow.
export const FIREFLY_BLINK_SHARPNESS = 2
export const FIREFLY_COLOR = '#dff77a'
// Night factor at which they start to appear. 0.55 rather than a lower number
// because that is where the palette sits when the sun is within a few degrees
// of the horizon: at 0.35 the swarm was still lit with the sun 13 degrees up.
export const FIREFLY_NIGHT_THRESHOLD = 0.55
export const FIREFLY_OPACITY = 0.95
// When a mote falls out of the disc it is respawned on the rim. At a 7 m/s run
// the cat covers the whole 14m disc in two seconds, twenty times faster than
// the 0.35 m/s drift, so a uniformly random rim angle puts most of the swarm
// behind her and the meadow goes dark exactly while she is exploring. Moving,
// the respawn angle is drawn from a cone this wide centred on her heading, so
// she runs into fireflies instead of away from them. Standing still, the angle
// is uniform and this is unused.
export const FIREFLY_AHEAD_SPREAD = 2.2 // radians of cone, centred on velocity
export const FIREFLY_AHEAD_MIN_SPEED = 0.6 // m/s below which she counts as still
// Respawned motes are aimed back across the disc rather than in a random
// direction, so the population circulates through the bright middle instead of
// collecting on the dark rim.
export const FIREFLY_RESPAWN_INWARD_SPREAD = 1.6 // radians of jitter about "inward"

// --- Named landmarks --------------------------------------------------------
// Three places worth walking to. Each is discovered once, permanently, by
// entering its trigger. Positions are spread to three different corners so
// finding one does not hand her the other two, and every one of them sits well
// outside FOLIAGE_CLEARING_RADIUS so none can overlap camp.
//
// The IDs these feed are persisted as bits in the save. Append new landmarks to
// the end of the table in game/landmarks.ts, never reorder it, exactly like
// NAME_PREFIXES.

/** Seconds a discovery toast stays up. Longer than TOAST_DURATION: this one has
 *  two lines to read, and 1.8s is not enough for a 10-year-old to finish them. */
export const TOAST_DURATION_LONG = 5.2

export const FOURTREES_POS: readonly [number, number] = [-56, -34]
/** Metres from centre to each trunk. She walks into the middle of the ring. */
export const FOURTREES_RING_RADIUS = 8
export const FOURTREES_TRIGGER_RADIUS = 11
export const FOURTREES_SCALE = 2.3 // multiplies the ordinary tree, these are the great oaks

export const SUNNINGROCKS_POS: readonly [number, number] = [58, 46]
export const SUNNINGROCKS_TRIGGER_RADIUS = 10
export const SUNNINGROCKS_SPREAD = 5.2 // metres, radius of the boulder cluster
export const SUNNINGROCKS_COUNT = 7

/** The Thunderpath runs the full width of the world, so its trigger is a band
 *  on z rather than a circle. A circle at the midpoint would fire nothing if she
 *  reached the road out at x = -70, which is most of its length. */
export const THUNDERPATH_Z = -80
export const THUNDERPATH_WIDTH = 7 // metres of black stone
export const THUNDERPATH_TRIGGER_HALF_WIDTH = 7 // |z - THUNDERPATH_Z| below this discovers it
export const THUNDERPATH_SEGMENTS = 48 // samples across the world, so it drapes over the hills
export const THUNDERPATH_LIFT = 0.06 // metres above the ground, to beat z-fighting

/** Foliage inside these is deleted after placement, so nothing grows through a
 *  landmark. Deliberately larger than the trigger radii: the clearing should
 *  read as intentional from outside before she is close enough to discover it. */
export const FOURTREES_KEEPOUT = 13
export const SUNNINGROCKS_KEEPOUT = 11
export const THUNDERPATH_KEEPOUT_HALF_WIDTH = 8

export const LANDMARK_COLOR_TRUNK = '#4a3524'
export const LANDMARK_COLOR_CANOPY = '#33591f'
export const LANDMARK_COLOR_ROCK = '#9a9384'
export const LANDMARK_ROAD_COLOR = '#2e2e31'

// --- Combat -----------------------------------------------------------------
// Mila's move set. Two rules carry the whole system:
//
//   1. Slow moves hit harder and reach further, but can be interrupted during
//      their wind-up.
//   2. Slow moves leave you helpless for longer afterwards, so they can be
//      punished.
//
// Everything below is decoration on those two. All three of wind-up, reach and
// recovery scale together on purpose: the strongest move is the slowest, the
// longest reaching, and the most punishable.
//
// Cats do not die here. The loser yields and runs off, health is a number on a
// bar, and there is no blood, no wound and no killing blow. See CLAUDE.md.

/**
 * windup    seconds of commit before the hit is checked. Movement locks.
 * strike    seconds the lunge travels over. NOT in the original spec: it gives
 *           lunge as a distance with no duration, and a distance needs a time.
 * reach     metres, tested at the END of wind-up, before the lunge travels.
 *           That is what makes "the CPU backed off mid-wind-up" a clean miss.
 * damage    points off the target's health bar.
 * recovery  seconds helpless afterwards. This is the punish window.
 * lunge     metres travelled forward during the strike. 0 = stand and swing.
 * hop       metres of vertical arc during the strike. Feeds the landing squash
 *           in useCatJuice for free, the same way the hunting pounce does.
 */
export interface Move {
  windup: number
  strike: number
  reach: number
  damage: number
  recovery: number
  lunge: number
  hop: number
}

export const SWIPE: Move = { windup: 0.35, strike: 0.1, reach: 1.5, damage: 8, recovery: 0.2, lunge: 0, hop: 0 }
export const POUNCE: Move = { windup: 0.7, strike: 0.22, reach: 3.0, damage: 16, recovery: 0.4, lunge: 2.0, hop: 0.55 }
export const JUMPKICK: Move = { windup: 1.2, strike: 0.3, reach: 4.5, damage: 30, recovery: 0.7, lunge: 3.0, hop: 1.15 }

export const DUEL_PROMPT_RADIUS = 4 // metres; the Fight button appears inside this
export const FLEE_DISTANCE = 15 // metres from the rival at which a flee closes the duel
export const FLEE_SPEED_BONUS = 1.3 // multiplies top speed while running away

/** Seconds of stagger after a wind-up is interrupted. The spec says "short"
 *  without a number; long enough to read as a punish, short enough not to sting. */
export const DUEL_STAGGER_DURATION = 0.45
/** Radians either side of straight ahead that a strike can connect within.
 *  1.0 rad is about 57 degrees, so turning your back genuinely whiffs. */
export const DUEL_HIT_ARC = 1.0
/** Reach is measured centre-to-centre, so both bodies get counted once. */
export const DUEL_BODY_RADIUS = 0.35
/** Metres centre-to-centre the two cats are held apart on the fight line. They
 *  block each other rather than overlapping: from a side-on camera two cats in
 *  the same spot is the most obvious thing on screen. A lunge that would have
 *  carried through now stops on contact. */
export const DUEL_MIN_SEPARATION = 0.8
/** Seconds the hit-react clip plays on whoever just took damage. */
export const DUEL_HIT_FLINCH = 0.32
/** Seconds of yield beat after a health bar empties, before the duel closes. */
export const DUEL_END_DELAY = 1.4
/** Health the player is restored to on a loss. She backs off and keeps
 *  everything: position, hunts, name. No fail state that punishes. */
export const DUEL_LOSS_HEALTH_FLOOR = 35
/** Seconds after a duel ends before the rival can be challenged again. */
export const DUEL_REMATCH_DELAY = 6

// How fast the camera hands over between the follow rig and the ringside rig,
// per second. It is a blend and not a cut in either direction, so this is the
// only thing standing between the two and there is nothing else to tune.
//
// This used to drive a soft lock-on that stayed behind the cat and just leaned
// its aim toward the rival. That is gone: DUEL_CAM_LOOK_BLEND, DUEL_CAM_DISTANCE,
// DUEL_CAM_GAP_DOLLY and DUEL_CAM_MAX_DISTANCE went with it. A fight on a fixed
// line wants a fixed side-on view, and half-leaning a chase camera at it was
// strictly worse than either.
export const DUEL_CAM_LOCK_LAG = 3.2

// ---------------------------------------------------------------------------
// The fighting stage
// ---------------------------------------------------------------------------
// A duel runs on a line, not on a field. The axis is fixed when the fight opens
// and both cats are projected onto it every frame, which is simultaneously the
// left/right-only control scheme, the leash that stops either cat leaving, and
// the reason the side-on camera can be a fixed rig rather than a chase.

/** Metres each way from the stage centre. The full stage is twice this. */
export const DUEL_ARENA_HALF = 7
/** Floor on each half when trees or the world edge crowd the line. A small
 *  stage is playable; a stage the width of a cat is not, so this wins over a
 *  trunk and she clips it in the rare case rather than fighting in a corridor. */
export const DUEL_ARENA_MIN_HALF = 3.5
/** Clearance a trunk needs from the line before it stops blocking it. Body
 *  radius plus a little, so a cat never visibly grazes a tree she is pinned to. */
export const DUEL_ARENA_TREE_CLEARANCE = 0.55

/**
 * Metres perpendicular to the fight line that the camera sits back, at zero gap.
 *
 * Close to CAM_DISTANCE on purpose: these cats are 0.8m long and 0.35m tall, so
 * a camera parked far enough back to hold a 6m jump-kick at all times leaves
 * them as two specks in a field. Almost all of the framing is therefore in the
 * gap dolly rather than in this number, and the view is tight when they are
 * trading and wide only while somebody is closing.
 */
export const DUEL_CAM_SIDE_DISTANCE = 3.6
/** Extra metres of pull-back per metre of gap. Nearly 1:1, which is what keeps
 *  the pair at roughly a constant size on screen however far apart they are. */
export const DUEL_CAM_SIDE_GAP_DOLLY = 0.95
export const DUEL_CAM_SIDE_MAX_DISTANCE = 9.5
/** Metres above the cats' feet the camera eye sits. Low, so it reads as ringside
 *  rather than as a map view. */
export const DUEL_CAM_SIDE_HEIGHT = 1.35
/** Metres above the feet the camera aims at, measured at the midpoint. Below
 *  the eye height, so the view tilts down slightly; raising it pushes both cats
 *  toward the bottom of the screen. */
export const DUEL_CAM_SIDE_LOOK_HEIGHT = 0.35

// The rival. One wandering cat, spawned away from camp and away from every
// landmark so walking into her is its own small event.
export const RIVAL_SPAWN: readonly [number, number] = [34, -24]
export const RIVAL_HOME_RADIUS = 20 // metres she strays from RIVAL_SPAWN while wandering
export const RIVAL_WANDER_SPEED = 1.7 // m/s, an ambling patrol
export const RIVAL_WANDER_RETARGET_MIN = 3.0 // seconds
export const RIVAL_WANDER_RETARGET_MAX = 7.0
export const RIVAL_START_HEALTH = 100
export const RIVAL_TURN_SPEED = 6 // radians/s
export const RIVAL_ACCEL = 10
export const RIVAL_DECEL = 14

// Duel AI. Approach when out of range, attack when in range, occasionally back
// off or circle. That is the whole thing. No difficulty curve, no adaptive
// behaviour, no reaction-based dodging: watch Mila play before making it smarter.
export const RIVAL_APPROACH_SPEED = 4.2 // m/s closing on the player
export const RIVAL_BACKOFF_SPEED = 3.0 // m/s while repositioning
export const RIVAL_PREFERRED_GAP = 2.2 // metres she tries to hold when attacking
export const RIVAL_DECIDE_MIN = 0.45 // seconds between AI decisions
export const RIVAL_DECIDE_MAX = 1.1
export const RIVAL_REPOSITION_CHANCE = 0.28 // odds a decision is "back off and circle"
export const RIVAL_REPOSITION_TIME = 0.9 // seconds a reposition lasts
/** Weighted-random move pick, biased to swipe and pounce with the occasional
 *  jump-kick. Moves whose reach cannot cover the current gap are dropped first. */
export const RIVAL_WEIGHT_SWIPE = 0.5
export const RIVAL_WEIGHT_POUNCE = 0.35
export const RIVAL_WEIGHT_JUMPKICK = 0.15
export const RIVAL_FLEE_SPEED = 6.2 // m/s while yielding and running off
export const RIVAL_FLEE_TIME = 3.5 // seconds of running before she despawns
/** Metres at which she notices Mila coming and stops wandering to face her.
 *  Wider than DUEL_PROMPT_RADIUS on purpose: she has to be standing still by
 *  the time the Fight button appears, or walking up to her reads as chasing
 *  a cat who keeps leaving. */
export const RIVAL_NOTICE_RADIUS = 6

/** She is always a different cat from Mila's, whatever pelt Mila picked, so the
 *  two are never confusable mid-fight. Not a PELTS index for exactly that reason. */
export const RIVAL_MAIN_COLOR = '#5c4a3a'
export const RIVAL_LIGHT_COLOR = '#b9a888'
export const RIVAL_EYE_COLOR = '#f2d24a'

// HUD. Four buttons in a 2x2 block where the Stalk button sits outside a duel,
// entirely inside the right half of the screen: the joystick has no fixed home
// and spawns wherever a finger lands on the left, so anything placed there
// would eat movement area.
export const DUEL_BUTTON_SIZE = 96 // CSS px; well over the 44px touch minimum
export const DUEL_BUTTON_GAP = 12

/**
 * Where the bottom-right controls sit, in CSS px, before the safe-area inset
 * is added on top.
 *
 * The vertical margin is 72 and not 28 because of the home indicator. In
 * landscape Safari WITHOUT Add to Home Screen, env(safe-area-inset-bottom)
 * resolves to 0px, so a 28px margin puts the button's lower edge inside the
 * strip iPadOS reserves for the swipe-up gesture and the system starts
 * competing for the touch. That is what made the Stalk button "hard to press",
 * and it is what triggered the setPointerCapture throw that used to kill the
 * button outright. Both the Stalk button and the four duel buttons use these.
 */
export const HUD_EDGE_MARGIN_X = 40
export const HUD_EDGE_MARGIN_Y = 72
/** The Stalk / action button. Well over the 44px touch minimum. */
export const ACTION_BUTTON_SIZE = 116
/** Per-second exponential approach of the drawn health bar toward the real
 *  value, so damage reads as a tick-down rather than a jump cut. */
export const HEALTH_BAR_EASE = 7
