import { useCallback, useEffect, useRef, useState } from 'react'
import { Peer, type NetStatus, type PairInfo } from '../peer'
import { qrPath, joinUrl } from '../qr'
import { newRoomId, roomFromUrl, signalHealthy, signalOrigin, signalUrl } from '../signal'

/**
 * Phase 0 spike: prove two devices can find each other and exchange a
 * heartbeat. No canvas, no game, no import from src/game beyond constants.
 *
 * This page is deliberately throwaway. `peer.ts`, `signal.ts` and `qr.ts` are
 * what survive into Phase 1; this is the harness that proves them on real
 * hardware before a single line of game code depends on them.
 */
export function SpikePage() {
  const joining = roomFromUrl()
  const [room] = useState(() => joining ?? newRoomId())
  const [status, setStatus] = useState<NetStatus>('idle')
  const [detail, setDetail] = useState('')
  const [snap, setSnap] = useState<Record<string, unknown>>({})
  const [pair, setPair] = useState<PairInfo | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [health, setHealth] = useState<boolean | null>(null)
  const [attempt, setAttempt] = useState(0)
  const peerRef = useRef<Peer | null>(null)

  const push = useCallback((line: string) => {
    // Newest first, capped. An unbounded log on a page that may sit connected
    // for twenty minutes is a slow memory leak with a nice UI.
    setLog((prev) => [`${stamp()} ${line}`, ...prev].slice(0, 120))
  }, [])

  useEffect(() => {
    void signalHealthy().then(setHealth)
  }, [attempt])

  useEffect(() => {
    const peer = new Peer(
      room,
      {
        onStatus: (s, d) => {
          setStatus(s)
          setDetail(d)
        },
        onLog: push,
      },
      joining ? 'guest' : 'host',
    )
    peerRef.current = peer

    // The bridge is how verification asserts on this page instead of reading
    // pixels, exactly like window.__game. Always on here: net.html is not the
    // build she plays, so there is no clean-build argument for gating it.
    ;(window as unknown as { __net: unknown }).__net = {
      peer,
      room,
      state: () => peer.snapshot(),
      pair: () => peer.pairInfo(),
      ping: () => peer.send({ t: 'ping', n: -1, s: performance.now() }),
      log: () => log,
      joinUrl: () => joinUrl(room),
      signalUrl: () => signalUrl(room),
      qr: () => qrPath(joinUrl(room)),
    }

    peer.start()

    // A 4Hz poll of a plain object. Not a game loop and not in useFrame: this
    // page has no canvas and nothing to synchronise a frame with.
    const t = setInterval(() => {
      setSnap(peer.snapshot())
      void peer.pairInfo().then(setPair)
    }, 250)

    return () => {
      clearInterval(t)
      peer.dispose()
    }
  }, [room, attempt, push, joining])

  const qr = qrPath(joinUrl(room))
  const url = joinUrl(room)

  return (
    <div style={S.page}>
      <div style={S.left}>
        {joining ? (
          <div style={S.glyph}>{status === 'connected' ? '✓' : '⋯'}</div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              style={S.qr}
              shapeRendering="crispEdges"
              role="img"
              aria-label="Join code"
            >
              <rect width={qr.size} height={qr.size} fill="#fff" />
              <path d={qr.d} fill="#12180f" />
            </svg>
            <div style={S.roomId}>{room}</div>
          </>
        )}
      </div>

      <div style={S.right}>
        <div style={S.title}>{joining ? 'Joining a game' : 'Play with a friend'}</div>
        <div style={{ ...S.status, color: statusColor(status) }}>
          {statusLine(status, detail, joining !== null)}
        </div>

        <div style={S.grid}>
          <Row k="role" v={String(snap.role ?? '-')} />
          <Row k="room" v={room} />
          <Row k="round trip" v={status === 'connected' ? `${snap.rtt} ms` : '-'} />
          <Row k="beats" v={`${snap.sent ?? 0} sent / ${snap.recv ?? 0} back`} />
          <Row k="ice" v={String(snap.iceState ?? '-')} />
          <Row k="channel" v={String(snap.dcState ?? '-')} />
          <Row k="relay socket" v={String(snap.signalSocket ?? '-')} />
          <Row
            k="candidate pair"
            v={pair?.local ? `${pair.local} / ${pair.remote}` : '-'}
            warn={pair?.relayed === true}
          />
          <Row
            k="relay service"
            v={health === null ? 'checking' : health ? 'up' : 'unreachable'}
            warn={health === false}
          />
        </div>

        {!joining && <div style={S.url}>{url}</div>}
        <div style={S.signal}>signalling: {signalOrigin()}</div>

        {(status === 'failed' || status === 'lost') && (
          <button style={S.button} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        )}

        <div style={S.log}>
          {log.map((l, i) => (
            <div key={`${i}-${l}`}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <>
      <div style={S.k}>{k}</div>
      <div style={{ ...S.v, color: warn ? '#e2725b' : '#dfe6d4' }}>{v}</div>
    </>
  )
}

function statusLine(s: NetStatus, detail: string, guest: boolean) {
  if (s === 'connected') return 'Connected to peer'
  if (s === 'failed') return detail || 'Could not connect'
  if (s === 'lost') return 'Your friend disconnected'
  if (s === 'signaling') return guest ? 'Finding your friend...' : 'Waiting for your friend...'
  return 'Starting...'
}

function statusColor(s: NetStatus) {
  if (s === 'connected') return '#9fd67a'
  if (s === 'failed' || s === 'lost') return '#e2725b'
  return '#e8d9a0'
}

function stamp() {
  const d = new Date()
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(
    Math.floor(d.getMilliseconds() / 100),
  )}`
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// Separate fontSize / fontWeight / lineHeight properties throughout, never the
// `font` shorthand. `font: '700 44px/1 inherit'` is invalid CSS (`inherit` is
// not a legal family) and the browser drops the whole declaration silently.
// That bug shipped in this project for weeks; see CLAUDE.md backlog item 2.
const S: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    gap: 28,
    padding: 28,
    background: '#1d2a17',
    color: '#dfe6d4',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    touchAction: 'none',
    overscrollBehavior: 'none',
    boxSizing: 'border-box',
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    flex: '0 0 auto',
    width: 320,
  },
  qr: { width: 300, height: 300, background: '#fff', borderRadius: 12, padding: 12 },
  roomId: { fontSize: 44, fontWeight: 700, letterSpacing: 8, fontFamily: mono },
  glyph: { fontSize: 140, lineHeight: 1, color: '#9fd67a' },
  right: { flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  title: { fontSize: 30, fontWeight: 700, lineHeight: 1.1 },
  status: { fontSize: 22, fontWeight: 600, lineHeight: 1.2 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: 16,
    rowGap: 3,
    fontSize: 15,
    fontFamily: mono,
  },
  k: { opacity: 0.55 },
  v: { fontWeight: 600 },
  url: { fontSize: 13, opacity: 0.6, wordBreak: 'break-all', fontFamily: mono },
  signal: { fontSize: 12, opacity: 0.4, fontFamily: mono },
  button: {
    alignSelf: 'flex-start',
    minHeight: 44,
    padding: '12px 28px',
    fontSize: 18,
    fontWeight: 700,
    fontFamily: 'inherit',
    lineHeight: 1,
    color: '#12180f',
    background: '#e8d9a0',
    border: 'none',
    borderRadius: 10,
    touchAction: 'none',
  },
  log: {
    flex: '1 1 auto',
    overflowY: 'auto',
    fontSize: 12,
    lineHeight: 1.45,
    opacity: 0.75,
    fontFamily: mono,
    borderTop: '1px solid rgba(223,230,212,0.16)',
    paddingTop: 8,
    minHeight: 0,
  },
}
