import { encode } from 'uqr'
import { NET_ONBOARD_PORT } from '../game/constants'

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
 * The URL a friend's Camera app should open: the ONBOARDING page over plain
 * http, never the game over https.
 *
 * This is deliberate and it is the fix for a real dead end. The code used to
 * carry the game's own https URL, and an iPad that has not trusted the CA yet
 * physically cannot open that: Safari shows a bare TLS error, there is nothing to
 * tap, and the child holding the camera has no way to know that installing a
 * certificate is what is being asked of her. Worse, neither child knows in
 * advance which kind of iPad is doing the scanning.
 *
 * So every scan lands on `tools/ca-server.mjs`, which probes the game's https
 * origin and either forwards straight through, in about a tenth of a second, or
 * shows the three install steps and forwards the moment they are done. One code,
 * both devices, and the room id rides along in the query either way.
 *
 * The HOST is taken from the current page rather than configured, so the code
 * always points back at the machine that drew it, on whatever network it is on:
 * `papa.local` at home and on a laptop hotspot, `192.168.2.1` if it was
 * hand-typed. Both are on the certificate. The PORT is the one thing that cannot
 * come from the page, because the page is served by Vite and this is not.
 *
 * (`hostname` rather than `host` on purpose: `host` carries Vite's `:5173`.)
 */
export function joinUrl(room: string, loc: Location = window.location) {
  const u = new URL(`http://${loc.hostname}:${NET_ONBOARD_PORT}/`)
  u.searchParams.set('join', room)
  return u.toString()
}
