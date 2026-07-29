import { encode } from 'uqr'

/**
 * QR rendering, as SVG path data.
 *
 * `uqr` ships its own `renderSVG`, deliberately unused: it emits a full
 * `<svg>` document string, which would have to go in via `dangerouslySetInnerHTML`
 * and would carry its own opinions about size and colour. Taking the boolean
 * matrix and building the path here is about fifteen lines, keeps the QR a
 * normal React element that inherits the sheet's styling, and matches the
 * CreateCat.tsx rule that overlay UI is DOM and never WebGL.
 */

export interface QrPath {
  /** SVG path `d` for every dark module, in a `size` x `size` viewBox. */
  d: string
  size: number
  /** The exact string encoded, so verification compares text and not pixels. */
  text: string
}

export function qrPath(text: string): QrPath {
  // Error correction 'M' (~15%): the code is displayed on a bright iPad screen
  // and scanned from a foot away, so this is not a damaged-label problem. 'H'
  // would add modules and shrink each one for no benefit here.
  const { data, size } = encode(text, { ecc: 'M', border: 0 })

  // One path for the whole code rather than size^2 <rect> elements. A 33x33 code
  // is 1089 nodes, and React reconciling a thousand rects on a screen that also
  // has to stay responsive to a tap is a self-inflicted wound.
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y][x]) d += `M${x} ${y}h1v1h-1z`
    }
  }
  return { d, size, text }
}

/**
 * The URL a friend's Camera app should open.
 *
 * Built from the CURRENT page's origin and path rather than a configured URL,
 * so the code always points back at the build that drew it. A hardcoded
 * production URL would work on the deployed site and silently send a locally
 * tested scan to the wrong place, which is the kind of bug that costs a whole
 * device-testing round to find.
 */
export function joinUrl(room: string, loc: Location = window.location) {
  const u = new URL(loc.pathname, loc.origin)
  u.searchParams.set('join', room)
  return u.toString()
}
