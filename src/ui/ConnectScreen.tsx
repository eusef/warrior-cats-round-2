import { useCallback, useMemo } from 'react'
import { HUD_EDGE_MARGIN_Y, NET_QR_CODE_PX, NET_QR_QUIET_MODULES } from '../game/constants'
import {
  COOP_FAIL_OTHER,
  COOP_HOST_HINT,
  COOP_HOST_TITLE,
  COOP_JOIN_WAIT,
  COOP_NEW_CODE_LABEL,
  COOP_RETRY_LABEL,
  COOP_SOLO_LABEL,
} from '../content/lines'
import { DEBUG } from '../debug/expose'
import { useGame } from '../game/store'
import { joinUrl, qrPath, type QrPath } from '../net/qr'

/**
 * The two-iPad connect screen: the QR while a host waits, one line while a
 * guest looks, and the failure line with a way out of it.
 *
 * Plain DOM over the canvas, the same species as CreateCat and Ceremony, so it
 * costs zero draw calls and zero triangles. It re-renders when `net` changes and
 * at no other time: the pose that arrives every frame goes to `live.remote` and
 * never through the store, so nothing here re-renders while two cats are
 * actually playing.
 *
 * Every state carries the solo button (US-1). There is no state on this screen
 * she cannot leave in one tap, including the ones that are still working.
 */

/** Same list the Phase 0 harness used. The room id is read aloud when a scan
 *  misses, so the glyphs have to be unambiguous and evenly spaced. */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function ConnectScreen() {
  const net = useGame((s) => s.net)
  const netHost = useGame((s) => s.netHost)
  const netJoin = useGame((s) => s.netJoin)
  const netLeave = useGame((s) => s.netLeave)

  const { status, role, room, error } = net

  // Built on the room id changing, never per render: the matrix is around 1100
  // modules and the path string is assembled a module at a time. Null for the
  // frame between netHost() and NetDriver minting an id, which is exactly the
  // case the panel below renders without a code rather than crashing on.
  const qr = useMemo(() => (room ? qrPath(joinUrl(room)) : null), [room])

  const retry = useCallback(() => {
    // A guest retries the room she scanned, because that code is what she has.
    // A host opens a FRESH room: netHost() leaves the id null and NetDriver
    // mints a new one, and it must, because the room the relay just dropped is
    // dead and the QR on the table has to change with it.
    //
    // Branched on the role rather than on whether a room exists. A guest handed
    // a host's path would silently open her own empty forest and wait in it,
    // which looks exactly like a working join.
    if (role === 'guest') {
      if (room) netJoin(room)
    } else {
      netHost()
    }
  }, [role, room, netHost, netJoin])

  // Every hook is above this gate. React counts hooks per render, so a selector
  // below an early return changes the count between a connecting frame and an
  // idle one and the whole tree unmounts with a hook-order error. Same shape as
  // CreateCat, for the same reason.
  if (status !== 'signaling' && status !== 'failed') return null

  const failed = status === 'failed'
  const hosting = role !== 'guest'
  // Built here rather than inline so `qr` and `room` are narrowed once and the
  // layout below can ask whether there is a card without asking again why.
  const card = !failed && hosting && qr && room ? <QrCard qr={qr} room={room} /> : null

  return (
    <div
      className="no-touch-scroll"
      style={{
        position: 'fixed',
        inset: 0,
        // Above the title screen (100), and that is the whole reason for the
        // number: the host opens this from the title and start() has not been
        // called yet, so the title is still mounted and painting underneath.
        // The rest of the ladder is below it -- HUD 10/15/25/30, toast 40,
        // ceremony 45, debug 50, creation sheet 60.
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 44,
        paddingTop: 'calc(28px + var(--safe-top))',
        // Nothing tappable in the bottom strip. In landscape Safari without Add
        // to Home Screen `--safe-bottom` is 0px, so this padding is the only
        // thing keeping a button out of the home-indicator swipe area, and
        // HUD_EDGE_MARGIN_Y is the number that was measured for it.
        paddingBottom: `calc(${HUD_EDGE_MARGIN_Y}px + var(--safe-bottom))`,
        paddingLeft: 'calc(44px + var(--safe-left))',
        paddingRight: 'calc(44px + var(--safe-right))',
        // The same gradient as the title screen, because on the host this
        // replaces it: two different dark greens would read as a glitch.
        background: 'linear-gradient(170deg, #24361c 0%, #131d0f 100%)',
      }}
    >
      {/* Side by side, never stacked. A 300px code plus a heading plus three
          lines of hint does not fit above one another in 820px of landscape
          minus the safe areas, and the first thing to be pushed off is the
          code. */}
      {card}

      <div
        style={{
          flex: '0 1 auto',
          maxWidth: 540,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          textAlign: card ? 'left' : 'center',
          alignItems: card ? 'flex-start' : 'center',
        }}
      >
        {failed ? (
          // Straight out of the store. NetDriver already looked the line up from
          // lines.ts, so re-mapping it here would be a second place for the
          // wording to live and a second place for it to drift.
          //
          // The `??` is a floor and not a mapping: NetDriver always sets a line,
          // and a failure screen with no words on it is the one thing this
          // screen must never manage to show.
          <div style={{ fontSize: 29, fontWeight: 700, lineHeight: 1.3, color: '#ffd98a' }}>
            {error ?? COOP_FAIL_OTHER}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.15 }}>
              {hosting ? COOP_HOST_TITLE : COOP_JOIN_WAIT}
            </div>
            {hosting ? (
              <div style={{ fontSize: 21, fontWeight: 500, lineHeight: 1.42, opacity: 0.78 }}>
                {COOP_HOST_HINT}
              </div>
            ) : (
              // The guest gets no QR and nothing to do, so the code is here
              // instead: it is the one thing that lets her check she is looking
              // for the forest her friend actually opened.
              room && <RoomCode room={room} />
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
          {failed && <Btn label={COOP_RETRY_LABEL} onTap={retry} primary />}
          {/* Only while a host is waiting. `netHost()` is the whole
              implementation: it sets a FRESH netWant object with a null room, so
              NetDriver's effect tears the dead session down -- goodbye, dispose,
              room closed -- and mints a new id on the way back in. The QR is null
              for the one frame in between, which is the case `card` above already
              renders without a code rather than crashing on.
              Not offered to a guest: she has no code to replace, only the one she
              scanned. Not offered on the failure screen either, where a host's
              `Try again` already does exactly this. */}
          {!failed && hosting && <Btn label={COOP_NEW_CODE_LABEL} onTap={netHost} />}
          <Btn label={COOP_SOLO_LABEL} onTap={netLeave} />
        </div>
      </div>
    </div>
  )
}

/** The code and the letters under it. White card, because the camera is the
 *  reader here and a QR on a dark panel does not scan. */
function QrCard({ qr, room }: { qr: QrPath; room: string }) {
  // The quiet zone lives in the viewBox rather than in CSS padding, so it is
  // always exactly four modules wide however many modules the code turns out to
  // have. Padding in px would drift with the code's version.
  const span = qr.size + NET_QR_QUIET_MODULES * 2
  const px = Math.round(NET_QR_CODE_PX * (span / qr.size))

  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <svg
        width={px}
        height={px}
        viewBox={`${-NET_QR_QUIET_MODULES} ${-NET_QR_QUIET_MODULES} ${span} ${span}`}
        // Without this the modules are antialiased into grey fringes at their
        // edges, which is precisely the contrast a scanner is thresholding on.
        shapeRendering="crispEdges"
        // The room id underneath carries the same information as text, so there
        // is nothing here for a reader to miss.
        aria-hidden="true"
        // The exact string encoded, under ?debug=1 only, because it cannot be
        // read back out of the path and it is the one value in this whole flow
        // that fails silently: a wrong host, port or scheme in here is a camera
        // pointed at a dead end, and the code still looks perfectly scannable.
        // Same rule as everywhere else in the project -- assert on the value, not
        // on the pixels.
        data-join={DEBUG ? qr.text : undefined}
        style={{ display: 'block', borderRadius: 14, background: '#ffffff' }}
      >
        <rect x={-NET_QR_QUIET_MODULES} y={-NET_QR_QUIET_MODULES} width={span} height={span} fill="#ffffff" />
        {/* One path for the whole code, which is the entire reason qrPath
            returns a `d`. A rect per module is 1089 nodes for React to
            reconcile on a screen that also has to answer a tap. */}
        <path d={qr.d} fill="#12180f" />
      </svg>
      <RoomCode room={room} />
    </div>
  )
}

/** Large, wide-tracked and monospace, because it is read aloud across a room
 *  and typed in by hand when the camera will not cooperate. */
function RoomCode({ room }: { room: string }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 52,
        fontWeight: 800,
        lineHeight: 1,
        // Tracking, plus the same amount of left padding to cancel the trailing
        // space letter-spacing leaves after the last glyph. Otherwise the code
        // sits visibly left of the card above it.
        letterSpacing: '0.2em',
        paddingLeft: '0.2em',
        color: '#ffd98a',
        textShadow: '0 2px 10px rgba(0,0,0,0.5)',
      }}
    >
      {room}
    </div>
  )
}

/**
 * One button on this screen.
 *
 * `onPointerDown`, never `onClick`, so the tap registers on the press. No
 * press-scale decoration and therefore no held-pointer latch, deliberately: a
 * latch that is set and then stranded by a throw leaves the button dead for the
 * rest of the session, and the feedback inside 100ms is already there for free
 * because every tap on this screen changes what the screen is showing.
 *
 * No `setPointerCapture` anywhere. It throws NotFoundError when iOS has already
 * claimed the touch for a system gesture, and on `Play by myself` that is the
 * one failure this screen must not have.
 */
function Btn({ label, onTap, primary }: { label: string; onTap: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      className="no-touch-scroll"
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onTap()
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        height: 62,
        padding: '0 34px',
        borderRadius: 18,
        border: primary ? '3px solid rgba(255,255,255,0.55)' : '2px solid rgba(255,217,138,0.5)',
        background: primary
          ? 'linear-gradient(180deg, #e8a13a 0%, #c9721f 100%)'
          : 'rgba(255,217,138,0.13)',
        color: primary ? '#2a1a06' : '#ffd98a',
        // A <button> does not inherit the page font, and the `font:` shorthand
        // cannot name `inherit` as a family: that form is dropped whole and
        // silently lands at 16px/400. Separate properties, always.
        fontFamily: 'inherit',
        fontSize: 23,
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: '0.01em',
        boxShadow: primary ? '0 6px 18px rgba(0,0,0,0.45)' : 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
