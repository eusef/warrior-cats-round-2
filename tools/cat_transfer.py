"""
Move the cat mesh onto the fox armature so it inherits all twelve clips.

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python tools/cat_transfer.py

Run from the repo root. Writes public/models/Cat_spike.glb.

This is MILESTONE 1, the spike. It answers one question and no others: does a
398-vertex cat mesh deform acceptably when driven by animations authored for the
fox's 1,071-vertex body? No materials, no eyes, no hand-weighting. If the answer
is no, everything downstream was going to be wasted.

Two things worth knowing before changing it.

The cat is scaled NON-UNIFORMLY to the fox's bounding box. The two animals are
not the same shape: the cat is 0.704 x 0.121 x 0.252 against the fox's
5.587 x 1.055 x 2.623, which is a length/height ratio of 2.79 against 2.13. The
cat is longer and lower. Squashing it to fit means the rig lands exactly where it
expects to, which is what isolates deformation quality as the variable under
test. Fixing the PROPORTIONS is Milestone 2 work and belongs in the armature, not
here: scaling the rest armature in edit mode changes what its baked location
channels mean, so it is not a thing to do casually inside a spike.

Nothing is hard-coded. Both bounding boxes are measured at runtime and the
transform is derived, so this still works if either file is replaced.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

FOX = "public/models/Fox.glb"
CAT_BLEND = "cat_rigged_animation_run.blend"
CAT_OBJECT = "mesh_cat"
OUT = "public/models/Cat_spike.glb"

# Never bound, never exported. See the content policy in CLAUDE.md.
FORBIDDEN_ACTIONS = {"Death"}


def log(*a):
    print("[transfer]", *a)


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def world_bbox(obj):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i])
            mx[i] = max(mx[i], w[i])
    return mn, mx


def size(mn, mx):
    return Vector((mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]))


def apply_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def main():
    if not os.path.exists(FOX):
        sys.exit(f"run from the repo root: {FOX} not found")

    wipe()

    # The fox's clips are authored at EXACTLY 30fps: Idle is 3.333s over 101
    # keys, Gallop 0.5667s over 18. Blender's scene defaults to 24, and the
    # importer lays keys onto whole frames, so at 24fps Gallop's 13.6 frames
    # round to 13 and the round trip silently DROPS the terminal frame -- the
    # duplicate of frame 0 that is the only reason the clip loops seamlessly.
    # Measured: without this line, Walk, Gallop, Gallop_Jump and Eating all came
    # back with an end pose that no longer matched their start.
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1.0

    # --- the fox: we want its armature and its twelve actions, not its body ---
    bpy.ops.import_scene.gltf(filepath=FOX)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    fox_mesh = bpy.data.objects["Fox"]
    fox_mn, fox_mx = world_bbox(fox_mesh)
    fox_size = size(fox_mn, fox_mx)
    log(f"fox mesh {fox_size.x:.3f} x {fox_size.y:.3f} x {fox_size.z:.3f}, feet z={fox_mn.z:.3f}")
    fox_actions = {a.name for a in bpy.data.actions}
    log(f"armature {arm.name}, {len(arm.data.bones)} bones, {len(fox_actions)} actions")

    # The importer parks IK-target helpers in a collection it excludes from
    # export. Harmless, but this script asserts on object counts, so drop it.
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.name != "Fox":
            log(f"removing importer helper: {o.name}")
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.data.objects.remove(fox_mesh, do_unlink=True)

    # --- the cat: mesh only. Its own 27-bone rig and single run cycle are not
    # wanted and are deliberately not appended. ---
    bpy.ops.wm.append(directory=f"{CAT_BLEND}/Object/", filename=CAT_OBJECT)
    cat = bpy.data.objects[CAT_OBJECT]

    for m in list(cat.modifiers):
        cat.modifiers.remove(m)
    cat.vertex_groups.clear()
    cat.parent = None

    quads = sum(1 for p in cat.data.polygons if len(p.vertices) == 4)
    tris = sum(1 for p in cat.data.polygons if len(p.vertices) == 3)
    log(f"cat mesh {len(cat.data.vertices)} verts, {quads} quads + {tris} tris "
        f"(= {quads * 2 + tris} triangles)")

    # --- orient: the cat faces +X, the fox faces -Y. Rotating -90deg about Z
    # sends +X to -Y. Verified against the rigs: the cat's `head` bone sits at
    # x=+0.18 and the fox's `Head` at y=-2.01. ---
    cat.rotation_euler = (0.0, 0.0, -math.pi / 2)

    # Apply the rotation BEFORE computing the scale. `object.scale` multiplies
    # LOCAL axes, which the rotation has just swapped, so world-axis factors
    # assigned to an unapplied rotation land on the wrong axes: the first pass
    # put the length factor on the width and produced a cat 5.85 long against
    # the fox's 5.59. Baking the rotation first makes local and world agree.
    apply_transform(cat)

    mn, mx = world_bbox(cat)
    cs = size(mn, mx)
    log(f"cat after rotate {cs.x:.3f} x {cs.y:.3f} x {cs.z:.3f}")

    scale = Vector((fox_size.x / cs.x, fox_size.y / cs.y, fox_size.z / cs.z))
    log(f"non-uniform scale {scale.x:.3f}, {scale.y:.3f}, {scale.z:.3f}")
    cat.scale = scale
    apply_transform(cat)

    # --- place: centre on the fox's box, and sit the feet where the fox's are ---
    mn, mx = world_bbox(cat)
    centre = (mn + mx) / 2
    fox_centre = (fox_mn + fox_mx) / 2
    cat.location = Vector((
        cat.location.x + (fox_centre.x - centre.x),
        cat.location.y + (fox_centre.y - centre.y),
        cat.location.z + (fox_mn.z - mn.z),
    ))
    # Freeze it, so the armature binds against real coordinates rather than an
    # object-level transform it would have to fight.
    apply_transform(cat)

    mn, mx = world_bbox(cat)
    fs = size(mn, mx)
    log(f"cat placed  {fs.x:.3f} x {fs.y:.3f} x {fs.z:.3f}, feet z={mn.z:.3f} "
        f"(fox {fox_size.x:.3f} x {fox_size.y:.3f} x {fox_size.z:.3f}, feet z={fox_mn.z:.3f})")

    # --- bind ---
    bpy.ops.object.select_all(action="DESELECT")
    cat.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    log(f"bound: {len(cat.vertex_groups)} vertex groups, "
        f"modifiers {[m.type for m in cat.modifiers]}")

    unweighted = sum(1 for v in cat.data.vertices if not v.groups)
    if unweighted:
        log(f"WARNING: {unweighted} vertices got no weight at all")
    else:
        log("every vertex carries at least one weight")

    # --- content policy: Death never leaves this script. And appending the cat
    # object drags its own `ArmatureAction` (the single run cycle) in with it,
    # which is not one of the fox's twelve and must not reach the GLB. Anything
    # that was not in the fox is dropped. ---
    for a in list(bpy.data.actions):
        if a.name in FORBIDDEN_ACTIONS:
            log(f"removed forbidden action: {a.name}")
            bpy.data.actions.remove(a)
        elif a.name not in fox_actions:
            log(f"removed stray action from the donor file: {a.name}")
            bpy.data.actions.remove(a)

    kept = sorted(a.name for a in bpy.data.actions)
    log(f"{len(kept)} actions to export: {', '.join(kept)}")

    # --- export ---
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_draco_mesh_compression_enable=False,
        export_apply=False,
        use_selection=False,
    )
    log(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")


main()
