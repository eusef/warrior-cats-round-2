# Model provenance

## Fox.glb

The stand-in cat. Recoloured per character via the five material slots.

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
