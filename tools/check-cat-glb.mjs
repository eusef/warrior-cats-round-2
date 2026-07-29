/**
 * Acceptance checks for a cat model, per docs/specs/cat-model.md section 5.
 *
 *   node tools/check-cat-glb.mjs public/models/Cat.glb
 *
 * Everything here is mechanical. Nothing in it is a matter of taste, and none of
 * it replaces the Chrome pass or the iPad pass. Run it against Fox.glb to see
 * what a passing model looks like: the fox is the working reference and clears
 * every check except the triangle target, which it defines.
 */
import fs from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const MATERIALS = ['Main', 'Main_Light', 'Grey', 'Black', 'Eyes']
const CLIPS = [
  'Idle', 'Walk', 'Gallop', 'Idle_2', 'Idle_2_HeadLow',
  'Gallop_Jump', 'Eating', 'Attack', 'Idle_HitReact1', 'Idle_HitReact2',
]
const JUICE_BONES = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7', 'Tail8',
  'Ear1.L', 'Ear2.L', 'Ear1.R', 'Ear2.R']
const TRI_CEILING = 2500

const results = []
const ok = (name, detail) => results.push({ pass: true, name, detail })
const bad = (name, detail) => results.push({ pass: false, name, detail })

/** Same resolution rule as useCatAnimation: exact name, then the suffix after a '|'. */
function resolveClip(clips, wanted) {
  return (
    clips.find((c) => c.name === wanted) ??
    clips.find((c) => {
      const bar = c.name.lastIndexOf('|')
      return bar >= 0 && c.name.slice(bar + 1) === wanted
    }) ??
    null
  )
}

/** Same fallback chain as useCatJuice's findBone, for PropertyBinding sanitisation. */
function findBone(root, name) {
  return (
    root.getObjectByName(name) ??
    root.getObjectByName(name.replace(/[.\s]/g, '')) ??
    root.getObjectByName(name.replace(/[.\s]/g, '_'))
  )
}

const file = process.argv[2]
if (!file) {
  console.error('usage: node tools/check-cat-glb.mjs <model.glb>')
  process.exit(2)
}

const buf = fs.readFileSync(file)
const warnings = []
const origWarn = console.warn
console.warn = (...a) => warnings.push(a.join(' '))

new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  '',
  (gltf) => {
    console.warn = origWarn
    run(gltf)
  },
  (err) => {
    console.warn = origWarn
    console.error('FAILED TO PARSE:', err)
    process.exit(1)
  },
)

function run(gltf) {
  const scene = gltf.scene
  const clips = gltf.animations

  // 1. clean parse
  warnings.length === 0
    ? ok('1 parse', 'zero loader warnings')
    : bad('1 parse', `${warnings.length} warning(s): ${warnings[0]}`)

  // gather
  let tris = 0
  const prims = []
  const mats = new Map()
  const skins = []
  let textures = 0
  scene.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3
    prims.push(o)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      mats.set(m.uuid, m)
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (m[k]) textures++
      }
    }
    if (o.isSkinnedMesh) skins.push(o)
  })

  // 2. materials by name
  const names = [...mats.values()].map((m) => m.name).sort()
  const wantSorted = [...MATERIALS].sort()
  if (names.length === MATERIALS.length && names.every((n, i) => n === wantSorted[i])) {
    ok('2 materials', names.join(', '))
  } else {
    bad('2 materials', `got [${names.join(', ')}], want [${wantSorted.join(', ')}]`)
  }

  // 3. textures
  textures === 0 ? ok('3 textures', 'none') : bad('3 textures', `${textures} texture slot(s) bound`)

  // 4. triangles
  tris <= TRI_CEILING
    ? ok('4 triangles', `${tris} <= ${TRI_CEILING}`)
    : bad('4 triangles', `${tris} > ${TRI_CEILING}`)

  // 5. primitives / draw calls
  prims.length === 5
    ? ok('5 primitives', '5 (= 5 draw calls per cat)')
    : bad('5 primitives', `${prims.length}, want 5`)

  // 6. single skin
  const skeletons = new Set(skins.map((s) => s.skeleton))
  skins.length >= 1 && skeletons.size === 1
    ? ok('6 skin', `${skins.length} skinned mesh(es), 1 shared skeleton, ${[...skeletons][0].bones.length} bones`)
    : bad('6 skin', `${skins.length} skinned mesh(es), ${skeletons.size} skeleton(s); want exactly 1 skeleton`)

  // 7. clips resolve, Death absent
  const missing = CLIPS.filter((c) => !resolveClip(clips, c))
  const death = resolveClip(clips, 'Death')
  if (missing.length) bad('7 clips', `unresolved: ${missing.join(', ')}`)
  else if (death) bad('7 clips', 'a Death clip is present; the content policy forbids it')
  else ok('7 clips', `all ${CLIPS.length} bound, no Death`)

  // 8. seamless loops
  const popped = []
  for (const want of CLIPS) {
    const clip = resolveClip(clips, want)
    if (!clip) continue
    let worst = 0
    for (const t of clip.tracks) {
      const s = t.getValueSize()
      const n = t.times.length
      if (n < 2) continue
      for (let i = 0; i < s; i++) {
        worst = Math.max(worst, Math.abs(t.values[i] - t.values[(n - 1) * s + i]))
      }
    }
    if (worst > 0.02) popped.push(`${want} (${worst.toFixed(3)})`)
  }
  popped.length === 0
    ? ok('8 loops', 'every clip returns to its first pose')
    : bad('8 loops', `end pose differs from start: ${popped.join(', ')}`)

  // 9. no root motion in the LOCOMOTION clips.
  //
  // Only Walk and Gallop are held to this. They are the two clips whose playback
  // rate is scaled against real ground speed, so drift there makes the cat
  // outrun its own feet. The one-shots are allowed to travel: measured on the
  // shipping fox, Attack drifts 0.575 and Eating 0.373 model units, which is
  // 0.08m and 0.05m at CAT_SCALE, and the game has shipped that way since v1.
  // An earlier version of this check enforced 0.05 everywhere and failed the
  // working reference model, which is how the real rule got found.
  const LOCOMOTION = ['Walk', 'Gallop']
  const drifted = []
  const travelled = []
  for (const want of CLIPS) {
    const clip = resolveClip(clips, want)
    if (!clip) continue
    for (const t of clip.tracks) {
      if (!/(Body|Hips|Root|Armature)\.position$/.test(t.name)) continue
      const n = t.times.length
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity
      for (let i = 0; i < n; i++) {
        mnx = Math.min(mnx, t.values[i * 3]); mxx = Math.max(mxx, t.values[i * 3])
        mnz = Math.min(mnz, t.values[i * 3 + 2]); mxz = Math.max(mxz, t.values[i * 3 + 2])
      }
      const dx = mxx - mnx, dz = mxz - mnz
      if (dx > 0.05 || dz > 0.05) {
        const entry = `${want} x${dx.toFixed(3)} z${dz.toFixed(3)}`
        if (LOCOMOTION.includes(want)) drifted.push(entry)
        else travelled.push(entry)
      }
    }
  }
  drifted.length === 0
    ? ok('9 root motion', `Walk and Gallop stay put` +
        (travelled.length ? `; one-shots travel (allowed): ${travelled.join(', ')}` : ''))
    : bad('9 root motion', `locomotion clip drifts: ${drifted.join(', ')}`)

  // 10. bind pose box
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = new THREE.Vector3()
  box.getSize(size)
  const feetOk = Math.abs(box.min.y) < 0.05
  const longestIsZ = size.z > size.x && size.z > size.y
  feetOk && longestIsZ
    ? ok('10 bind box', `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}, feet y=${box.min.y.toFixed(3)}`)
    : bad('10 bind box', `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}, feet y=${box.min.y.toFixed(3)}` +
        `${feetOk ? '' : ' (feet not at y=0)'}${longestIsZ ? '' : ' (length is not on Z: is it facing +Z?)'}`)

  // 11. juice bones
  const noBone = JUICE_BONES.filter((b) => !findBone(scene, b))
  const offAxis = []
  for (const n of JUICE_BONES) {
    const b = findBone(scene, n)
    if (!b || /1[.\s_]?[LR]?$/.test(n) === false) continue
  }
  for (const n of JUICE_BONES) {
    const b = findBone(scene, n)
    if (!b) continue
    // Every bone must extend along its own local +Y: x and z offsets ~0.
    if (Math.abs(b.position.x) > 1e-3 || Math.abs(b.position.z) > 1e-3) {
      // Chain roots legitimately sit off-axis in their parent; only mid-chain matters.
      if (!/1(\.|_)?[LR]?$/.test(n)) offAxis.push(`${n} (${b.position.x.toFixed(3)}, ${b.position.z.toFixed(3)})`)
    }
  }
  if (noBone.length) bad('11 juice bones', `missing: ${noBone.join(', ')}`)
  else if (offAxis.length) bad('11 juice bones', `not on local +Y: ${offAxis.join(', ')}`)
  else ok('11 juice bones', 'tail chain and both ears bind, all on local +Y')

  // 12. max 4 influences
  let over = 0
  for (const s of skins) {
    const w = s.geometry.attributes.skinWeight
    if (!w) continue
    if (w.itemSize > 4) over++
    if (s.geometry.attributes.skinWeight1) over++
  }
  over === 0
    ? ok('12 influences', 'max 4 per vertex')
    : bad('12 influences', 'more than 4 joint influences present')

  // report
  console.log(`\n${file}\n`)
  let fails = 0
  for (const r of results) {
    if (!r.pass) fails++
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} ${r.detail}`)
  }
  console.log(`\n  ${results.length - fails}/${results.length} passed` +
    (fails ? `, ${fails} FAILED` : '') +
    `\n  Not covered here: Chrome render, zero console errors, reads as a cat in one solid` +
    `\n  colour, and the iPad. Those are still gates.\n`)
  process.exit(fails ? 1 : 0)
}
