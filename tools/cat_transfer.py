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
OUT = "public/models/Cat.glb"

# Exact names, matched with `===` in PlayerCat.tsx and RivalCat.tsx, in a fixed
# order so the exported primitive order is stable between runs. Main,
# Main_Light and Eyes are repainted at runtime by character creation; Grey and
# Black keep whatever they ship with. The ship colours here are the fox's, so a
# cat that has never been through creation still looks deliberate.
MATERIALS = [
    ("Main", (0.71, 0.45, 0.26, 1.0)),
    ("Main_Light", (0.64, 0.65, 0.61, 1.0)),
    ("Grey", (0.35, 0.35, 0.35, 1.0)),
    ("Black", (0.18, 0.18, 0.18, 1.0)),
    ("Eyes", (0.50, 0.83, 0.36, 1.0)),
]
MAT_INDEX = {name: i for i, (name, _) in enumerate(MATERIALS)}

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


def assign_materials(cat):
    """
    Paint the five material slots onto the EXISTING polygons.

    The donor mesh is one continuous shell of 482 polygons with no separate eye,
    nose or inner-ear geometry: those were meant to come from a texture, which is
    why it ships with full 0..1 UVs and a reference photo. Rather than model new
    parts, this picks the polygons nearest an anatomical anchor and reassigns
    them. That costs zero triangles and, unlike added geometry, cannot float off
    the surface or poke through it.

    Anchors are derived from the mesh's own bounding box each run rather than
    hard-coded, so this survives the donor being replaced. The cat faces -Y after
    the transform, matching the fox, so the nose is at minimum Y.

    The regions are a first pass and are meant to be retuned by eye. Every
    fraction below is a number to turn, and turning them is cheaper than
    re-modelling.
    """
    me = cat.data
    me.materials.clear()

    # Purge the fox's materials first. They are orphaned by now (its mesh was
    # deleted) but still sitting in bpy.data under the exact five names we are
    # about to use, so Blender would dedupe ours to "Main.001" and friends. That
    # fails the `m.name === 'Main'` test in PlayerCat.tsx SILENTLY: the cat loads,
    # renders, animates, and simply cannot be recoloured. Caught by the checker,
    # not by looking at it, which is the whole argument for the checker.
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

    for name, rgba in MATERIALS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.diffuse_color = rgba
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Roughness"].default_value = 0.5
            bsdf.inputs["Metallic"].default_value = 0.0
        me.materials.append(m)

    verts = [v.co for v in me.vertices]
    mn = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    mx = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    dim = mx - mn

    # The head: the front 16% of the body along -Y, which is nose to just behind
    # the ears. Everything below is placed inside that sub-box.
    head_cut = mn.y + 0.16 * dim.y
    hv = [v for v in verts if v.y <= head_cut]
    hmn = Vector((min(v.x for v in hv), min(v.y for v in hv), min(v.z for v in hv)))
    hmx = Vector((max(v.x for v in hv), max(v.y for v in hv), max(v.z for v in hv)))
    hd = hmx - hmn
    log(f"head box {hd.x:.3f} x {hd.y:.3f} x {hd.z:.3f} from {len(hv)} verts")

    for p in me.polygons:
        p.material_index = MAT_INDEX["Main"]

    # Main_Light: the belly, chest, chin, lower legs and paws.
    #
    # NOT a normal test. The first pass used `normal.z < -0.4`, which is every
    # downward-facing face -- and that includes the fold at every shoulder, hip
    # and elbow. Those folds are visible side-on, so the cat came out covered in
    # cream blotches instead of having a belly. Height is the honest test for
    # "underside", with a normal test allowed only low on the body where a
    # downward face really is the belly rather than a crease.
    low = mn.z + 0.32 * dim.z
    belly = mn.z + 0.60 * dim.z
    for p in me.polygons:
        if p.center.z < low or (p.normal.z < -0.55 and p.center.z < belly):
            p.material_index = MAT_INDEX["Main_Light"]

    add_features(me, hmn, hmx, hd)


def add_features(me, hmn, hmx, hd):
    """
    Add eye, nose and inner-ear geometry as small quads laid onto the surface.

    This mesh is 482 polygons over an entire cat, so every facet is LARGE.
    Reassigning existing polygons -- which is what this did first -- cannot
    produce a small feature: one polygon at the eye is already a green block the
    size of a cheek, and three at the ear is a wedge over half the head. There is
    no fraction that makes a facet smaller than a facet.

    So the features get their own geometry, sized independently of the body's
    topology, which is exactly what the fox does: its Eyes primitive is 8
    triangles. Six quads is 12 triangles on top of 794, nowhere near the ceiling.

    Each quad is placed by finding the nearest existing polygon to an anatomical
    anchor and borrowing its centre and normal, then floating fractionally proud
    of it. That way a patch always lies flat on the surface it decorates,
    whatever shape the donor mesh is.
    """
    import bmesh

    # (material, anchor point, half-size, preferred outward normal)
    #
    # The preferred normal is NOT optional decoration. Picking the nearest
    # polygon by distance alone put an eye flat on TOP of the skull, because the
    # closest facet to a point beside the head happened to be the one facing up,
    # and the quad lay down on it like a leaf. A feature has to land on a surface
    # that faces the way the feature faces: an eye outward and forward, a nose
    # forward, an inner ear outward and up.
    anchors = [
        ("Black", Vector((0.0, hmn.y + 0.03 * hd.y, hmn.z + 0.48 * hd.z)),
         0.055 * hd.x, Vector((0.0, -1.0, 0.0))),
        ("Eyes", Vector((+0.36 * hd.x, hmn.y + 0.26 * hd.y, hmn.z + 0.58 * hd.z)),
         0.070 * hd.x, Vector((0.88, -0.45, 0.10))),
        ("Eyes", Vector((-0.36 * hd.x, hmn.y + 0.26 * hd.y, hmn.z + 0.58 * hd.z)),
         0.070 * hd.x, Vector((-0.88, -0.45, 0.10))),
        ("Grey", Vector((+0.30 * hd.x, hmx.y - 0.22 * hd.y, hmx.z - 0.18 * hd.z)),
         0.065 * hd.x, Vector((0.60, -0.10, 0.79))),
        ("Grey", Vector((-0.30 * hd.x, hmx.y - 0.22 * hd.y, hmx.z - 0.18 * hd.z)),
         0.065 * hd.x, Vector((-0.60, -0.10, 0.79))),
    ]

    surfaces = [(p.center.copy(), p.normal.copy()) for p in me.polygons]

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()

    for name, anchor, half, prefer in anchors:
        pref = prefer.normalized()
        # Distance, penalised by how far the facet's normal is from the one this
        # feature wants. A facet pointing the wrong way has to be much closer to
        # win, which is what keeps the eye off the top of the head.
        centre, normal = min(
            surfaces,
            key=lambda s: (s[0] - anchor).length * (2.0 - s[1].normalized().dot(pref)),
        )
        n = normal.normalized()
        # Any two vectors perpendicular to n and to each other.
        t = Vector((0.0, 0.0, 1.0)).cross(n)
        if t.length < 1e-4:
            t = Vector((1.0, 0.0, 0.0)).cross(n)
        t.normalize()
        b = n.cross(t).normalized()
        # Float it clear of the surface it sits on, or it z-fights.
        c = centre + n * (half * 0.30)
        vs = [bm.verts.new(c + t * half * sx + b * half * sy)
              for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = bm.faces.new(vs)
        f.material_index = MAT_INDEX[name]

    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    log(f"added {len(anchors)} feature quads (eyes, nose, inner ears)")

    counts = {name: 0 for name, _ in MATERIALS}
    for p in me.polygons:
        counts[MATERIALS[p.material_index][0]] += 1
    log("polygons per material: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    empty = [k for k, v in counts.items() if v == 0]
    if empty:
        log(f"WARNING: no polygons assigned to {empty}; the GLB will be short a primitive")


def repair_weights(cat):
    """
    Give every unweighted vertex the weights of its nearest weighted neighbour.

    Automatic weights uses bone heat, which needs a vertex to sit inside the
    volume the bones radiate through. The feature quads float fractionally proud
    of the surface and 12 of their 20 vertices landed outside it, so they came
    back with no weights at all. An unweighted vertex does not follow the
    skeleton: the eyes and nose would hang in the air while the cat walked out
    from under them. Nearest-neighbour is exactly right here, because a patch
    lying on the cheek should move with whatever the cheek moves with.
    """
    me = cat.data
    weighted = [v for v in me.vertices if v.groups]
    orphans = [v for v in me.vertices if not v.groups]
    if not orphans:
        log("every vertex carries at least one weight")
        return
    for v in orphans:
        src = min(weighted, key=lambda w: (w.co - v.co).length)
        for g in src.groups:
            cat.vertex_groups[g.group].add([v.index], g.weight, "REPLACE")
    still = sum(1 for v in me.vertices if not v.groups)
    log(f"repaired {len(orphans)} unweighted vertices from nearest neighbours "
        f"({still} still unweighted)")


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

    # Materials and the feature quads go on BEFORE the bind. Automatic weights
    # only weights what exists when it runs, so geometry added afterwards would
    # be left unparented and would hang in the air while the cat walked out from
    # under it. The unweighted-vertex count below is what would catch that.
    assign_materials(cat)

    # --- bind ---
    bpy.ops.object.select_all(action="DESELECT")
    cat.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    log(f"bound: {len(cat.vertex_groups)} vertex groups, "
        f"modifiers {[m.type for m in cat.modifiers]}")

    repair_weights(cat)

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
