import { MAX_SIG_BYTES, ROOM_TTL_MS, type ClientMsg, type ServerMsg } from './protocol'

/**
 * One room, holding at most two WebSockets, relaying opaque blobs between them.
 *
 * NO WEBSOCKET HIBERNATION, deliberately, and this was not the first attempt.
 *
 * The hibernation API (`state.acceptWebSocket`) exists so an idle Durable
 * Object is not billed for duration on Cloudflare's edge. This relay is not
 * deployed to Cloudflare: it runs under `wrangler dev` on Phil's laptop, on the
 * same LAN as the two iPads, with no internet involved. There is no bill to
 * keep near zero, so hibernation buys nothing here.
 *
 * It cost something, though. Under hibernation, `ws.close()` never completed
 * the closing handshake: the server-side socket reached readyState 2 (CLOSING)
 * and stopped, the client never saw a close event, and a client that closed
 * ITSELF hung in CLOSING forever waiting for a response that never came. Three
 * assertions failed identically across runs, and the plain-accept reject path
 * in the same file closed cleanly every time, which is what pinned it down.
 *
 * So: plain `accept()`, sockets tracked in a field. The object stays resident
 * for the life of the room, which for two children on one sofa is minutes.
 */
export class Room {
  /** At most two. Plain-accepted sockets do not appear in `getWebSockets()`,
   *  so this field is the only record of who is in the room. */
  private socks: WebSocket[] = []
  private id = '????'

  constructor(
    private state: DurableObjectState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private env: unknown,
  ) {}

  async fetch(req: Request): Promise<Response> {
    this.id = new URL(req.url).searchParams.get('room') ?? this.id

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()

    // Sockets the browser has already abandoned should not hold a slot. A child
    // who reloads the host screen would otherwise lock herself out of her own
    // room until the TTL expired.
    this.socks = this.socks.filter((s) => s.readyState === WebSocket.READY_STATE_OPEN)

    if (this.socks.length >= 2) {
      // Say no in-band rather than refusing the upgrade. A rejected upgrade
      // surfaces in the browser as an opaque error with no way to tell "that
      // game is full" from "the relay is down", and those need different
      // messages in front of a child.
      send(server, { t: 'full' })
      server.close(1000, 'full')
      return new Response(null, { status: 101, webSocket: client })
    }

    const role: 'host' | 'guest' = this.socks.length === 0 ? 'host' : 'guest'
    this.socks.push(server)

    server.addEventListener('message', (ev) => this.onMessage(server, ev.data))
    server.addEventListener('close', () => this.onGone(server))
    server.addEventListener('error', () => this.onGone(server))

    if (role === 'host') await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS)

    send(server, { t: 'role', role, room: this.id })

    // Both sides are told the room is full. The host needs it as the cue to
    // create the offer; the guest needs it to tell "connected to the relay and
    // waiting" apart from "connected to the relay and ready".
    if (role === 'guest') {
      send(server, { t: 'peer' })
      this.others(server).forEach((s) => send(s, { t: 'peer' }))
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  private onMessage(ws: WebSocket, raw: unknown) {
    if (typeof raw !== 'string') return
    if (raw.length > MAX_SIG_BYTES) return

    let msg: ClientMsg
    try {
      msg = JSON.parse(raw) as ClientMsg
    } catch {
      // A malformed frame is dropped in silence. Never throw out of a socket
      // handler: an exception here would take the other child's connection with
      // it, and a garbled frame is not a reason to end someone else's game.
      return
    }

    if (msg.t === 'done') {
      // The two are talking directly now, so the relay's whole job is over and
      // it hangs up on both. Asserting these sockets end up CLOSED is how
      // verification proves no game data can flow through here: the relay does
      // not merely decline to carry gameplay, it is not there to carry it.
      this.others(ws).forEach((s) => s.close(1000, 'done'))
      ws.close(1000, 'done')
      this.socks = []
      return
    }

    if (msg.t !== 'sig') return

    // Verbatim to the other peer, re-serialised from the parsed object so no
    // extra top-level field can be smuggled past the type.
    this.others(ws).forEach((s) => send(s, { t: 'sig', data: msg.data }))
  }

  private onGone(ws: WebSocket) {
    if (!this.socks.includes(ws)) return
    this.socks = this.socks.filter((s) => s !== ws)
    this.socks.forEach((s) => send(s, { t: 'gone' }))
  }

  private others(ws: WebSocket) {
    return this.socks.filter((s) => s !== ws)
  }

  /**
   * Room lifetime is up.
   *
   * This is a guess-window limit rather than a resource limit: a short session
   * id is only unguessable while it is short-lived. A connected pair sent
   * `done` and emptied the room long before this can fire.
   */
  async alarm() {
    this.socks.forEach((s) => s.close(1000, 'expired'))
    this.socks = []
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // Sending on a socket whose far end has already gone throws. That is a
    // normal way for a session to end (an iPad locked in a bag), not an error
    // worth propagating into the surviving peer's connection.
  }
}
