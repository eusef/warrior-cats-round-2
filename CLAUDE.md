# CLAUDE.md

## Project

A third-person cat survival sim in the spirit of WolfQuest Anniversary Edition, themed as Warrior Cats. Single player. The player is a warrior cat in a forest territory: hunt, explore, return to camp.

**Audience: one 10-year-old, playing on an iPad over the local network.** She is the only user who matters. Every tradeoff resolves toward "is this fun on a touchscreen in 30 seconds of play."

**This is never published or sold.** Warrior Cats is Erin Hunter / HarperCollins IP. Personal household use only. Do not add analytics, telemetry, accounts, cloud saves, share buttons, or deploy configs.

## Hard constraints

| Constraint | Rule |
|---|---|
| Target device | iPad, Safari, landscape. This is the ONLY target. |
| Input | Touch only. No keyboard, no mouse, no hover states. Desktop input is dev-only convenience. |
| Delivery | Vite dev server on the LAN. No build/deploy pipeline. |
| Framerate | 60fps on iPad. If a feature can't hold 60, cut the feature. |
| Dependencies | Ask before adding any new package. Prefer 30 lines of our own code over a dependency. |

## Content policy (non-negotiable)

This is for one 10-year-old. If it would not fit in a Bluey episode, it does not go in.

**Never implement, never propose, never research toward:**

- **Romance, courtship, mating, or finding a mate, in any form.** WolfQuest's core loop is mate-finding and the Warrior Cats books contain mating and kits. Both are excluded here. When a design reference points that way, drop it and build something else. Do not ask whether an exception applies.
- Nuzzling, grooming, cuddling, or any physical-affection framing between the player cat and an adult NPC.
- Kits, pregnancy, or raising a litter as a mechanic.
- Death of the player cat, gore, blood, visible wounds, or cats killing cats. Injury is a number on a health bar and nothing else.
- The grim material from the source books: murder, exile, prophecy dread, StarClan death visions, the Dark Forest.
- **Any generated or free-text dialogue.** Every NPC line is a hand-written string in `src/content/lines.ts`. No LLM API calls in the shipped game, ever, for any reason. This rule exists to close the whole category rather than filter it line by line.

Rivals get chased off, not fought. Prey is caught and the animation cuts away. When something sits near the line, stop and ask rather than writing it.

## Stack (pinned, do not change)

- Vite + React 18 + TypeScript
- `@react-three/fiber` (R3F) for the scene graph
- `@react-three/drei` for helpers (`useGLTF`, `useAnimations`, `Sky`, `Instances`)
- `zustand` for game state
- No physics engine. Movement is kinematic: raycast down onto terrain for ground height.
- HUD is plain DOM/CSS overlaid on the canvas, never rendered in WebGL.

## Repo layout

```
src/
  main.tsx
  App.tsx              # Canvas + HUD + Suspense boundary
  game/
    store.ts           # zustand: needs, position, time, save/load
    constants.ts       # ALL tunable numbers live here, nowhere else
  world/
    Terrain.tsx
    Foliage.tsx        # instanced only
    Camp.tsx
  actors/
    PlayerCat.tsx
    Prey.tsx
    useCatAnimation.ts
  hud/
    Hud.tsx
    Joystick.tsx
    ActionButton.tsx
  ui/
    CreateCat.tsx      # character creation sheet; DOM over the canvas, not WebGL
  input/
    useTouchInput.ts   # single source of truth for input
  debug/
    DebugOverlay.tsx   # fps, draw calls, state readout, ?debug=1 only
    expose.ts          # window.__game bridge for agent verification
public/models/         # .glb only
```

## R3F rules (these are the bugs you keep writing)

1. **Never call `setState` or a zustand setter inside `useFrame`.** Mutate refs. Push to the store only on discrete events (prey caught, hunger crosses a threshold, save).
2. **Multiple animated cats from one GLTF require `SkeletonUtils.clone(scene)`.** A plain `useGLTF` reuse shares the skeleton and every cat animates identically. This has broken this project before.
3. **Hoist allocations out of `useFrame`.** Module-level `const _v = new THREE.Vector3()` reused every frame. No `new` inside the loop.
4. **All motion is multiplied by `delta`.** Never assume 60fps in the math.
5. **`useGLTF.preload()`** every model at module scope. One `<Suspense>` boundary in `App.tsx` with a loading screen, not per-component.
6. **Foliage is instanced.** Individual `<mesh>` per tree is forbidden.

## iPad Safari rules

- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
- `touch-action: none` and `overscroll-behavior: none` on the canvas and all HUD controls. Otherwise dragging scrolls the page and the cat stops moving.
- `<Canvas dpr={[1, 2]}>`. Never uncapped `devicePixelRatio`.
- One directional light with one 1024 shadow map, or no shadows at all. No point-light shadows, no post-processing, no SSAO.
- Audio cannot start without a user gesture. Initialize the audio context on the first tap of the title screen.
- Touch targets are at least 44 CSS px.
- `apple-mobile-web-app-capable` so Add to Home Screen runs it without Safari chrome.
- **Assume nothing verified on desktop Chrome works on the iPad.** Safari is the test.

## Performance budget

| Metric | Ceiling |
|---|---|
| Draw calls | 100 |
| Triangles | 150k |
| Texture size | 1024x1024 |
| Unique materials | 16 |

Raised from 15 to 16 for the camp beacon, which draws its shaft twice: once
depth-tested and once with depth testing off so it stays visible through the
trees. Measured at the same time: 21 draw calls and 46k triangles, both far
inside budget. Material count is a proxy for shader-program switches, not a hard
GPU limit, so the two-pass beam was worth the one extra slot.

## Assets

Quaternius CC0 low-poly packs in `public/models/`, `.glb` format. There is no cat model in the pack: the Fox rig is the stand-in cat, recolored per character. Do not spend a session trying to model a cat. Do not generate placeholder cubes either, the fox is already there.

Animation clip names come from the GLTF. Read them at runtime and log them, never guess the string.

## Session workflow

1. **Plan before code.** Propose the component tree and the state shape. Wait for approval. Do not write implementation in the same turn as the plan.
2. **One system per session.** Movement, or hunting, or the HUD. Never two.
3. **Verify it yourself in Chrome before saying anything works.** See Verification below. Never report a change as done based on the code reading correctly.
4. **Every tunable number goes in `constants.ts` as a named export.** Speed, hunger rate, prey flee radius, camera distance. Phil tunes feel, not you.
5. **Commit at every working state**, small messages, no squashing.
6. **Ask before refactoring anything you did not write this session.**

### Definition of done

Two gates. Both required.

| Gate | Who | Blocks |
|---|---|---|
| **Chrome self-verify** | You, every change, unprompted | Layout, logic, crashes, console errors, animation, input |
| **iPad confirm** | Phil, before a system is called finished | Real touch, real Safari, real framerate |

"The code compiles" and "typecheck passes" are not gates.

## Verification

You can run and drive the game. Use it. Do not ask Phil to check something you can check yourself.

### The loop, every single change

1. `npm run dev -- --host` and open `http://localhost:5173/?debug=1` in Chrome
2. Emulate **iPad landscape (1180x820) with touch input enabled**. Never verify at a desktop viewport. Layout bugs only appear at the real aspect ratio.
3. **Read the console first.** A silent shader compile failure or a failed `.glb` fetch renders a black canvas with no error thrown. Zero console errors or warnings is the bar.
4. Screenshot. Actually look at it. A black canvas, a cat at the origin under the terrain, or a T-posed model are all "renders without crashing."
5. Drive the thing you just built. Drag the joystick and confirm the cat moves. Tap the action button and confirm the state changes.
6. Assert on state via `window.__game` rather than judging from pixels where possible.
7. Only then report, and include what you observed, not what you expected.

### Debug hooks (build these first, before any gameplay)

- `?debug=1` enables the whole set. Off by default so her build stays clean.
- `window.__game` exposes the zustand store: `getState()`, `setState()`, and a `teleport(x, z)` helper. This is how you set up a scenario without playing to it.
- `window.__game.seed(n)` for deterministic prey spawns. Non-deterministic worlds cannot be verified.
- An FPS and draw-call readout in the corner, from `gl.info.render`.
- `stats.json` dumped to console on demand: position, needs, entity count.

### What Chrome does not prove

Desktop Chrome is not iPad Safari. It will hit 60fps on anything, so **the performance budget is unverified until Phil checks the iPad.** These also cannot be verified in Chrome and must be flagged for a real-device check:

- `touch-action` and scroll-hijack behavior under real fingers
- Audio unlock on first gesture
- Safe-area insets under the home indicator
- Actual GPU headroom and thermal throttling
- Safari-specific WebGL and GLTF loading differences

When you finish a system, say plainly: *"Verified in Chrome: X, Y, Z. Needs iPad check: framerate, touch feel."*

## Design principles

- **Fun beats simulation.** WolfQuest is a real ecology sim. This is not. If realistic hunger decay makes it tedious, make it generous.
- **No fail states that punish.** No permadeath, no lost progress. Getting hurt sends the cat back to camp.
- **Readable at a glance.** She should understand the state of the cat from across the room.
- **Every action gets feedback within 100ms.** A sound, a wiggle, a particle. Silence reads as broken.
- **HUD is minimal and diegetic where possible.** Two indicators (health, hunger), one action button. No menus, no tooltips, no tutorial text. If it needs explaining, redesign it.

## v1 vertical slice: SHIPPED

Built, verified in Chrome, and confirmed playable on the iPad. Commit `8daf9ac`.

- [x] Cat moves with an on-screen joystick, walk and run animations blend by speed
- [x] Camera follows behind, drag the right half of the screen to orbit
- [x] One forest clearing, roughly 200m square
- [x] Health and hunger bars, hunger decays slowly
- [x] Mice that wander and flee on proximity
- [x] Crouch + pounce to catch a mouse, eating restores hunger
- [x] A camp marker that restores health when you rest there
- [x] Save to localStorage on a timer

Two honest deviations from the original wording, both deliberate:

- **The clearing is seeded-procedural, not hand-placed.** Trees, ferns and rocks are scattered by `mulberry32(seed)` so `?debug=1` worlds are reproducible. Re-placing by hand is still open if the layout matters later.
- **Ground height is one analytic function**, `groundHeightAt()`, shared by the terrain mesh and every actor, rather than the raycast-down the R3F rules call for. Same result, exact rather than approximate, and no per-frame ray cost with fifteen entities sampling it. Keep this in mind before writing a raycast.

**Deliberately excluded from v1, and still excluded unless promoted from the backlog:** clanmates, NPC dialogue, apprentices, patrols, territory scent marking, StarClan, weather, day/night, multiple maps, combat with other cats, quests. (Character creation was on this list and has since been promoted and built; see backlog item 2.)

## Backlog

Unlocked: she has played v1. Still ordered by joy per line of code, and still **do not start any of these unprompted** — Phil picks what comes next.

1. ~~**Finding camp.**~~ **DONE** — a shaft of sunlight in the clearing, `src/world/CampBeacon.tsx`. Diegetic, no HUD indicator needed. Verified in Chrome at 80m and at 140m from the far corner; fades out inside 16m and hands off to the ground ring. Two things worth knowing before touching it: the beam sets `fog={false}` because scene fog would erase it past 55m, and it draws its shaft **twice**, the second pass with `depthTest: false`, because a single depth-tested beam disappeared behind any tree that lined up with it. That second pass is the whole reason it is findable, not a nicety. Confirmed on the iPad: held 60fps, camp is visible from across the map, and she navigated to it unprompted without being told the light meant anything. The gold and opacity are tuned and do not need revisiting. The framerate result matters most: the beam is a lot of transparent overdraw at dpr 2, which desktop Chrome cannot measure, and it held. Keep that in mind before adding a second full-height transparent effect.
2. ~~**Character creation.**~~ **DONE** — a `'create'` phase between the title tap and play, `src/ui/CreateCat.tsx`. Six pelts, four eye colors, twelve name prefixes, all tap targets, no text entry. The sheet covers the bottom 300px and the cat standing above it is the **real model on the existing canvas**, slow-orbiting, repainted on every tap: `color.set` on materials that were already cloned, so the whole screen costs zero draw calls. Four things worth knowing before touching it. **The save stores indices into `PELTS` / `EYE_COLORS` / `NAME_PREFIXES`, never hex or strings**, so retuning a color updates the cat she already made — but never reorder those lists or you repaint her cat. **Save is v2; a v1 blob still loads** with all its progress and simply arrives without an identity, which is the single rule that routes her into creation exactly once. **The creation camera is its own framing block in `FollowCamera`** (`CREATE_CAM_*`), including a reduced ground clearance, because the play-mode 0.7m floor shoved the camera up and undid the composition. And `wasResting` in `PlayerCat` is seeded `true` on purpose: the cat spawns inside camp, so a `false` seed fired "Resting at camp." on frame one and instantly overwrote the "You are &lt;Name&gt;." beat. Verified in Chrome at a true 1180x820 with dpr 2: every pelt and eye color asserted by reading `material.color` off the cat rather than from pixels, all twelve names, save round-trip, v1 migration with 7 hunts intact, 17 draw calls, 44k triangles, zero console errors. **The iPad framerate is not separately measured** — the screen adds no geometry and no draw calls over normal play, so there was nothing new to measure, but that reasoning is not a device reading. Marked done by Phil.

   This also fixed a bug that predates it: `font: '700 44px/1 inherit'` is an **invalid CSS shorthand** (`inherit` is not a legal family inside it), so the browser dropped the whole declaration and the title, the toast and the action button had all been rendering at 16px/400 since v1. A `<button>` also needs an explicit `fontFamily: 'inherit'`. Use separate `fontSize` / `fontWeight` / `lineHeight` properties, never the shorthand, unless you are naming a real family list the way `DebugOverlay` does.
3. **Warrior name ceremony.** Start as `<Prefix>paw`. After N successful hunts, the name changes to `<Prefix><Suffix>` with a small ceremony beat. Cheap progression, lands hard for a reader of the books.
4. **Sound.** **BUILT, awaiting Phil's ear and an iPad check.** Every sound is
   synthesised in `src/audio/engine.ts`. There are no audio files: nothing to
   fetch, nothing for Safari to fail to decode, no new dependency, no
   `public/audio`. Paws are a bandpassed noise burst, the purr is 25Hz amplitude
   modulation on low filtered noise, the meow is a pitch-arced sawtooth through
   two formant bandpasses, birds are swept sine blips with a random stereo pan.

   `src/audio/AudioDriver.tsx` is the only thing that decides *when* a sound
   plays, and it is the only integration point. It derives every cue from `live`
   and from store snapshots rather than being called at the event sites, so
   PlayerCat, Prey, CreateCat and the store contain no audio code at all. The one
   trick worth knowing: `cat.eatT` only ever rises on a successful catch, so
   watching its rising edge *is* the catch event. It is mounted **inside** the
   Canvas as the last `useFrame` subscriber, not outside with its own rAF, so
   footstep cadence shares the delta the game integrated with and the whole
   system steps under `__game.step()`.

   Three things that will bite whoever touches this next. **`ctx.resume()`
   settles asynchronously**, several frames after the title tap, so the greeting
   meow cannot be a phase edge: the not-ready tracker sync consumes the edge
   before audio is live, and the greeting was silently swallowed every single
   time until it became a one-shot flag. **The title tap is the only unlock**,
   which is why `unlockAudio()` also installs a `visibilitychange` resume;
   without it, switching apps on the iPad would suspend the context and nothing
   would ever start it again. **There is no mute button** by deliberate choice,
   because the HUD is two bars and one button and the iPad has hardware volume.

   Verified in Chrome by counting cues off `__game.audio.counts()` and by reading
   RMS off an analyser tapped on the master bus, never by ear or by pixels: real
   tap moves the context from `suspended` to `running`; run cadence 12 paws in
   3.0s at 7 m/s (exactly `AUDIO_STEP_CADENCE_RUN`), walk 3, idle and stopped 0;
   purr starts on arriving at camp and stops on leaving, balanced starts/stops,
   sustaining at 0.11 RMS; pounce and catch fire once each per hunt; the hungry
   meow fires once at the threshold and does not repeat while hunger stays low;
   the ceremony sting fires once; 8 birds in 60s against a configured 4-11s gap;
   3 creation ticks for 3 taps and none for a no-op tap. Zero console errors.
   Draw calls and triangles unchanged, since `AudioDriver` renders `null`.

   **Not verified: whether any of it actually sounds good.** That is Phil's ear,
   and the meow is the one most likely to need retuning. **Also unverified: the
   iOS hardware mute switch.** WebAudio on iOS can be silenced by the physical
   switch regardless of volume, and Chrome cannot reproduce that. If the iPad is
   silent with the volume up, check the side switch before debugging the code.
5. **Juice pass.** Camera lag, tail sway, ear flick on idle, squash on landing, screen-edge vignette when hunger is low. Feel outranks features.
6. **Day and night.** `<Sky>` sun angle on a slow cycle, warmer light at dusk, fireflies. Enormous atmosphere for very little code.
7. **Named landmarks.** Fourtrees, Sunningrocks, the Thunderpath. First visit unlocks a journal entry. Turns wandering into discovery.
8. **Prey variety.** Vole (slow), squirrel (fast, breaks line of sight), bird (one chance, then it flies). Gives the hunt a skill ceiling.
9. **A clanmate who follows and comments.** Simple follow AI plus hand-written barks from `lines.ts`. Presence beats dialogue depth.
10. **Photo mode.** Freeze, orbit, hide the HUD, save a PNG. Kids share what they make.

## Commands

```bash
npm run dev -- --host    # serve on LAN
npm run typecheck

# http://localhost:5173/?debug=1   Chrome, iPad landscape emulation, touch on
# http://<desktop-ip>:5173         the iPad, clean build
```
