# CLAUDE.md

## Project

A third-person cat survival sim in the spirit of WolfQuest Anniversary Edition, themed as Warrior Cats. Single player. The player is a warrior cat in a forest territory: hunt, explore, return to camp.

**Audience: one 10-year-old, playing on an iPad over the local network.** She is the only user who matters. Every tradeoff resolves toward "is this fun on a touchscreen in 30 seconds of play."

**This is never published or sold.** Warrior Cats is Erin Hunter / HarperCollins IP. Personal household use only. Do not add analytics, telemetry, accounts, cloud saves, share buttons, or deploy configs. Nothing in this project is hosted anywhere; two-player co-op runs entirely on the laptop and the LAN, see below.

## Hard constraints

| Constraint | Rule |
|---|---|
| Target device | iPad, Safari, landscape. This is the ONLY target. |
| Input | Touch only. No keyboard, no mouse, no hover states. Desktop input is dev-only convenience. |
| Delivery | Vite dev server on the LAN. No build/deploy pipeline. Multiplayer needs that server to speak **HTTPS**; see below. |
| Framerate | 60fps on iPad. If a feature can't hold 60, cut the feature. |
| Dependencies | Ask before adding any new package. Prefer 30 lines of our own code over a dependency. |

## Two-player co-op runs entirely on the LAN

Backlog item 11, `docs/specs/warrior-cats-multiplayer-PRD.md`. **The PRD proposes
hosting the app on Cloudflare Pages. That was rejected on 2026-07-29 and the PRD
is out of date on this point.** Phil needs it to work on a plane, with no
internet at all, so nothing is deployed anywhere. Read this section, not the
PRD's "Key Decisions" table.

**The one fact everything here follows from:** WebRTC requires a secure context,
and `http://192.168.1.52:5173` is not one. It does not warn or throw, there is
simply no `RTCPeerConnection` at all. So the dev server has to speak HTTPS.

| Piece | What |
|---|---|
| `tools/make-certs.sh` | Issues a locally-trusted certificate into `certs/` (gitignored). Run once. |
| `vite.config.ts` | Serves HTTPS **if `certs/` exists**, plain http otherwise. |
| `signaling/` | A Worker + Durable Object under `wrangler dev`, **plain http on loopback only**, proxied by Vite at `/signal`. Introduces the two iPads, then closes the room. **Never deployed.** |

**Confirmed on the iPad, 2026-07-29:** over that certificate,
`isSecureContext` is true, `RTCPeerConnection` is available, and ICE gathers a
host candidate with **no STUN server configured and no internet reachable**.

**Five things that will bite whoever touches this next.**

**The certificate is issued for `papa.local`, not for an IP.** macOS advertises
its Bonjour name over mDNS on whatever link it is on, and iPadOS resolves it with
no configuration. An IP-bound certificate works at home and dies the moment the
laptop becomes a hotspot, because Internet Sharing hands out a different subnet
(192.168.2.x, not 192.168.1.x). The `.local` name is the same on every network.

**The leaf is 397 days, not mkcert's default.** mkcert issues about 27 months and
**iOS rejects any TLS certificate whose validity exceeds 398 days.** That is why
`make-certs.sh` signs its own leaf with openssl rather than just calling
`mkcert <names>`: the mkcert CA does the trust, but the lifetime has to be ours.

**`NET_ICE_SERVERS` is empty and must stay empty.** A STUN server is an internet
host; with no internet, ICE waits on it before falling back to the host
candidates that were always going to win. Two devices on one Wi-Fi have no NAT
between them and do not need STUN. **TURN is forbidden outright**, not merely
unconfigured: it would relay the gameplay through a third party, breaking both
the offline requirement and the iPad-to-iPad rule. A pair that can only connect
through a relay should fail loudly, not play slowly.

**The relay does not use WebSocket Hibernation, and that is a fix, not an
oversight.** Under `state.acceptWebSocket`, `close()` never completed the closing
handshake: the server socket stopped at readyState 2 and the client never saw a
close event, so a peer sat holding an open relay socket forever. Three assertions
failed identically across runs. Hibernation exists to avoid Cloudflare duration
billing, and there is no bill here. Plain `accept()` with sockets in a field.

**The relay is proxied by Vite at `/signal`, and must never get its own port
back.** This is the single most expensive thing learned so far. The relay served
its own HTTPS on 8787 and **both iPads failed to open any connection to it** --
the health fetch and the WebSocket alike -- while loading the page from 5173
over the very same certificate. From the laptop it was flawless: curl worked,
Chrome worked, `openssl s_client` showed an identical certificate and identical
TLS 1.3 on both ports, both were bound to all interfaces, and the firewall was
off. The cause was never found and does not need to be: the second origin is
gone. The relay now listens on plain http on **127.0.0.1 only**, needs no
certificate, and is unreachable from the network. `ws: true` on the proxy is
load-bearing; without it the health probe passes and every upgrade 404s, which
reads as "relay up, pairing broken".

**The relay address is derived from `window.location.origin`, never configured.**
The scheme is derived too: an `https:` page may not open a `ws:` socket, so a
hardcoded `ws://` works in Chrome on localhost and fails on both iPads.

**Rules that do not bend:**

- **No game data ever passes through the relay.** It handles opaque blobs, never
  parses SDP, and closes the room the moment the data channel opens.
  `signaling/test/relay.test.mjs` asserts both sockets reach CLOSED.
- **Solo play must work with no certificate, no relay and no peer.** Multiplayer
  is additive. Nothing in the game bundle imports `src/net/`.
- Still no analytics, telemetry, accounts, cloud saves, or share buttons.

### Onboarding a new iPad with no internet

A device that has not yet trusted the CA **cannot open anything this project
serves over HTTPS**, because that is precisely what the CA is for. So the one
thing it needs first has to arrive over plain http, and that is the entire
reason `tools/ca-server.mjs` exists as a separate server on **7173** rather than
being a route on the Vite server. Do not "tidy" it into Vite; it would stop
working for the only device that needs it. The port is duplicated in three
places — `NET_ONBOARD_PORT`, `ca-server.mjs`, `serve.sh` — because the last two
are plain scripts with no build step and cannot read a `.ts` file. It was 8080,
which is too common a number to hand a child as an address, and it is
deliberately **not 4173 or 5174**: those are where Vite goes on its own, and a
stray Vite on the onboarding port would serve the game to the one device that
cannot load it.

**The QR code points at 7173, not at the game.** This is the part worth
understanding, and it reverses the obvious design. An https URL in the code is
*unopenable* on an iPad that has not trusted the CA: Safari shows a bare TLS
error, there is nothing to tap, and nothing tells the child holding the camera
that a certificate is what is being asked of her. Neither child knows in advance
which kind of iPad is scanning. So `joinUrl()` in `src/net/qr.ts` builds
`http://<same host>:7173/?join=ABCD`, and the onboarding page **probes** the
game's https origin: a `no-cors` fetch resolves with an opaque response whatever
the status and **rejects when TLS fails**, which is exactly the difference
between the two kinds of iPad. Trusted, it forwards in about a tenth of a second
and she never knows the hop happened. Untrusted, it shows the three steps and
re-probes on `visibilitychange`, so **coming back to Safari after flipping the
trust switch is what opens the game** — she never types an https address at all.
One code works for both devices, which is what the extra hop buys. `?stay` on
the onboarding URL suppresses the forward, for debugging.

On a plane, all three devices get onto one network via **macOS Internet
Sharing**, which brings up a Wi-Fi access point at a fixed `192.168.2.1` and
needs no router and no internet. `papa.local` resolves over that link by mDNS,
which is why the certificate is issued for the name and not the address. The
certificate also carries `192.168.2.1` as a fallback for hand-typing.

**A scanned code needs no steps at all now.** Hand-typed, only the first is http:

1. `http://papa.local:7173` on the new iPad
2. Tap **Get the certificate**, then Settings, install the profile, then
   **Certificate Trust Settings, mkcert ON**
3. Switch back to Safari. The page notices and opens the game itself.

```bash
./tools/serve.sh                       # all three servers, one command
                                       #   5173 https  game + connection page
                                       #   8787 https  relay (never deployed)
                                       #   7173 http   onboarding, and where QRs land

./tools/make-certs.sh                  # only when the cert expires (397 days)

NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" \
  node signaling/test/relay.test.mjs   # 23 assertions against the live relay
```

**Her bookmark is now `https://papa.local:5173`, not an http IP.** The old
`http://192.168.1.52:5173` cannot work: the server speaks HTTPS whenever
`certs/` exists. The new address is also the better one, because it survives
moving to any other network.

## Content policy (non-negotiable)

This is for one 10-year-old. If it would not fit in a Bluey episode, it does not go in.

**Never implement, never propose, never research toward:**

- **Romance, courtship, mating, or finding a mate, in any form.** WolfQuest's core loop is mate-finding and the Warrior Cats books contain mating and kits. Both are excluded here. When a design reference points that way, drop it and build something else. Do not ask whether an exception applies.
- Nuzzling, grooming, cuddling, or any physical-affection framing between the player cat and an adult NPC.
- Kits, pregnancy, or raising a litter as a mechanic.
- Death of the player cat, gore, blood, visible wounds, or cats killing cats. Injury is a number on a health bar and nothing else.
- The grim material from the source books: murder, exile, prophecy dread, StarClan death visions, the Dark Forest.
- **Any generated or free-text dialogue.** Every NPC line is a hand-written string in `src/content/lines.ts`. No LLM API calls in the shipped game, ever, for any reason. This rule exists to close the whole category rather than filter it line by line.

Rivals are chased off, not beaten down: a duel ends with the loser yielding and
running, never with a cat dying, and injury stays a number on a health bar with
no blood, no wound and no killing blow. `Attack` and the two `Idle_HitReact`
clips are bound for exactly that beat and `Death` never is. Prey is caught and
the animation cuts away. When something sits near the line, stop and ask rather
than writing it.

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
    duel.ts            # pure combat rules; no R3F, no store, no live
    constants.ts       # ALL tunable numbers live here, nowhere else
  world/
    Terrain.tsx
    Foliage.tsx        # instanced only
    Camp.tsx
  actors/
    PlayerCat.tsx
    RivalCat.tsx       # the CPU cat: wanders, then duels
    Prey.tsx
    useCatAnimation.ts
  hud/
    Hud.tsx
    Joystick.tsx
    ActionButton.tsx
    DuelControls.tsx   # Fight prompt + the four move buttons
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
- Audio cannot start without a user gesture. Initialize the audio context on the first tap of the title screen. Creating and resuming it is **not** enough on iOS: Safari only hands over the output once a buffer has actually been played from inside that gesture, so `unlockAudio()` plays one silent sample there.
- **Low Power Mode silences WebAudio**, ringer on and volume up notwithstanding. This cost a debugging round on an iPhone before the device was even the target. Check the battery icon before touching the audio code. `?debug=1` reads out context state, master-bus RMS and cue counts precisely so this is a ten-second check rather than a guess.
- Touch targets are at least 44 CSS px.
- **Never call `setPointerCapture` in a touch handler.** It throws
  `NotFoundError` whenever the pointer is not active by the time the handler
  runs, which on iOS is exactly what happens when the system has already claimed
  the touch for a gesture. If anything after the throw was going to change game
  state, it never runs. Catch the release on `window` instead, the way
  `useTouchInput` does for the joystick: it does the same job and cannot throw.
- **Do the state change first in a press handler, decoration after.** A handler
  that sets a "held" latch, then throws, then never engages, leaves a button
  that is dead for the rest of the session rather than for one tap.
- **Keep tappable things out of the bottom edge.** In landscape Safari without
  Add to Home Screen `env(safe-area-inset-bottom)` is `0px`, so a small margin
  puts a control inside the home-indicator swipe strip and iPadOS competes for
  the touch. `HUD_EDGE_MARGIN_Y` exists for this and is 72, not 28.
- **Hide a control with `setShown`, never with `opacity` alone.** An invisible
  element is still hit-tested, so an `opacity: 0` button goes on eating every
  press that lands on it. Worse, `pointer-events: none` on a parent does **not**
  stop a child that sets `auto` on itself: the duel grid did exactly that, and
  its four hidden move buttons sat on top of the Stalk button and swallowed
  19 of 25 presses. Only the outer ring still worked, and it read as a
  fiddly button rather than as a bug. `setShown` in `Hud.tsx` writes `opacity`,
  `visibility` and `pointerEvents` together and is the only thing allowed to
  hide HUD chrome. `visibility` is the load-bearing one, because a descendant
  cannot quietly opt back out of it.
- `apple-mobile-web-app-capable` so Add to Home Screen runs it without Safari chrome.
- **Assume nothing verified on desktop Chrome works on the iPad.** Safari is the test.

## Performance budget

| Metric | Ceiling |
|---|---|
| Draw calls | 100 |
| Triangles | 150k |
| Texture size | 1024x1024 |
| Unique materials | 23 |

Raised from 22 to 23 for the peer cat in two-player co-op, and **one** is the
whole price of a third cat rather than the five the rival cost. `PlayerCat` and
`RivalCat` now both go through `src/actors/catSkin.ts`, which clones `Main`,
`Main_Light` and `Eyes` per cat — those are the three the pelt and eye pickers
write to — and **shares one instance each of `Grey` and `Black` across every
cat**, because nothing in the project ever recolours them. Grepped to confirm
that before relying on it. It is also why a departing peer's cat **freezes rather
than fades**: a fade needs `transparent = true`, and setting it on a shared
material would turn Mila's cat and the rival translucent too.

Measured in Chrome at 1180x806, dpr 2, with the connect screen open over a
running game: **23 unique materials, 25 draw calls, 41.7k triangles, 14 shader
programs.** Draw calls and triangles are inside the numbers already recorded for
two cats, because the peer cat is hidden until a peer actually arrives.

Raised from 15 to 16 for the camp beacon, which draws its shaft twice: once
depth-tested and once with depth testing off so it stays visible through the
trees. Measured at the same time: 21 draw calls and 46k triangles, both far
inside budget. Material count is a proxy for shader-program switches, not a hard
GPU limit, so the two-pass beam was worth the one extra slot.

Raised again from 16 to 17 for the fireflies, which are one instanced mesh with
one additive material. Counted in Chrome at 1180x820: **17 unique materials, 13
draw calls and 43.5k triangles by day, 14 and 49.1k at night.** The swarm is the
entire difference: by day it sets `visible = false` and returns before its
transform loop, so it costs one comparison and no draw call for roughly two
thirds of the cycle.

Raised from 17 to 22 for the rival cat. This one is not a shader trick, it is
just a second cat: `PlayerCat` clones all five GLB materials per cat so that
recolouring one never tints the other, and the rival has to be a visibly
different animal from whatever pelt Mila picked or the two are unreadable in a
scuffle at arm's length. Five materials is the honest price of that and there is
no way to pay less of it without the two cats sharing a colour.

Measured in Chrome at 1180x806, dpr 2, with both cats in frame and a duel
running: **22 unique materials, 25 draw calls and 44.6k triangles, holding 60fps.**
Draw calls went 13-18 to 25 and triangles moved by under 2k, so the only budget
line this actually moves is the material count. She is one cat, not a system:
adding a second rival would cost another five, and at that point the materials
should be shared rather than cloned.

**Confirmed on the iPad at a solid 60fps**, two cats and a duel over the
beacon's transparent overdraw at dpr 2. This is the first line in this table
with a real device reading behind it rather than a desktop one, and it is the
answer to the standing warning below that the budget is unverified until the
iPad says so. It does not license a second rival: this is one more cat measured,
not headroom measured.

## Assets

Quaternius CC0 low-poly packs in `public/models/`, `.glb` format. The pack has no
cat, so **`Cat.glb` is built rather than downloaded**: a donor cat mesh welded
onto the Quaternius Fox armature by `tools/cat_transfer.py`, inheriting all
twelve of the fox's clips. See backlog item 12 and `public/models/PROVENANCE.md`.
`Fox.glb` is still required as the source of that rig.

Do not spend a session trying to model a cat, and do not generate placeholder
cubes. If the cat needs to change, re-run the transfer script.

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
3. **~~Warrior name ceremony~~. DONE** Start as `<Prefix>paw`. After N successful hunts, the name changes to `<Prefix><Suffix>` with a small ceremony beat. Cheap progression, lands hard for a reader of the books.
4. ~~**Sound.**~~ **DONE** — confirmed audible on the iPad and the mix approved
   by ear, unchanged from the tuned defaults. Every sound is
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

   Confirmed on the iPad: audible, and the mix was approved by ear without a
   single gain being changed. **The gains and the meow's pitch arc are tuned and
   do not need revisiting.** The one thing still not separately measured is
   framerate, because audio adds no geometry, no draw call and no per-frame
   allocation, so there was nothing new to measure — but that reasoning is not a
   device reading.

   **If it ever goes silent on a device, check Low Power Mode first.** That was
   the entire cause of an iPhone that would not make a sound with the ringer on
   and the volume up, and it cost a debugging round before the code was even
   suspect. The `?debug=1` audio readout exists to make that a ten-second check.
5. **~~Juice pass~~. DONE.** Camera lag, tail sway, ear flick on idle, squash on landing, screen-edge vignette when hunger is low. Feel outranks features.
6. ~~**Day and night.**~~ **BUILT, needs the iPad check.** A full cycle is
   `DAY_LENGTH_SEC = 180` real seconds. Time of day is one number in `live.timeOfDay`
   (0..1, 0 = midnight), advanced by `Lighting.tsx` and nowhere else, and persisted
   as save **v4** (`tod`); a v3 blob loads at `DAY_START_T`, mid-morning. The clock
   only runs while `phase === 'playing'`, so the title and creation screens hold
   still. `src/world/daylight.ts` is the whole model as pure functions with no R3F
   import, which is what lets `__game.setTime(t)` scrub the cycle and assert it
   without waiting three minutes.

   **Five things that will bite whoever touches this next.**

   **The `t` values in `SKY_KEYS` are not free.** The sun crosses the horizon at
   t = 0.176 and 0.824, symmetric about noon, so the morning rows must mirror the
   evening rows. Spacing them by eye put the whole morning ramp 0.1 of a cycle
   late and rendered night fog and fireflies with **the sun 20 degrees above the
   horizon**. If you change `SUN_ELEV_MID` or `SUN_ELEV_AMP`, recompute the
   crossings and re-space; do not guess.

   **The palette hexes are sRGB but three lights in linear, and the grass is
   dark.** Night colours that look like a reasonable dark blue in a picker render
   pure black: `#2a3b5c` at intensity 0.35 put the ground at 0.004 linear, which
   tone-maps to 14/255, and the whole world was an unreadable black rectangle
   that `castShadow = false` did not change. The night rows are now set by
   measuring a ground pixel, landing at 41/255 green against noon's 105. **Judge
   a night row by reading a pixel, never by how the swatch looks.**

   **The shadow-casting light never drops below `LIGHT_MIN_ELEVATION` (8 deg).**
   It follows the sun's arc but pins its height at night, so the horizontal sweep
   continues and it reads as a moon. Flipping to the sun's antipode at the
   horizon crossing is the obvious alternative and it snaps every shadow in the
   scene through 180 degrees in a single frame.

   **Fireflies respawn *ahead* of her, not at a uniform rim angle.** At a 7 m/s
   run she crosses the 14m disc in two seconds against a 0.35 m/s drift, so a
   uniform angle strands the swarm behind her and the meadow goes dark exactly
   while she is exploring. Measured after the fix: 40 of 70 lit while running,
   37 standing still. They are additive on purpose (they only ever exist against
   a dark sky) which is the opposite call from the camp beacon, for the opposite
   reason. Do not "fix" one to match the other.

   **The camp beacon is `meshBasic` + `fog: false` + `toneMapped: false`,** so
   nothing in the scene dims it and at midnight it was a neon pillar. It now
   scales by `CAMP_BEACON_NIGHT_MULT`, folded into the single `useFrame` that
   already owns its opacity. Measured 0.4991 at noon, 0.225 at night.

   Audio: birds thin out as the sun drops and stop below `AUDIO_BIRD_MIN_SUN`,
   crickets fade in as a bed, and a rare owl hoots deep in the night. All three
   are cued from `AudioDriver`, which is still the only thing that decides when a
   sound plays. Counted under `__game.step()`: day 5 birds / 0 owls / no crickets
   in 30s; dusk-to-night 1 bird / 1 owl / crickets on; a full 180s cycle gives 14
   birds, 2 owls, 2 balanced cricket start/stop pairs.

   Verified in Chrome at a true 1180x820: full-cycle sweep with zero
   sun-versus-palette violations, save v4 round-trip plus v3/v2/v1 migration and
   a v9 blob correctly rejected, 17 materials, 13/14 draw calls, 43.5k/49.1k
   triangles, zero console errors. **Not verified: the iPad.** Framerate is the
   real question, because night adds 70 additive transparent motes on top of the
   beacon's existing overdraw at dpr 2, and that is exactly the thing desktop
   Chrome cannot measure. **Also unverified by ear: the cricket bed and the owl**,
   which are new voices and have never been through a device mix check.
   `DAY_LENGTH_SEC` at 180 is deliberately fast; `__game.setTime()` makes it a
   ten-second job to try 8 minutes instead.
7. ~~**Named landmarks. Done.** Three places, found
   by walking into them, each firing a one-shot three-line toast. **No panel, no
   journal button, no menu**, by deliberate choice: the HUD stays two bars and
   one button, and the entry is the reward rather than something to go and read.
   `src/game/landmarks.ts` is the whole rule as pure functions with no R3F and no
   store import, so discovery is assertable headlessly; `src/world/Landmarks.tsx`
   only draws. Names and entries are hand-written in `lines.ts` as usual.

   **Five things that will bite whoever touches this next.**

   **The Thunderpath's trigger is a band on z, not a circle.** It spans the whole
   world on x, so a circle at its midpoint fires nothing if she reaches the road
   out at x = -70, which is most of its length. `LandmarkShape` exists solely for
   this. Verified firing at x = -88, -20, 0, 45 and 88, and never at 12m off.

   **Foliage keep-out is a post-filter, not another `continue` in `placeField`.**
   Rejection sampling burns a `rand()` per attempt, so rejecting inside the loop
   shifts the stream and **reshuffles her entire existing forest**. Filtering
   after placement consumes identical draws. Counts went 190/260/55 →
   160/228/48 with zero plants left inside a landmark.

   **Everything reuses `foliageMaterial`, so this cost ZERO new materials.**
   Still 17. That material colours per instance via `instanceColor`, not a
   uniform, which is why even the single road quad is an `InstancedMesh` of one:
   a plain `<mesh>` renders it untinted white. Do not "simplify" it to a mesh.

   **The great oaks push into `treeColliders`, and Foliage clears that list on
   every seed change.** `Landmarks` therefore depends on `seed` purely to
   re-push; without it `__game.seed(n)` silently lets her walk through the ring.
   Confirmed still solid after a reseed to 99 and back.

   **Save is v5 (`found`, a bitmask).** Bit position is the landmark id, so
   `LANDMARKS`, `LANDMARK_NAMES` and `LANDMARK_ENTRIES` are **append-only**, the
   same rule as `NAME_PREFIXES`. The loaded mask is `&`-ed with
   `LANDMARK_ALL_MASK` so a junk blob cannot report 4 of 3.

   The toast now carries its own duration (`TOAST_DURATION_LONG = 5.2`) and is
   `whiteSpace: 'pre-line'`; 1.8s is not enough to read three lines. Discovery is
   written **last** in PlayerCat's frame so it wins the unqueued toast slot
   against a catch. The sting reuses `playCeremony()` rather than adding a fourth
   synth voice, since it is the only cue already approved by ear on the device.

   Verified in Chrome at 1180x806, dpr 2: discovery fires inside and not at
   12.5m out, once only, on a real joystick walk-in as well as a teleport; band
   fires along the whole road; v5 round-trip plus v1/v2/v3/v4 migration (all
   arriving with nothing found and hunts intact), v9 rejected, junk `0xff`
   masked to 7; oaks solid at 1.52m; the road a constant 0.06m above ground at
   every sampled vertex across its 190m span; 17 materials, 14-18 draw calls,
   40.7k-46.6k triangles; title → create → play unbroken; zero console errors.
   **Viewport was 806px tall, not 820** — a 982px screen cannot host an 820px
   viewport under browser chrome, so the vertical 14px is unverified and this is
   a slightly harsher test, not a laxer one. **Not verified: the iPad**, and the
   entry text has never been read at arm's length on a real screen.
8. **Prey variety (ignore for now).** Vole (slow), squirrel (fast, breaks line of sight), bird (one chance, then it flies). Gives the hunt a skill ceiling.
9. **A clanmate who follows and comments(ignore for now).** Simple follow AI plus hand-written barks from `lines.ts`. Presence beats dialogue depth.
10. **Photo mode(ignore for now).** Freeze, orbit, hide the HUD, save a PNG. Kids share what they make.
11. **Multiplayer mode.** Two kids, two iPads, one forest.
    `docs/specs/warrior-cats-multiplayer-PRD.md`, but read
    "Two-player co-op runs entirely on the LAN" above first: the PRD proposes
    hosting on Cloudflare Pages and **that was rejected**, because it has to work
    on a plane.

    **Phase 0 (the transport): DONE, confirmed on two iPads 2026-07-29.**
    Two iPads, one QR scanned with the native Camera app, **connected in 3.6
    seconds** with an 11ms round trip and 8 of 8 heartbeats returned. Nothing
    deployed, nothing hosted, no account anywhere.

    **The two readouts that matter, and what they close:**

    **`candidate pair: host / host`.** The link is direct iPad-to-iPad over the
    LAN. No STUN was configured and none was needed, and there is no TURN
    server, so this is the proof that gameplay is not being relayed through
    anything. It also closes **both** of the PRD's top risks in one line: the
    router does not do AP/client isolation, and **iOS's mDNS `.local` host
    candidates do resolve between two iPads**, which was the failure nobody
    could have predicted from a desktop.

    **`relay socket: NONE` while connected.** The signalling service is not
    merely declining to carry gameplay, it is gone. Corroborated from the relay
    side: exactly two WebSocket upgrades to that room, one per iPad, and no
    further traffic.

    **Three things that will bite whoever touches this next**, on top of the
    five in the LAN section above.

    **The early-candidate buffer is not defensive coding, it fired on the first
    real run.** The guest logged `drained 1 early candidate(s)`: a candidate
    arrived before `setRemoteDescription`, and `addIceCandidate` throws in that
    state. Without the queue in `peer.ts` that candidate is dropped silently,
    and on a two-candidate connection dropping one is the whole connection.

    **The connect timeout is armed when the peer ARRIVES, never at `start()`.**
    Armed at start it measures "how long until a friend walks over with an
    iPad", so the host times out after 20 seconds and drops her own room while
    the QR is still on the table. Caught in Chrome doing exactly that.

    **A guest told it is the host means the code is stale**, not that something
    went right. That room was empty, so the QR being scanned is dead. `peer.ts`
    takes a `want` role solely to catch this; unhandled it is the worst failure
    in the flow, because it looks exactly like a working join and waits forever.

    `signaling/test/relay.test.mjs` is 23 assertions against the running relay
    over `wss://papa.local:5173/signal`. Run it before blaming the network: a
    relay bug during a two-iPad test is otherwise indistinguishable from a
    router problem. It has already caught four, including WebSocket Hibernation
    silently breaking `close()`.

    **Not built yet:** Phase 1 (Tier 0, both cats in one forest, `src/net/`
    integrated into the game, `RemoteCat.tsx`) and Phase 2 (Tier 1, shared
    prey). `src/net/spike/` and `net.html` are the Phase 0 harness and get
    deleted when Phase 1 lands; `peer.ts`, `signal.ts` and `qr.ts` survive.
    **Nothing in the game bundle imports `src/net/` yet**, which is why solo
    play cannot have regressed.
12. ~~**Cat Models.**~~ **DONE** — she is a cat now, not a recoloured fox.
    `public/models/Cat.glb`, and it is **built, not downloaded**:
    `tools/cat_transfer.py` welds a donor cat mesh onto the fox's armature in
    headless Blender, so the cat inherits all twelve of the fox's clips and
    nothing in `useCatAnimation`, `useCatJuice`, `PlayerCat` or `RivalCat`
    changed. The only edit outside `tools/` was `MODEL_URL` in the two actors.
    Confirmed on the iPad by Phil.

    **804 triangles against the fox's 1,848**, same 5 materials, same 5 draw
    calls per cat. The budget table above is unchanged and now has slack it did
    not have: two cats cost about 2k triangles rather than 3.7k.

    **Re-run it rather than hand-editing the GLB:**

    ```bash
    /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/cat_transfer.py
    node tools/check-cat-glb.mjs public/models/Cat.glb
    ```

    `tools/check-cat-glb.mjs` is twelve mechanical assertions from
    `docs/specs/cat-model.md`. **It found five defects that looking at the model
    would not have**, which is the entire argument for having it, and it is worth
    knowing what they were before touching any of this.

    **The fox's clips are authored at exactly 30fps and Blender's scene defaults
    to 24.** The importer lays keys on whole frames, so Gallop's 13.6 frames
    round to 13 and the round trip silently DROPS the terminal frame -- the
    duplicate of frame 0 that is the only thing making the clip loop seamlessly.
    Walk, Gallop, Gallop_Jump and Eating all came back popping. `render.fps = 30`
    before the import is load-bearing.

    **Blender dedupes material names against whatever is still in `bpy.data`.**
    The fox's own `Main`, `Main_Light`, `Grey`, `Black` and `Eyes` are orphaned
    once its mesh is deleted but still resident, so new ones became `Main.001`.
    That fails the `m.name === 'Main'` test in `PlayerCat.tsx` **silently**: the
    cat loads, renders, animates, and simply cannot be recoloured. The script
    purges `bpy.data.materials` first.

    **`object.scale` multiplies LOCAL axes, before an unapplied rotation.** The
    cat is rotated -90 degrees about Z to face the fox's -Y, so world-axis scale
    factors landed on the wrong axes and produced a cat 5.85 long against the
    fox's 5.59. Apply the rotation before computing the scale.

    **A 482-polygon mesh has no facet small enough to be an eye.** The first pass
    assigned existing polygons to `Eyes` and `Black` on the theory that adding no
    geometry was tidier. One polygon at the eye is a green block the size of a
    cheek. Features get their own quads, sized independently of the body, which
    is exactly what the fox does with its 8-triangle `Eyes` primitive. Ten
    triangles total. And `Main_Light` must be a **height** test, not a normal
    test: `normal.z < -0.4` catches the fold at every shoulder, hip and elbow,
    and blotched the whole pelt with cream.

    **Automatic weights leaves floating geometry unweighted.** Bone heat needs a
    vertex inside the volume the bones radiate through, and 12 of the 20 feature
    vertices were outside it. An unweighted vertex does not follow the skeleton,
    so the eyes and nose would hang in the air while the cat walked out from
    under them. `repair_weights()` copies each orphan's weights from its nearest
    weighted neighbour, and the run logs `0 still unweighted`.

    Verified in Chrome at 1180x757, dpr 2: 12/12 checks, all ten clips bound on
    both cats with zero unresolved, juice tail 8/8 and both ears 2/2, recolour
    asserted by reading `material.color` off the cat rather than from pixels,
    19-20 draw calls, 39.5k-46.2k triangles, 60fps, zero console errors.

    **The eye is small.** It reads at the creation camera and is a mark rather
    than an eye further out. Its half-size is `0.070 * hd.x` in `add_features`,
    and every anchor position in that function is a named fraction. Tune there,
    do not re-model.

    **`Fox.glb` stays.** It is the source of the rig and every clip, and the
    transfer script reads it on every run.

13. ~~**Combat.**~~ **DONE** — built, verified in Chrome, and confirmed on the
    iPad: touch, a solid 60fps with two cats, and the mix by ear. Real-time
    positional duelling
    against one wandering rival, built to `docs/specs/combat.md`. The rules are
    `src/game/duel.ts` as pure functions with no R3F, no store and no `live`
    import, so every one of them is assertable headlessly the same way
    `landmarks.ts` is. `src/actors/RivalCat.tsx` is the second cat and owns all
    the duel bookkeeping the player half does not.

    **Six things that will bite whoever touches this next.**

    **`Attack`, `Idle_HitReact1` and `Idle_HitReact2` are now bound**, reversing
    an exclusion that was documented in two files. Phil approved it explicitly.
    **`Death` is still never bound and never will be.** The line the content
    policy actually draws is at death and gore, not at a swing and a flinch, and
    injury is still only a number on a bar.

    **The jump-kick is aliased onto the pounce slot, not given its own.** Both
    want `Gallop_Jump`, and `mixer.clipAction()` returns the SAME
    `AnimationAction` for one clip on one root, so two slots would share a single
    action and fight over its weight every frame depending on `Object.keys`
    order. `ALIAS` in `useCatAnimation` exists solely for this.

    **Per-cat phase, move, timer and both health values live on `live`, not the
    store.** This is the one place the spec is not followed literally: it says
    they live in the store one sentence before saying the timers tick on refs
    inside `useFrame`. A store write per phase transition re-renders the HUD
    about eight times a second. The store keeps only `duelActive`/`duelOutcome`/
    `duelCount`, which change about three times per duel.

    **Reach is tested at the END of the wind-up, before the lunge travels.** That
    single ordering is what makes "the rival backed off during the wind-up" an
    honest miss instead of a hit that catches up, and it is why `advance()`
    returns the `'strike'` transition rather than letting callers poll the phase.

    **`applyHit` is the only place the interrupt rule lives.** A hit during a
    wind-up moves the phase to `stagger`, and the cancelled strike then simply
    cannot resolve, because a strike only ever fires on the windup -> strike
    transition. There is no second flag to keep in sync.

    **Save is untouched at v5.** A duel deliberately does not persist; health
    already did. `load()` calls `resetRival()` anyway.

    Verified in Chrome at a true 1180x806, dpr 2, driven under `__game.step()`
    at a fixed dt: clip names read off the GLB at runtime and all ten slots bound
    on both cats with zero unresolved; reach flips exactly at each move's
    boundary (swipe 8 dmg at 2.05m / 0 at 2.35m, pounce 16/0 at 3.55/3.85,
    jump-kick 30/0 at 5.05/5.35); a swipe into a jump-kick's wind-up leaves the
    kick dealing 0 and the player in `stagger` while the swipe still lands its 8;
    phase durations exactly 72/18/42 frames against the constants; joystick at
    full deflection gives 7.0 m/s in neutral and exactly 0 through wind-up and
    recovery; lunges travel 0.00 / 2.00 / 2.99m against constants of 0 / 2.0 /
    3.0; both cats stayed in frame across all 72 samples of a full circle with a
    max camera move of 0.27m in a frame; flee closes instantly when the rival is
    not mid-strike and at 15.07m when she is, and works mid-wind-up; a 49-second
    unscripted fight ran to a loss with health floored at 35 and hunts, position
    and name all intact; ten skinned meshes with ten distinct skeletons; save v5
    round-trip plus v1 migration and v9 rejection; a real trusted tap on SWIPE
    drove windup -> strike -> recovery for 8 damage without stealing the joystick
    or the orbit drag; zero console errors throughout.

    **Confirmed on the iPad: the touch controls.** Phil's words were "buttons
    work well." That covers the four move buttons, Run away, the Fight prompt
    and Stalk, under real fingers in real Safari, after two rounds of fixes it
    took a device to find. The first was `setPointerCapture` throwing and
    killing the button for the rest of the session; the second was the four
    hidden move buttons still hit-testing on top of Stalk, which is why
    `setShown` now exists and is the only way HUD chrome is hidden. Both are
    written up in the iPad Safari rules and neither should be reintroduced.
    `HUD_EDGE_MARGIN_Y = 72` is part of that result and is not a free number.

    **Confirmed on the iPad: a solid 60fps**, with two skinned animated cats on
    screen at once on top of the beacon's transparent overdraw at dpr 2. That
    was the open question and it is answered. It is also the headroom reading
    that matters most for what comes next: the second cat cost five materials
    and about 12 draw calls and the device did not care, so the budget in this
    file is measured, not theoretical. A *third* cat is still not free -- share
    the materials rather than cloning a third set.

    **Confirmed on the iPad by ear: all four combat voices**, swipe, kick,
    impact and whiff, approved with no gain changed. The whiff reads correctly
    at 4.7x below the pounce despite the Q-4 bandpass passing only about 250Hz
    of the noise buffer, so **the combat gains are tuned and do not need
    revisiting**, the same standing as the rest of the mix.

    The one thing still open is not a verification gate: **the CPU has never
    been watched by Mila**, which is the only test of whether Ripplefoot should
    be smarter or dumber. That is a design question for after she plays it, and
    the knobs for it are the `RIVAL_*` constants.

## Commands

```bash
npm run dev -- --host    # serve on LAN
npm run typecheck

# http://localhost:5173/?debug=1   Chrome, iPad landscape emulation, touch on
# http://<desktop-ip>:5173         the iPad, clean build
```
