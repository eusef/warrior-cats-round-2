# Cat model: builder prompt and integration spec

Replacing the fox stand-in with a real cat.

The builder is **CGTrader AI** (`cgtrader.com/ai`). It cannot receive files and
its prompt box takes at most 600 characters. So this document has two halves that
must not be confused:

- **Section 1 is the entire brief that leaves this machine**, plus the UI
  settings that go with it.
- **Sections 2 onward are our own integration work**, done locally in Blender and
  in this repo, against `public/models/Fox.glb`, which the builder never sees.

Every number below was measured off the shipping files or read off the builder's
own UI, not remembered.

---

## 1. The builder: prompt and settings

### 1.1 The settings matter more than the prompt

**Observed on the CGTrader AI form, 2026-07-28.** Polycount, texturing and
topology are **dropdowns and a slider, not things the prompt text can influence.**
Round 1 spent characters asking for "~1500 triangles", "NO textures, NO UVs" and
five named materials, and every one of those was overridden by the UI defaults.
Do not pay for them in prompt characters again.

| Control | Round 1 used | Use instead | Why |
|---|---|---|---|
| Use case | `Low Poly` | `Low Poly` | The only preset that is both low density and textured. `Shape only` drops textures but is explicitly "high density". |
| AI Engine | `Tripo3D` | `Tripo3D` | Produced a clean readable cat. No reason to change yet. |
| Smart low poly | on | on | |
| **Polycount** | **45000** | **~3000** | The single highest-value change. 45,000 with smart-low-poly on returned 10,713 faces, 4.3x our ceiling. |
| Polygon Type | (default) | `Quad` | Quad topology gives cleaner edge loops, which deform far better once it is skinned. GLB triangulates on export anyway. |
| **Material** | `PBR` | `Basic` or `Geometry only` | Both exist in Advanced settings. A baked PBR atlas is dead weight we delete in Blender. |

Materials named `Main` / `Main_Light` / `Eyes` / `Grey` / `Black` are **not
achievable from this tool at any prompt length.** They are assigned by us in
Blender during integration (Section 3, step 3).

Nothing in the form offers rigging or animation. Confirmed by absence, which
matches the plan: we rig to the fox armature ourselves.

### 1.2 The prompt (556 characters, paste verbatim)

Every character now buys **shape**, since shape is the only thing the text
controls. The three corrections over round 1 come from what actually came back:
the tail was stubby and hooked, the head was raised and turned, and the whiskers
arrived as thin protruding geometry.

```
Slim low-poly domestic cat, standing on all fours in a neutral symmetrical rest pose for rigging: all four legs straight and vertical, evenly spaced, body level, head facing straight forward and level with the spine, ears upright, mouth closed. Long tail, as long as the body, held straight out behind and roughly level, never curled, hooked or tucked. No whiskers, no collar, no base or ground plane. Simple faceted forms, chunky paws, pointed ears, defined muzzle. Friendly, appealing to a child. Must read as a cat as a plain untextured grey silhouette.
```

| Asked for | Because |
|---|---|
| Neutral symmetrical rest pose, legs vertical | It has to bind to our existing armature. Round 1 came back with the head raised and turned. |
| Long tail, level, never curled | Our rig has an eight-bone tail and the juice pass sways it, lifts it on a crouch and counter-swings it on turns. Round 1's tail was short and hooked, which makes all of that invisible. |
| No whiskers | Round 1 modelled them as thin protruding polygons. At 0.78 m on an iPad they are sub-pixel, they alias, and they complicate decimation. |
| No base or ground plane | Generators add display plinths. It would have to be deleted and it corrupts the feet-at-y=0 origin. |
| Reads as a plain untextured grey silhouette | Pelts run near-white to near-black with no texture. Silhouette does all the work. |

| Deliberately omitted | Because |
|---|---|
| Triangle count, textures, materials | UI settings, per 1.1. Prompt text cannot move them. |
| Exact dimensions | Scale is one constant, `CAT_SCALE`. Free to fix. |
| Bone names, clip names, rig spec | Cannot fit, and we are doing the rig. |
| Origin, axis, format | Cheap to correct in Blender. |

### 1.3 Round 1 result, for reference

`cgtrader.com/ai/3d-models/low-poly-cat-3d-model-for-kids-VuK4Y0tackY`

| Read off the page | |
|---|---|
| Faces / vertices | 10,713 / 5,361 |
| Engine | Tripo3D, smart low poly, polycount 45,000 |
| Material | PBR |
| Download | **Subscriber-only.** The GLB was never obtained, so nothing below is measured from the file. |

**Passed:** it reads clearly as a cat in the viewer's untextured clay mode, which
was the biggest risk and the thing the whole "must read in one solid colour" rule
exists for. Proportions are feline, legs are separated and bindable.

**Failed:** 4.3x the triangle ceiling; one PBR material where five flat ones are
needed; tail too short and hooked; head raised and turned rather than neutral;
whiskers as geometry.

Every one of those failures is now addressed by 1.1 or 1.2 except the material
split, which was never winnable here and belongs in Blender.

---

## 2. What the game requires of the finished `Cat.glb`

This is the contract our code already enforces. The builder is not being asked to
meet it; **we** meet it during integration. Target: `public/models/Cat.glb`.

### 2.1 File format

| Requirement | Value |
|---|---|
| Container | Single `.glb`, buffers embedded |
| Compression | **None.** No Draco, meshopt or KTX2 — no decoder is configured and a compressed file fails to parse. |
| Textures | **Zero.** No images in the file. |
| Up axis | +Y |
| Facing | **+Z** in the rest pose. `CAT_MODEL_YAW_OFFSET = Math.PI` corrects it; keep +Z and that constant stays right. |
| Skinning | One skin, one skeleton, **max 4 joint influences per vertex** |
| Node graph | One armature root, one skinned mesh, one primitive per material |

### 2.2 Size and origin

Measured off `Fox.glb` in the bind pose:

| | Model units | In-game metres (`CAT_SCALE = 0.14`) |
|---|---|---|
| Length (Z) | 5.600 | 0.784 |
| Height (Y) | 2.667 | 0.373 |
| Width (X) | 1.054 | 0.148 |
| Feet | y = -0.002 | ~0 |

Origin sits on the ground plane, centred between the paws: the game writes the
group position straight to the terrain height, so feet off y = 0 float or sink.
If the delivered mesh lands at a different scale, change **`CAT_SCALE` only** and
nothing else. 0.78 m is tuned by eye against the trees, not by feline biology.

### 2.3 Materials: exactly five, named exactly this

Found **by name** at [`PlayerCat.tsx:125`](../../src/actors/PlayerCat.tsx) and
[`RivalCat.tsx:121`](../../src/actors/RivalCat.tsx), with `===`. A rename fails
silently and yields a cat that cannot be recoloured.

| Material | Purpose | Recoloured at runtime? | Ships as |
|---|---|---|---|
| `Main` | The pelt: back, flanks, head, most of the tail | **Yes**, to the chosen pelt colour | any |
| `Main_Light` | Lighter markings: chest, belly, muzzle, paws, tail tip | **Yes**, to the pelt's light colour | any |
| `Eyes` | Eye geometry only | **Yes**, to the chosen eye colour | any |
| `Grey` | Fixed neutral detail: inner ear, paw pads, claws | No | `#585858` |
| `Black` | Fixed dark detail: nose leather, mouth line | No | `#2e2e2e` |

glTF PBR metallic-roughness, **`baseColorFactor` only**, `metalness = 0`,
`roughness = 0.5`. No normal, AO, emissive or alpha. Exactly five, no more:
materials are budgeted (22 for the whole game, and the two cats already spend 10
of it) and each is a draw call per cat.

Pelts run from `#ece5d6` to `#3b3b45` with no textures, so the cat is four or
five flat colours at any moment. **Model the ears, muzzle, tail and paws so it
reads as a cat in solid white and again in solid black.**

### 2.4 Geometry budget

| | Fox (current) | Cat (target) |
|---|---|---|
| Triangles | 1,848 | **1,200–2,000. Hard ceiling 2,500.** |
| Draw calls per cat | 5 | 5 |

Two cats on screen during a duel, iPad, dpr 2, 60fps, with transparent overdraw
already in the scene. The framerate ceiling is not negotiable.

### 2.5 Bone names the code reaches for directly

The juice pass adds tail sway and ear flicks **on top of** the baked clips every
frame, finding these by name at
[`useCatJuice.ts:45`](../../src/actors/useCatJuice.ts), and doing nothing at all
if they are missing:

| Chain | Required names |
|---|---|
| Tail | `Tail1`–`Tail8`, base to tip |
| Left ear | `Ear1.L`, `Ear2.L` (`Ear1L` / `Ear1_L` also resolve) |
| Right ear | `Ear1.R`, `Ear2.R` |

**Axis convention, load-bearing:** every fox bone sits at `(0, L, 0)` in its
parent, so each extends along its own **local +Y**, which makes **local Z the
side-to-side swing** and **local X the up/down bend**. That is the entire basis
of the sway maths. Reusing the fox armature satisfies this for free.

### 2.6 Content policy: non-negotiable

The player is one 10-year-old. If it would not fit in a Bluey episode, it does
not go in.

- **No `Death` clip.** Not authored, not exported, not "just in case".
- No blood, wounds or gore. Injury is a number on a health bar and nothing else.
- `Attack` is a paw swipe; the hit reacts are flinches. A duel ends with the
  loser yielding and running. No kill poses, no snarl held as a rest pose.
- The cat reads as appealing and friendly. She is going to name it and keep it.

---

## 3. Integration plan (our work, in Blender and this repo)

The animation set is the expensive part of this asset and **it already exists**.
`public/models/Fox.glb` carries a 51-bone rig with twelve authored clips, tuned,
verified in Chrome and confirmed at 60fps on the iPad. We are not re-authoring
that. We are moving a new mesh onto it.

1. Open `public/models/Fox.glb` in Blender. Keep `AnimalArmature` and every
   action; delete the fox mesh.
2. Import the delivered cat mesh. Scale and align it to the fox's rest pose
   (Section 4 has the landmark positions).
3. If it arrived with a texture and one material: split it into the five regions
   of 2.3 and assign flat `baseColorFactor` materials with the exact names.
   Delete the image and the UVs.
4. Decimate to budget if needed.
5. Weight it to the armature. Automatic weights, then fix the ears, tail and paws
   by hand.
6. Export GLB, no compression, and drop it at `public/models/Cat.glb`.
7. Point `MODEL_URL` in `PlayerCat.tsx` and `RivalCat.tsx` at the new file.
8. Run the checks in Section 5, then Chrome, then the iPad.

`cat_rigged.fbx` in the repo root is a 794-triangle cat mesh already on hand. Its
mesh is a possible fallback donor for step 2. **Its rig and its single animation
are not usable** and would be discarded at step 1: the bone names match nothing
and one gait cycle cannot drive a game that needs ten.

### 3.1 The ten clips the game binds

Resolved by exact name first, then by the suffix after a `|`. Inherited free from
the fox armature; listed so a future retarget has the contract.

| Clip | Duration | Driven by |
|---|---|---|
| `Idle` | 3.33s | standing still |
| `Walk` | 1.07s | walk band, authored for **2.2 m/s** |
| `Gallop` | 0.57s | run band, authored for **7.5 m/s** |
| `Idle_2` | 3.33s | resting at camp; the purr plays over it |
| `Idle_2_HeadLow` | 4.00s | crouch / stalk, blended with 45% `Walk` underneath |
| `Gallop_Jump` | 0.93s | pounce **and** the duel jump-kick, one clip, two uses |
| `Eating` | 2.53s | the 1.1s eat beat; the camera cuts away |
| `Attack` | 1.33s | duel swipe |
| `Idle_HitReact1` | 0.67s | taking a hit |
| `Idle_HitReact2` | 0.67s | stagger after an interrupted wind-up |

`Death` exists in the fox pack and is **never bound and never will be**.
`Jump_ToIdle` is unused and harmless.

**Every clip must loop seamlessly, including the one-shots.**
[`useCatAnimation.ts`](../../src/actors/useCatAnimation.ts) `.play()`s all ten at
mount and only ever changes weights; it never resets an action's time and never
uses `LoopOnce`. Three's mixer advances time before it checks weight, so `Attack`,
`Eating`, `Gallop_Jump` and both hit reacts run on a loop at weight 0 the whole
session and fade in wherever they happen to be. A clip whose end pose differs
from its start pose pops forever, on a timer.

**No root motion.** Position is driven kinematically and nothing is read back.
Measured on the fox: `Walk` drifts 0.000 units, `Gallop` 0.041. Footfall rate is
corrected at runtime against ground speed, clamped 0.55x–1.7x, which is polish on
a correctly-authored cycle rather than a rescue for a wrong one.

---

## 4. The fox armature (our rig reference)

51 bones, root `AnimalArmature`, offsets in model units, parent-relative. The
authoritative copy is `public/models/Fox.glb`. Read it; do not retype this.

| # | Bone | Parent | Rest offset (x, y, z) |
|---|---|---|---|
| 0 | `Body` | `AnimalArmature` | 0, 0.472, 0.001 |
| 1 | `Back` | `Body` | 0, 1.512, -0.639 |
| 2 | `Torso` | `Back` | 0, 0.521, 0 |
| 3 | `Torso2` | `Torso` | 0, 0.390, 0 |
| 4 | `Torso3` | `Torso2` | 0, 0.585, 0 |
| 5 | `Neck1` | `Torso3` | 0, 0.295, 0 |
| 6 | `Neck2` | `Neck1` | 0, 0.266, 0 |
| 7 | `Neck3` | `Neck2` | 0, 0.182, 0 |
| 8 | `Head` | `Neck3` | 0, 0.465, 0 |
| 9 | `Ear1L` | `Neck3` | -0.169, 0.465, 0.112 |
| 10 | `Ear2L` | `Ear1L` | 0, 0.156, 0 |
| 11 | `Ear3L` | `Ear2L` | 0, 0.117, 0 |
| 12 | `Ear4L` | `Ear3L` | 0, 0.129, 0 |
| 13 | `Ear1R` | `Neck3` | 0.169, 0.465, 0.112 |
| 14 | `Ear2R` | `Ear1R` | 0, 0.156, 0 |
| 15 | `Ear3R` | `Ear2R` | 0, 0.117, 0 |
| 16 | `Ear4R` | `Ear3R` | 0, 0.129, 0 |
| 17 | `FrontShoulderL` | `Torso2` | -0.223, 0.707, -0.372 |
| 18 | `FrontUpperLegL` | `FrontShoulderL` | 0, 0.105, 0 |
| 19 | `FrontLowerLegL` | `FrontUpperLegL` | 0, 0.353, 0 |
| 20 | `FrontShoulderR` | `Torso2` | 0.223, 0.707, -0.372 |
| 21 | `FrontUpperLegR` | `FrontShoulderR` | 0, 0.105, 0 |
| 22 | `FrontLowerLegR` | `FrontUpperLegR` | 0, 0.353, 0 |
| 23 | `BackShoulderL` | `Back` | 0.214, 0.075, 0.226 |
| 24 | `BackLegL` | `BackShoulderL` | 0, 0.128, 0 |
| 25 | `BackUpperLegL` | `BackLegL` | 0, 0.491, 0 |
| 26 | `BackLowerLegL` | `BackUpperLegL` | 0, 1.018, 0 |
| 27 | `BackShoulderR` | `Back` | -0.214, 0.075, 0.226 |
| 28 | `BackLegR` | `BackShoulderR` | 0, 0.128, 0 |
| 29 | `BackUpperLegR` | `BackLegR` | 0, 0.491, 0 |
| 30 | `BackLowerLegR` | `BackUpperLegR` | 0, 1.018, 0 |
| 31 | `Tail1` | `Back` | 0, -0.235, 0.084 |
| 32 | `Tail2` | `Tail1` | 0, 0.197, 0 |
| 33 | `Tail3` | `Tail2` | 0, 0.269, 0 |
| 34 | `Tail4` | `Tail3` | 0, 0.345, 0 |
| 35 | `Tail5` | `Tail4` | 0, 0.440, 0 |
| 36 | `Tail6` | `Tail5` | 0, 0.447, 0 |
| 37 | `Tail7` | `Tail6` | 0, 0.205, 0 |
| 38 | `Tail8` | `Tail7` | 0, 0.190, 0 |
| 39 | `PoleTargetBackL` | `Body` | 0.217, 0.347, 3.658 |
| 40 | `PoleTargetL` | `Body` | 0.217, 0.349, 3.370 |
| 41 | `PoleTargetBackR` | `Body` | -0.217, 0.347, 3.658 |
| 42 | `PoleTargetR` | `Body` | -0.217, 0.349, 3.370 |
| 43 | `IKBackLegL` | `AnimalArmature` | 0.341, 0.204, -1.024 |
| 44 | `FFBL` | `IKBackLegL` | 0, 0.197, 0 |
| 45 | `IKFrontLegL` | `AnimalArmature` | 0.327, 0.216, 1.048 |
| 46 | `FFL` | `IKFrontLegL` | 0, 0.188, 0 |
| 47 | `IKBackLegR` | `AnimalArmature` | -0.341, 0.204, -1.024 |
| 48 | `FFBR` | `IKBackLegR` | 0, 0.197, 0 |
| 49 | `IKFrontLegR` | `AnimalArmature` | -0.327, 0.216, 1.048 |
| 50 | `FFR` | `IKFrontLegR` | 0, 0.188, 0 |

Bones 39–50 are IK and pole targets. They carry no skin weight and exist because
the clips were authored against them. **Keep them**; dropping them breaks the
exported animation tracks.

### 4.1 Bind-pose landmarks, for aligning the delivered mesh

World positions in model units. +Z forward, +Y up.

| Landmark | Position | Reads as |
|---|---|---|
| `Head` | 0.00, 2.12, 2.01 | head level, forward of the shoulders |
| `Ear4L` (tip) | 0.39, 2.53, 2.13 | ears up |
| `FrontShoulderL` | 0.22, 1.44, 0.94 | |
| `FrontLowerLegL` | 0.33, 1.11, 0.88 | front legs near-vertical |
| `BackShoulderL` | 0.21, 1.75, -0.61 | |
| `BackLowerLegL` | 0.35, 0.82, -1.24 | hind legs angled back |
| `Tail1` | 0.00, 1.95, -0.88 | tail base at the hips |
| `Tail8` (tip) | 0.00, 1.25, -2.68 | tail trails back and droops |

Overall box: min `-0.53, 0.00, -2.90`, max `0.53, 2.66, 2.70`.

---

## 5. Acceptance checks on the finished `Cat.glb`

Mechanical, run before the model is accepted. Nothing here is a matter of taste.

1. Loads with `GLTFLoader`, **zero warnings**, no decoder configured.
2. Exactly **5 materials** named `Main`, `Main_Light`, `Grey`, `Black`, `Eyes`,
   all `MeshStandardMaterial`, all `map === null`.
3. **0 textures, 0 images.**
4. Triangles **≤ 2,500**.
5. Exactly **5 primitives** → 5 draw calls per cat.
6. **1 skin, 1 skeleton.** Two cats are instanced via `SkeletonUtils.clone`,
   which needs a clean single-skin graph.
7. All **10 clip names** resolve. `Death` **absent**.
8. Every clip loops: sampled pose at `t = duration` matches `t = 0`.
9. Root translation per clip < 0.05 model units on X and Z.
10. Bind-pose box: feet at y ≈ 0, facing +Z, dimensions per 2.2.
11. `Tail1`–`Tail8`, `Ear1.L`, `Ear2.L`, `Ear1.R`, `Ear2.R` all resolve, each at
    `(0, L, 0)` in its parent.
12. Max 4 joint influences per vertex.
13. Renders in Chrome at 1180x820, dpr 2, **zero console errors**, and reads as a
    cat in solid `#ece5d6` and again in solid `#3b3b45`.

Final gate is the iPad: real Safari, real touch, a solid 60fps with two cats in a
duel. Checked on the device, never in Chrome.
