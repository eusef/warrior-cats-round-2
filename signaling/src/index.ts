import { Room } from './room'

export { Room }

interface Env {
  ROOMS: DurableObjectNamespace
}

/**
 * The entire signalling service.
 *
 * Two routes and nothing else:
 *
 *   GET /health         plain liveness, so the client can tell "the relay is
 *                       down" from "my friend never showed up"
 *   GET /room/:id       WebSocket upgrade, routed into the Room for that id
 *
 * There is no room-creation endpoint. A room is whatever id you ask for, and
 * the first socket to arrive is its host. That removes a round trip from the
 * host's path (she needs an id on screen instantly, not after a fetch) and it
 * removes all room bookkeeping from this file.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'warrior-cats-signal' })
    }

    const m = /^\/room\/([A-Za-z0-9]{1,16})$/.exec(url.pathname)
    if (!m) return new Response('not found', { status: 404 })

    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }

    // Upper-cased so the id is case-insensitive. The id is shown to a child as
    // four characters and may one day be typed rather than scanned; "ab12" and
    // "AB12" must not be two different forests.
    const id = m[1].toUpperCase()

    // idFromName, not newUniqueId: the whole point is that two devices asking
    // for the same short id land in the same object.
    const stub = env.ROOMS.get(env.ROOMS.idFromName(id))
    const inner = new URL(req.url)
    inner.searchParams.set('room', id)
    return stub.fetch(new Request(inner.toString(), req))
  },
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      // The app is served from a different origin (Pages) than this Worker.
      // WebSocket upgrades are not subject to CORS, but this health probe is.
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  })
}
