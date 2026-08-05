/**
 * Signalling relay assertions, driven against a live `wrangler dev`.
 *
 * No browser, no WebRTC, no game. The relay's contract is "two sockets, opaque
 * blobs between them, then go away", and every clause of that is checkable from
 * Node with the built-in WebSocket client. Worth having as a file rather than
 * an ad-hoc session: a relay bug during a two-iPad test is indistinguishable
 * from a router problem, and this is what tells the two apart.
 *
 *   NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" \
 *     node signaling/test/relay.test.mjs [wss://papa.local:8791]
 *
 * The default goes through Vite's /signal proxy, which is what the iPads use
 * and therefore what is worth testing. The optional argument reaches the relay
 * directly on its loopback port, which is 8791 rather than wrangler's default
 * 8787; see the note in signaling/package.json.
 */
const BASE = process.argv[2] || "wss://papa.local:5173/signal"

let pass = 0
let fail = 0

function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? `  <- ${detail}` : ''}`)
  }
}

/** A socket that records every message, so assertions read a history rather
 *  than racing a handler. */
function open(room) {
  const ws = new WebSocket(`${BASE}/room/${room}`)
  const got = []
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)))
  const closed = new Promise((r) => ws.addEventListener('close', (e) => r(e)))
  const ready = new Promise((r, j) => {
    ws.addEventListener('open', r)
    ws.addEventListener('error', () => j(new Error(`could not open ${room}`)))
  })
  return { ws, got, ready, closed, send: (m) => ws.send(JSON.stringify(m)) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const has = (got, t) => got.some((m) => m.t === t)
const rid = (() => {
  let n = 0
  // Deterministic, and distinct per run so a re-run never lands in a room the
  // previous run left half-open.
  const salt = process.pid.toString(36).toUpperCase().slice(-3)
  return () => `T${salt}${n++}`
})()

async function main() {
  console.log(`relay: ${BASE}\n`)

  // -- health ---------------------------------------------------------------
  const httpBase = BASE.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
  const h = await fetch(`${httpBase}/health`).then((r) => r.json())
  check('GET /health reports ok', h.ok === true, JSON.stringify(h))

  // -- roles and pairing ----------------------------------------------------
  {
    const room = rid()
    const a = open(room)
    await a.ready
    await sleep(120)
    check('first socket is told it is the host', a.got[0]?.t === 'role' && a.got[0].role === 'host')
    check('role message carries the room id', a.got[0]?.room === room)
    check('host is NOT told peer before anyone joins', !has(a.got, 'peer'))

    const b = open(room)
    await b.ready
    await sleep(160)
    check('second socket is told it is the guest', b.got[0]?.role === 'guest')
    check('host is told the peer arrived', has(a.got, 'peer'))
    check('guest is told the peer arrived', has(b.got, 'peer'))

    // -- relay is verbatim and one-directional ------------------------------
    const payload = { sdp: { type: 'offer', sdp: 'v=0 not-real' }, nested: [1, { x: 'y' }] }
    a.send({ t: 'sig', data: payload })
    await sleep(140)
    const relayed = b.got.find((m) => m.t === 'sig')
    check('guest received the blob', !!relayed)
    check(
      'blob arrived byte-identical',
      JSON.stringify(relayed?.data) === JSON.stringify(payload),
      JSON.stringify(relayed?.data),
    )
    check('sender did NOT receive its own blob', !has(a.got, 'sig'))

    b.send({ t: 'sig', data: { candidate: 'reverse' } })
    await sleep(140)
    check('relay works in the other direction too', has(a.got, 'sig'))

    // -- garbage cannot take the room down ----------------------------------
    a.ws.send('this is not json {{{')
    a.send({ t: 'nonsense' })
    a.send({ t: 'sig', data: 'x'.repeat(70 * 1024) })
    await sleep(160)
    b.send({ t: 'sig', data: { still: 'alive' } })
    await sleep(160)
    check(
      'room survives malformed, unknown and oversized frames',
      a.got.filter((m) => m.t === 'sig').length === 2,
      `saw ${a.got.filter((m) => m.t === 'sig').length} sig messages`,
    )
    check(
      'oversized frame was dropped, not relayed',
      b.got.filter((m) => m.t === 'sig').length === 1,
    )

    a.ws.close()
    b.ws.close()
  }

  // -- capacity -------------------------------------------------------------
  {
    const room = rid()
    const a = open(room)
    const b = open(room)
    await a.ready
    await b.ready
    await sleep(160)
    const c = open(room)
    await c.ready
    const ev = await Promise.race([c.closed, sleep(1500)])
    check('third socket is told the room is full', has(c.got, 'full'))
    check('third socket is then closed by the relay', !!ev && ev.type === 'close')
    check('a third socket does not disturb the pair', !has(a.got, 'gone'))
    a.ws.close()
    b.ws.close()
  }

  // -- departure ------------------------------------------------------------
  {
    const room = rid()
    const a = open(room)
    const b = open(room)
    await a.ready
    await b.ready
    await sleep(160)
    b.ws.close()
    await sleep(300)
    check('surviving socket is told the peer is gone', has(a.got, 'gone'))
    a.ws.close()
  }

  // -- teardown, the rule that matters --------------------------------------
  {
    const room = rid()
    const a = open(room)
    const b = open(room)
    await a.ready
    await b.ready
    await sleep(160)
    a.send({ t: 'done' })
    const [ea, eb] = await Promise.all([
      Promise.race([a.closed, sleep(2000)]),
      Promise.race([b.closed, sleep(2000)]),
    ])
    // This is the assertion behind "no game data flows through signalling". The
    // relay does not merely decline to forward gameplay, it is not there.
    check('`done` closes the sender', !!ea && ea.type === 'close')
    check('`done` closes the other side too', !!eb && eb.type === 'close')
    check('both sockets report CLOSED', a.ws.readyState === 3 && b.ws.readyState === 3)

    // A room emptied by `done` must be reusable, or a reconnect after a drop
    // would land in a room that thinks it is still full.
    const c = open(room)
    await c.ready
    await sleep(160)
    check('the room is free again afterwards', c.got[0]?.role === 'host')
    c.ws.close()
  }

  // -- room ids are case-insensitive ----------------------------------------
  {
    const room = rid()
    const a = open(room.toUpperCase())
    const b = open(room.toLowerCase())
    await a.ready
    await b.ready
    await sleep(200)
    check('lower-case and upper-case ids reach the same room', a.got[0]?.role === 'host' && b.got[0]?.role === 'guest')
    check('and both are told the peer arrived', has(a.got, 'peer') && has(b.got, 'peer'))
    a.ws.close()
    b.ws.close()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('harness error:', e.message)
  process.exit(1)
})
