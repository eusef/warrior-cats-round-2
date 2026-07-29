# Model provenance

## Cat.glb

**The cat.** Both the player and the rival. Recoloured per character via the same
five material slots the fox used, so nothing downstream changed.

Not a downloaded asset: it is **built** by `tools/cat_transfer.py`, which welds a
donor cat mesh onto the fox's armature so it inherits all of the fox's animation.
Re-runnable from the repo root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/cat_transfer.py
node tools/check-cat-glb.mjs public/models/Cat.glb
```

| | |
|---|---|
| Mesh | `mesh_cat` from `cat_rigged_animation_run.blend` in the repo root |
| Rig and animation | `Fox.glb`, unchanged. Same 51 bones, same clips. |
| Built with | Blender 5.2.0 LTS |

### Donor mesh origin

**UNRECORDED, and it needs filling in.** What is verifiable from the files
themselves: a Blender 2.80 `.blend` plus an FBX export of it, both stamped
**2019-10-30**, delivered in a folder named `source-48-cat_rigged`. Author,
source site and licence are all unknown. This is personal household use only and
nothing is published, so it is not urgent, but every other model here records
where it came from and this one should too.

Its own 27-bone rig and its single 1.5s run cycle are **discarded** by the
transfer. Only the mesh is used.

### Contents

- **804 triangles** (794 from the donor, 10 added as feature geometry)
- 51 joints, 1 skin
- 5 primitives / 5 materials: `Main`, `Main_Light`, `Grey`, `Black`, `Eyes`
- 0 textures, 0 images. Flat `baseColorFactor` only, the per-cat recolour hook.
- **5 draw calls per cat**, same as the fox, against the 100 budget.

### Animation clips

Inherited wholesale from `Fox.glb`, so the table below is the fox's. Two
differences, both deliberate: **`Death` is deleted by the transfer script** and
never reaches the file, and the donor's own `ArmatureAction` is dropped too.

## Fox.glb

Superseded by `Cat.glb` as the in-game model, and **kept because it is the source
of the rig and all twelve clips.** `tools/cat_transfer.py` reads it every run.
Do not delete it.

| | |
|---|---|
| Pack | Quaternius, *Ultimate Animated Animal Pack* (July 2021) |
| Source | <https://quaternius.com/packs/ultimateanimatedanimals.html> -> official Google Drive -> `glTF/Fox.gltf` |
| License | CC0, stated on the pack page ("free to use in personal and commercial projects") |
| Exporter | `Khronos glTF Blender I/O v1.6.16` (Quaternius's own Blender export) |
| Downloaded | 2026-07-26 |

Obtained from the official quaternius.com download flow, not a third-party mirror.

### Local conversion

The official download is `Fox.gltf`: plain JSON with the buffer inline as a
base64 data URI, 3,163,174 bytes. Base64 inflates the payload by a third and
CLAUDE.md requires `.glb`, so it was repacked into a binary GLB container
locally. Nothing about the mesh, skin, or animation data was touched, only the
container: the data URI was decoded into a BIN chunk and `buffers[0].uri`
removed.

Result: `Fox.glb`, 1,909,976 bytes. Buffer byteLength is identical before and
after (1,480,684).

### Contents

- 1,848 triangles
- 51 joints, 1 skin
- 5 primitives / 5 materials: `Main`, `Main_Light`, `Grey`, `Black`, `Eyes`
- 0 textures, 0 images. Flat `baseColorFactor` only, which is the per-cat
  recolour hook.
- **5 draw calls per cat** against the 100 budget.

### Animation clips

Read at runtime and logged; never guessed. See `src/actors/useCatAnimation.ts`.

| Clip | Bound to |
|---|---|
| `Idle` | standing |
| `Walk` | walk band |
| `Gallop` | run band |
| `Idle_2` | resting at camp |
| `Idle_2_HeadLow` | crouch / stalk |
| `Gallop_Jump` | pounce |
| `Eating` | eat beat |
| `Jump_ToIdle` | unused |
| `Idle_HitReact1`, `Idle_HitReact2` | unused |
| `Attack`, `Death` | **never bound.** Excluded by the content policy in CLAUDE.md. |

## Mice

There is no prey-scale animal in the pack. The mouse is procedural: four merged
primitives drawn as a single `InstancedMesh` for all of them, one draw call.
See `src/actors/Prey.tsx`.

## Foliage

Also procedural and instanced. See `src/world/Foliage.tsx`.
