import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CAT_SPAWN,
  NET_GUEST_SPAWN_OFFSET,
  NET_POSE_DP,
  NET_POSE_HZ,
  NET_REMOTE_LINGER_SEC,
  NET_TOD_HZ,
  NET_YAW_DP,
  TOAST_DURATION_LONG,
} from '../game/constants'
import {
  COOP_FAIL_FULL,
  COOP_FAIL_OTHER,
  COOP_FAIL_RELAY,
  COOP_FAIL_STALE,
  COOP_FAIL_TIMEOUT,
  friendJoinToast,
  friendLeftToast,
} from '../content/lines'
import { live, resetLive, resetRemote, type CatAction } from '../game/live'
import { catName, useGame, type Identity } from '../game/store'
import { groundHeightAt } from '../game/terrain'
import { wrapTime } from '../world/daylight'
import { DEBUG, debugHooks } from '../debug/expose'
import { Peer, type NetStatus } from './peer'
import type { NetMsg } from './protocol'
import { newRoomId } from './signal'

/**
 * The only thing in the game that opens a session, closes one, or decides what
 * crosses the wire. Nothing else imports `peer.ts`, so the whole protocol is
 * readable in one file, exactly as `AudioDriver` is the only thing that decides
 * when a sound plays.
 *
 * Two facts shape everything here.
 *
 * It is mounted INSIDE the Canvas as the LAST useFrame subscriber, after
 * PlayerCat, RivalCat, RemoteCat, the camera and AudioDriver. So the pose it
 * sends is the one this frame's PlayerCat just computed rather than last
 * frame's, and the whole system steps under `__game.step()` instead of needing
 * an rAF of its own.
 *
 * And its receive handlers fire from WebRTC callbacks, not from frames. That is
 * what makes a zustand write legal inside them: R3F rule 1 in CLAUDE.md bans a
 * setter inside useFrame, and a data-channel message is a discrete event of
 * exactly the same kind as a catch or a discovery. So `hello`, every status
 * change and `bye` write the store, while `pose` -- fifteen a second -- writes
 * `live.remote` and never the store.
 *
 * Renders null. Costs no draw call.
 *
 * CONTENT POLICY, ABSOLUTE: no free text of any kind ever crosses the wire.
 * `hello` carries four integers, a boolean and a seed; both names are built
 * locally by `catName()` from the closed lists in `lines.ts`. There is no name
 * field and no chat field in `NetMsg`, and there never will be. The one string
 * that crosses at all is `pose.act`, which is one of the ten fixed labels of the
 * `CatAction` union and cannot carry anything a child typed. Nothing here
 * imports `src/game/duel.ts` either: Phase 1 is two cats in one forest, and they
 * do not fight each other.
 */

const POSE_INTERVAL = 1 / NET_POSE_HZ
const TOD_INTERVAL = 1 / NET_TOD_HZ

/**
 * Rate accumulators fire on `acc + TICK_EPS >= interval`, not on a bare `>=`.
 *
 * Four frames of 1/60 summed one at a time land one ULP BELOW 1/15 in binary
 * floating point, so a bare compare slips every pose to the fifth frame and
 * sends 12 a second against a configured 15. The epsilon is a thousandth of a
 * frame: far too small to move a real send, exactly enough to put the boundary
 * where the arithmetic says it is.
 */
const TICK_EPS = 1e-9

/** The last N messages SENT, for the debug outbox. DEBUG-only; see send(). */
const OUTBOX_MAX = 64
const sentLog: NetMsg[] = []

/**
 * The subset of `Peer` this file actually touches.
 *
 * Named, and not merely `Peer`, so that `fake()` can satisfy it in eight lines
 * with no `RTCPeerConnection` anywhere. If NetDriver ever needs another member
 * of Peer, adding it here is what forces the stub to grow with it rather than
 * quietly falling behind.
 */
interface PeerLike {
  status: NetStatus
  role: 'host' | 'guest' | null
  room: string
  rtt: number
  sent: number
  recv: number
  send: (msg: NetMsg) => boolean
  start: () => void
  dispose: () => void
}

/**
 * One session's worth of bookkeeping. Lives on a ref: every field changes from a
 * WebRTC callback or from useFrame, and none of it should re-render anything.
 */
interface Session {
  peer: PeerLike | null
  /** Has the arrival toast fired? `hello` is state and arrives many times. */
  greeted: boolean
  /** Guest only, once per session each: seed adopted, spawn point applied. */
  seeded: boolean
  spawned: boolean
  /** A peer was actually here, so a drop is a friend leaving and not a failure
   *  to connect in the first place. */
  hadPeer: boolean
  poseT: number
  todT: number
}

/** The exact shape `debugHooks.net.info()` returns. */
export interface NetInfo {
  status: NetStatus
  role: 'host' | 'guest' | null
  room: string | null
  peerName: string | null
  rtt: number
  sent: number
  recv: number
  present: boolean
  frozen: boolean
  linger: number
  action: CatAction
  pos: { x: number; y: number; z: number }
  yaw: number
  speed: number
  target: { x: number; z: number; yaw: number; speed: number; hop: number }
}

/** The whole Phase 1 verification seam. See installFake for why it exists. */
export interface NetDebug {
  info: () => NetInfo
  inject: (msg: NetMsg) => void
  outbox: () => NetMsg[]
  clearOutbox: () => void
  fake: (role: 'host' | 'guest') => void
}

export function NetDriver() {
  const want = useGame((s) => s.netWant)
  const identity = useGame((s) => s.identity)
  const phase = useGame((s) => s.phase)
  const pendingJoin = useGame((s) => s.pendingJoinRoom)
  const sess = useRef<Session>({
    peer: null,
    greeted: false,
    seeded: false,
    spawned: false,
    hadPeer: false,
    poseT: 0,
    todT: 0,
  })

  /**
   * The peer's entire lifecycle, owned by one effect keyed on the intent. The
   * store only ever states what it wants -- host, join, idle -- and this is the
   * only place that acts on it, which is what keeps `RTCPeerConnection` out of
   * store.ts and out of every component that shows a connect screen.
   */
  useEffect(() => {
    const s = sess.current

    if (want.kind === 'idle') {
      // Nothing to open. Anything that WAS open has already been torn down by
      // the previous run's cleanup, which is also where the `bye` goes: React
      // runs cleanup BEFORE the next effect body, so a `bye` sent from here
      // would always find `s.peer` already null and never reach the wire. The
      // call is idempotent and covers the first mount.
      teardown(s)
      return
    }

    const role: 'host' | 'guest' = want.kind === 'host' ? 'host' : 'guest'

    if (role === 'guest' && !want.room) {
      // Unreachable through netJoin(), which always carries an id. If it ever
      // happens, fail visibly rather than sit on 'signaling' forever: a spinner
      // that will never resolve is the one failure shape a child cannot tell
      // apart from a slow network.
      useGame.getState().setNet({ status: 'failed', error: COOP_FAIL_OTHER })
      return
    }

    // The host mints the id HERE and writes it back through setNet. store.ts
    // cannot import src/net/ -- the net layer imports the store, and the other
    // direction is a cycle -- which is exactly why netHost() leaves `room` null.
    const room = role === 'host' ? newRoomId() : (want.room as string)

    const peer = new Peer(
      room,
      {
        onStatus: (status, detail) => handleStatus(s, status, detail),
        onMessage: (msg) => handleMessage(s, msg),
        // The Phase 0 log is what made a two-iPad failure diagnosable at all,
        // and it costs nothing to keep. DEBUG-gated, so her build is silent.
        onLog: DEBUG ? logLine : undefined,
      },
      // The WANTED role, passed through rather than left to the relay to state.
      // peer.ts takes it for one reason: a guest told it is the host means that
      // room was empty, so the code being scanned is dead. Unhandled that is the
      // worst failure in the whole flow, because it looks exactly like a working
      // join and then waits forever.
      role,
    )
    s.peer = peer
    useGame.getState().setNet({ status: 'signaling', role, room, error: null })
    peer.start()

    return () => teardown(s)
  }, [want])

  /**
   * Spend a scanned room the moment play actually opens, whichever route got
   * there. This is the returning guest, and it is the worst kind of bug: a
   * silent one that looks exactly like the feature working.
   *
   * `pendingJoinRoom` is parked rather than joined by the title screen, and it
   * has to be, because a friend who scans the code may have no save: `start()`
   * routes her to 'create' and connecting from there would drop the connect
   * overlay on top of the creation sheet while she is choosing a pelt. So the
   * join is deferred to the start of play.
   *
   * `beginPlay()` was the only place that spent it, and `beginPlay()` is reached
   * from exactly one button -- CreateCat's Begin. A friend who ALREADY HAS A CAT
   * never touches it: `start()` sees an identity in her save and sends her
   * straight to 'playing'. The room then sat parked forever. No peer, no relay
   * socket, no failure, no overlay, no toast -- a completely ordinary solo
   * forest, for a child who just scanned her friend's code and has every reason
   * to think it worked. Nothing on the screen distinguishes it from success,
   * which is the whole reason it is worth this many lines of comment.
   *
   * Keyed on `phase` reaching 'playing' rather than on the button, so both
   * routes into the forest are covered and any future one is too.
   *
   * This lives here and not in store.ts on purpose. That is the entire point of
   * the `netWant` indirection: the store states what it wants and knows nothing
   * about connecting, and NetDriver is the one file allowed to import both.
   *
   * `beginPlay()` still spends the room too, and that duplicate is harmless
   * ONLY because both places clear the field BEFORE joining: whichever runs
   * second reads null and does nothing. Do not reorder those two lines in either
   * place, or a friend with no save opens the same room twice and the second
   * `netJoin` tears down a session that was already connecting.
   */
  useEffect(() => {
    if (phase !== 'playing' || !pendingJoin) return
    const g = useGame.getState()
    g.setPendingJoin(null)
    g.netJoin(pendingJoin)
  }, [phase, pendingJoin])

  /**
   * Re-send `hello` whenever she changes what her cat looks like.
   *
   * `hello` is idempotent STATE, not an event. A friend who scans the code has no
   * save, so she goes through creation while already connected and her first
   * hello carries the DEFAULT pelt, eyes and prefix. Without this the peer's cat
   * wears that default for the rest of the session and the receiver never learns
   * she picked anything. The receiver simply overwrites what it had.
   */
  useEffect(() => {
    const s = sess.current
    if (s.peer?.status === 'connected') sendHello(s)
  }, [identity])

  /**
   * Say goodbye on the way out of the page, so the other side gets its toast now
   * rather than after NET_PEER_TIMEOUT_SEC of silence.
   *
   * Best effort only. iOS frequently tears a page down without ever running
   * `pagehide` -- a locked screen, a swiped-away tab -- which is precisely why
   * the heartbeat timeout in peer.ts is the real backstop and this is only the
   * fast path when it happens to work.
   */
  useEffect(() => {
    const onHide = () => {
      const s = sess.current
      if (s.peer?.status === 'connected') send(s, { t: 'bye' })
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  // The debug seam. Registered into debugHooks, DEBUG only, and removed on
  // unmount so a hot reload cannot leave a stale session behind it.
  //
  // No cast. `debugHooks` carries a `net?: NetDebug` field of its own, typed
  // through a type-only import of this file, so expose.ts knows the shape of a
  // session and still has no runtime dependency on the networking layer.
  useEffect(() => {
    if (!DEBUG) return
    debugHooks.net = {
      info: () => infoOf(sess.current),
      inject: (msg) => handleMessage(sess.current, msg),
      outbox: () => sentLog.slice(),
      clearOutbox: () => {
        sentLog.length = 0
      },
      fake: (role) => installFake(sess.current, role),
    }
    return () => {
      debugHooks.net = undefined
    }
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const s = sess.current
    const peer = s.peer

    // Solo play is every early return in this file. With no peer this is one
    // property read per frame and nothing else: no allocation, no store read.
    if (!peer || peer.status !== 'connected') return

    // No pose from the title or the creation screen. The cat there is a
    // mannequin on a turntable at spawn being repainted on every tap, and
    // sending it would stand a second cat in her friend's forest spinning on the
    // spot. The host connects while still on the title screen, so this is the
    // normal case for the first moments of a session and not an edge case.
    if (useGame.getState().phase !== 'playing') return

    s.poseT += delta
    if (s.poseT + TICK_EPS >= POSE_INTERVAL) {
      s.poseT -= POSE_INTERVAL
      const cat = live.cat
      // The one object literal per send, which JSON.stringify needs and there is
      // no way around. Everything else in this loop is a number on a ref.
      //
      // No `y`. Height is never sent: both devices share groundHeightAt(), so
      // the receiver recomputes it and the two cannot disagree about the ground.
      send(s, {
        t: 'pose',
        x: round(cat.pos.x, NET_POSE_DP),
        z: round(cat.pos.z, NET_POSE_DP),
        yaw: round(cat.yaw, NET_YAW_DP),
        sp: round(cat.speed, NET_POSE_DP),
        act: cat.action,
        hop: round(cat.hopHeight, NET_POSE_DP),
      })
    }

    // Host only. The host's clock IS the forest's clock; two devices each
    // correcting the other would leave the sun twitching between two times all
    // session. The guest keeps running its own clock and snaps to what arrives.
    if (peer.role === 'host') {
      s.todT += delta
      if (s.todT + TICK_EPS >= TOD_INTERVAL) {
        s.todT -= TOD_INTERVAL
        // Deliberately not rounded. There is no constant for the clock's wire
        // precision, and inventing one here would put a tunable number outside
        // constants.ts to save about ten bytes once a second.
        send(s, { t: 'tod', tod: live.timeOfDay })
      }
    }
  })

  return null
}

// -- receive ----------------------------------------------------------------
// Everything below runs from a WebRTC callback or from an effect, never from a
// frame, which is what makes the store writes in here legal.

function handleStatus(s: Session, status: NetStatus, detail: string) {
  const g = useGame.getState()

  if (status === 'connected') {
    s.hadPeer = true
    g.setNet({ status, role: s.peer?.role ?? null, room: s.peer?.room ?? null, error: null })

    // Identity first, before anything else crosses. The far side needs four
    // integers to paint a cat and it needs them before the first pose lands, or
    // it draws a default-ginger stranger for a moment.
    sendHello(s)

    // The host tapped "Play with a friend" and is STILL on the title screen:
    // App.tsx deliberately does not call start() on that path, so the forest is
    // never opened, and the clock never started, for a friend who has not
    // arrived. Opening it is this line, and it is the only reason this file
    // knows what `phase` is.
    if (g.phase === 'title') g.start()
    return
  }

  if (status === 'lost' || status === 'failed') {
    // ConnectScreen only shows this line on 'failed'. A peer lost mid-game gets
    // the toast below and no overlay at all, because a child whose friend put an
    // iPad down must not be handed a modal that reads as the game breaking
    // (US-8). The line is still set, so nothing that does read it reads null.
    g.setNet({ status, error: failLine(detail) })

    if (s.hadPeer) {
      // Said once, and only if the arrival was said: `greeted` gates both, so
      // nobody is announced as leaving who was never announced as arriving.
      const name = useGame.getState().net.peerName
      if (s.greeted && name) g.showToast(friendLeftToast(name), TOAST_DURATION_LONG)

      // Freeze rather than vanish. RemoteCat owns the countdown and the removal;
      // this only says when it starts. tspeed 0 and action 'idle' are what make
      // her ease to a stand instead of being cut off mid-stride.
      const m = live.remote
      m.frozen = true
      m.linger = NET_REMOTE_LINGER_SEC
      m.tspeed = 0
      m.action = 'idle'
    }
    return
  }

  g.setNet({ status })
}

function handleMessage(s: Session, msg: NetMsg) {
  switch (msg.t) {
    case 'hello': {
      // Four indices and a boolean. The NAME IS BUILT HERE, from the closed
      // lists in lines.ts, and is never read off the wire.
      const id: Identity = {
        pelt: msg.pelt,
        eyes: msg.eyes,
        prefix: msg.prefix,
        warrior: msg.warrior === true,
      }
      const name = catName(id)
      const g = useGame.getState()
      g.setNet({ peerIdentity: id, peerName: name })

      // hello arrives again on every pelt tap the friend makes, so the toast is
      // one-shot per session rather than per message.
      if (!s.greeted) {
        s.greeted = true
        g.showToast(friendJoinToast(name))
      }

      // Seed adoption: guest only, once per session, and only if the two
      // forests actually differ.
      //
      // setSeed() calls resetLive() with its DEFAULT arguments, which puts
      // health and hunger back to full, so adopting a seed would silently heal
      // and feed the cat. The two needs are captured first and put straight
      // back afterwards. Everything else resetLive() does is wanted here: she
      // has been moved into a different forest, so the camera snapping and the
      // cat returning to spawn are correct rather than collateral.
      //
      // In practice this branch does not fire: DEFAULT_SEED is fixed and is
      // never saved, so both devices are already in the same forest. It has to
      // be right for the day the seed is randomised or persisted.
      if (isGuest(s) && !s.seeded) {
        s.seeded = true
        const seed = msg.seed >>> 0
        if (seed !== g.seed) {
          const health = live.health
          const hunger = live.hunger
          g.setSeed(seed)
          resetLive(health, hunger)
        }
      }

      // Guest spawn, once per session. US-2: the friend arrives near camp. Both
      // devices otherwise spawn on the identical point and the first thing
      // either child sees is two cats standing inside each other. After the
      // seed block on purpose, because resetLive() above puts her back on
      // CAT_SPAWN exactly.
      if (isGuest(s) && !s.spawned) {
        s.spawned = true
        const x = CAT_SPAWN[0] + NET_GUEST_SPAWN_OFFSET[0]
        const z = CAT_SPAWN[1] + NET_GUEST_SPAWN_OFFSET[1]
        live.cat.pos.set(x, groundHeightAt(x, z), z)
        live.cat.vel.set(0, 0, 0)
        live.cat.speed = 0
      }
      return
    }

    case 'pose': {
      // Fifteen a second, so NOTHING here touches the store: a setNet at this
      // rate re-renders the HUD fifteen times a second for numbers the HUD does
      // not show. The wire targets and the action label only. RemoteCat eases
      // the drawn cat toward them and owns everything else about her.
      const m = live.remote
      m.tx = msg.x
      m.tz = msg.z
      m.tyaw = msg.yaw
      m.tspeed = msg.sp
      m.thop = msg.hop
      m.action = msg.act
      // A pose is the proof there is a cat to draw, and also the proof that a
      // frozen one came back. Written every time rather than on the first pose
      // only: two assignments are cheaper than the branch that would skip them.
      m.present = true
      m.frozen = false
      return
    }

    case 'tod':
      // Guest only. Ignored outright on the host, which owns the clock.
      if (isGuest(s)) live.timeOfDay = wrapTime(msg.tod)
      return

    case 'bye':
      // A deliberate quit, treated exactly as a drop: same toast, same freeze,
      // same store status. Writing the peer's own status is what stops the frame
      // loop sending poses to a cat that has gone home, and it has a second use:
      // peer.ts's setStatus() ignores a repeat, so the heartbeat timeout that
      // follows a few seconds later cannot fire the leaving toast twice.
      if (s.peer) s.peer.status = 'lost'
      handleStatus(s, 'lost', 'your friend went home')
      return

    // ping and pong deliberately have no case. peer.ts answers a ping inline and
    // eats a pong to measure the round trip, so onMessage is only ever handed
    // game messages. Handling them again here would double every heartbeat.
  }
}

/**
 * The relay's answer, not the wish. peer.ts has already failed the session if
 * the two disagreed, so by the time any message arrives this is settled.
 */
function isGuest(s: Session) {
  return s.peer?.role === 'guest'
}

/**
 * The peer's own failure detail, mapped onto a line a ten-year-old can act on.
 *
 * These are the complete set peer.ts can produce, matched rather than invented,
 * one line per site in that file:
 *   'that code has expired...'                 onRole mismatch, a dead QR
 *   'that game already has two cats in it'     the relay's `full`
 *   'could not reach the relay'                signal socket error, or a bad url
 *   'took too long to connect'                 the connect deadline in arm()
 *   'the two devices could not reach each other'  pc connectionState 'failed'
 *   'your friend disconnected'                 the only 'lost' detail there is
 *
 * The last two both land on the catch-all, and honestly: ICE failing outright on
 * one Wi-Fi network is not something she can act on, and a friend who left is
 * described by the toast rather than by this. Substring matches, checked in an
 * order where no earlier test can claim a later string.
 */
function failLine(detail: string): string {
  if (detail.includes('expired')) return COOP_FAIL_STALE
  if (detail.includes('two cats')) return COOP_FAIL_FULL
  if (detail.includes('relay')) return COOP_FAIL_RELAY
  if (detail.includes('too long')) return COOP_FAIL_TIMEOUT
  return COOP_FAIL_OTHER
}

// -- send -------------------------------------------------------------------

function sendHello(s: Session) {
  const g = useGame.getState()
  const id = g.identity
  // Four integers, a boolean and a seed. NO FREE TEXT, EVER: not a name, not a
  // greeting, not a chat field. This is the whole of what one device tells the
  // other about who is playing, and `catName()` does the rest locally.
  send(s, {
    t: 'hello',
    pelt: id.pelt,
    eyes: id.eyes,
    prefix: id.prefix,
    warrior: id.warrior,
    seed: g.seed,
  })
}

function send(s: Session, msg: NetMsg) {
  const peer = s.peer
  if (!peer) return false
  const ok = peer.send(msg)
  // The send half of the verification seam, and DEBUG-only: her build must not
  // keep a rolling history of every pose it has ever sent. Recorded only when
  // the channel actually took it, so the outbox means "went out" and not "was
  // offered". This is the single recording point; the stub peer does not repeat
  // it, or every message would be entered twice.
  if (DEBUG && ok) {
    sentLog.push(msg)
    if (sentLog.length > OUTBOX_MAX) sentLog.shift()
  }
  return ok
}

/**
 * Close a session down: goodbye, dispose, forget, and take the peer's cat off
 * the field. Idempotent, because the idle branch of the lifecycle effect and its
 * own cleanup both call it.
 */
function teardown(s: Session) {
  const peer = s.peer
  if (peer) {
    if (peer.status === 'connected') send(s, { t: 'bye' })
    peer.dispose()
  }
  s.peer = null
  s.greeted = false
  s.seeded = false
  s.spawned = false
  s.hadPeer = false
  s.poseT = 0
  s.todT = 0
  resetRemote()
}

// -- debug ------------------------------------------------------------------

function infoOf(s: Session): NetInfo {
  const peer = s.peer
  const n = useGame.getState().net
  const m = live.remote
  return {
    status: peer?.status ?? n.status,
    role: peer?.role ?? n.role,
    room: peer?.room ?? n.room,
    peerName: n.peerName,
    rtt: peer ? Math.round(peer.rtt) : 0,
    sent: peer?.sent ?? 0,
    recv: peer?.recv ?? 0,
    present: m.present,
    frozen: m.frozen,
    linger: round(m.linger, 3),
    // What is DRAWN, so a chase can be asserted against the wire targets below
    // rather than judged from a screenshot.
    action: m.action,
    pos: { x: round(m.pos.x, 2), y: round(m.pos.y, 2), z: round(m.pos.z, 2) },
    yaw: round(m.yaw, 3),
    speed: round(m.speed, 2),
    target: {
      x: round(m.tx, 2),
      z: round(m.tz, 2),
      yaw: round(m.tyaw, 3),
      speed: round(m.tspeed, 2),
      hop: round(m.thop, 2),
    },
  }
}

/**
 * A stub peer, and the reason this whole seam exists.
 *
 * THIS CHROME CANNOT COMPLETE AN ICE HANDSHAKE. Bisected during Phase 0 down to
 * two RTCPeerConnections in one tab, loopback, with zero application code
 * between them: they never pair. So the real WebRTC path is not verifiable on
 * this machine at all, and the honest answer is to make the wire injectable and
 * verify both sides of it instead.
 *
 * `fake()` constructs no RTCPeerConnection, contacts no relay and needs no
 * network. It installs an object satisfying only the members of `Peer` this file
 * uses, marks it connected, and drives the same onStatus('connected') path a
 * real peer drives. With `inject()` for the receive half and `outbox()` for the
 * send half, that covers the entire protocol and everything downstream of it --
 * toasts, identity, spawn, the clock, RemoteCat -- leaving only the handshake
 * itself for the iPads, which is where it was always going to be settled.
 */
function installFake(s: Session, role: 'host' | 'guest') {
  // Replaces whatever was there, and says goodbye properly if it was real.
  teardown(s)
  s.peer = {
    status: 'connected',
    role,
    room: 'FAKE',
    rtt: 0,
    sent: 0,
    recv: 0,
    send: () => true,
    start: () => {},
    dispose: () => {},
  }
  // A fake session starts as blank as a real one. netHost() and netJoin() clear
  // these and this path goes through neither.
  useGame.getState().setNet({ peerName: null, peerIdentity: null })
  handleStatus(s, 'connected', 'fake peer')
}

function logLine(line: string) {
  // eslint-disable-next-line no-console
  console.log(`[net] ${line}`)
}

/**
 * Fixed decimal places on the wire. Two places is centimetres, finer than
 * anything visible at the camera distance, and it keeps a coordinate to five
 * characters of JSON instead of nineteen.
 */
function round(v: number, dp: number) {
  const m = 10 ** dp
  return Math.round(v * m) / m
}
