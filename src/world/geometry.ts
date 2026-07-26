import * as THREE from 'three'

/**
 * Minimal stand-in for BufferGeometryUtils.mergeGeometries, covering only the
 * position + normal case we need. Thirty lines of our own beats pulling in
 * another dependency, per CLAUDE.md.
 *
 * Inputs are disposed: they only ever exist to be merged.
 */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  let vertexCount = 0
  let indexCount = 0
  for (const g of list) {
    vertexCount += g.attributes.position.count
    indexCount += g.index ? g.index.count : g.attributes.position.count
  }

  const position = new Float32Array(vertexCount * 3)
  const normal = new Float32Array(vertexCount * 3)
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount)

  let vo = 0
  let io = 0
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute
    if (!g.attributes.normal) g.computeVertexNormals()
    const n = g.attributes.normal as THREE.BufferAttribute
    position.set(p.array as Float32Array, vo * 3)
    normal.set(n.array as Float32Array, vo * 3)
    if (g.index) {
      const gi = g.index.array
      for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo
      io += gi.length
    } else {
      for (let i = 0; i < p.count; i++) index[io + i] = i + vo
      io += p.count
    }
    vo += p.count
    g.dispose()
  }

  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  out.setIndex(new THREE.BufferAttribute(index, 1))
  out.computeBoundingSphere()
  return out
}
