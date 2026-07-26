import { useEffect, useState } from 'react'
import { CEREMONY_AUTO_DISMISS, CEREMONY_LINE_DELAY } from '../game/constants'
import {
  CEREMONY_CALL,
  CEREMONY_DISMISS,
  CEREMONY_PRAISE,
  CEREMONY_WELCOME,
  ceremonyRename,
} from '../content/lines'
import { useGame, type Ceremony as CeremonyState } from '../game/store'

/**
 * The warrior name ceremony. DOM over the canvas like CreateCat, so it costs
 * zero draw calls and zero triangles.
 *
 * Deliberately not a `phase`: PlayerCat, Prey and the whole HUD gate on
 * `phase === 'playing'`, so a fourth phase would freeze the world underneath
 * instead of dimming it. The store keeps `ceremony` as its own field and the
 * game keeps running behind the dim.
 */
export function Ceremony() {
  const ceremony = useGame((s) => s.ceremony)
  if (!ceremony) return null
  // Keyed so a second ceremony would always replay from its first line rather
  // than inherit the last one's finished state.
  return <CeremonyCard key={ceremony.id} ceremony={ceremony} />
}

/** 0 the opening line, 1 the praise, 2 the name and everything after it. */
type Step = 0 | 1 | 2

function CeremonyCard({ ceremony }: { ceremony: CeremonyState }) {
  const endCeremony = useGame((s) => s.endCeremony)
  const [step, setStep] = useState<Step>(0)

  useEffect(() => {
    const gap = CEREMONY_LINE_DELAY * 1000
    const t1 = window.setTimeout(() => setStep((s) => (s < 1 ? 1 : s)), gap)
    const t2 = window.setTimeout(() => setStep((s) => (s < 2 ? 2 : s)), gap * 2)
    // She can never be stranded on this screen. If the tap never comes it
    // closes itself and hands her back the joystick.
    const t3 = window.setTimeout(endCeremony, CEREMONY_AUTO_DISMISS * 1000)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [endCeremony])

  // A tap before the reveal skips ahead to the name rather than dismissing, so
  // the worst an impatient finger can do is skip two seconds of text. That is
  // also the guard against a stray tap closing the ceremony before she reads it.
  const tap = () => {
    if (step < 2) setStep(2)
    else endCeremony()
  }

  const revealed = step >= 2

  return (
    <div
      className="no-touch-scroll"
      onPointerDown={tap}
      style={{
        position: 'fixed',
        inset: 0,
        // Above the toast (40), below the debug overlay (50) so verification
        // can still read fps and draw calls with the ceremony up.
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        paddingLeft: 'calc(28px + var(--safe-left))',
        paddingRight: 'calc(28px + var(--safe-right))',
        textAlign: 'center',
        // Dims the forest without hiding it: she should still see her own cat
        // standing in the clearing while this reads.
        background:
          'radial-gradient(ellipse at 50% 45%, rgba(16,26,13,0.74) 0%, rgba(8,13,6,0.93) 72%)',
        cursor: 'pointer',
      }}
    >
      <Line show={step >= 0} size={25}>
        {CEREMONY_CALL}
      </Line>
      <Line show={step >= 1} size={25}>
        {CEREMONY_PRAISE}
      </Line>

      <Rule show={revealed} />

      <Line show={revealed} size={21} dim>
        {ceremonyRename(ceremony.from)}
      </Line>

      {/* The payoff. Same gold as the name on the creation sheet, larger,
          scaling in so it arrives rather than appears. A CSS transition, not a
          keyframe: the element mounts at the small value and the step change
          moves it, so there is nothing to add to index.css. */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '0.01em',
          color: '#ffd98a',
          textShadow: '0 3px 22px rgba(255,190,80,0.35), 0 2px 10px rgba(0,0,0,0.6)',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'scale(1)' : 'scale(0.82)',
          transition: 'opacity 380ms ease, transform 520ms cubic-bezier(0.2,0.9,0.3,1.25)',
        }}
      >
        {ceremony.to}
      </div>

      <Rule show={revealed} />

      <Line show={revealed} size={25}>
        {CEREMONY_WELCOME}
      </Line>

      <button
        onPointerDown={tap}
        style={{
          marginTop: 10,
          minHeight: 52,
          padding: '14px 40px',
          borderRadius: 26,
          border: '2px solid rgba(255,217,138,0.55)',
          background: 'rgba(255,217,138,0.14)',
          color: '#ffd98a',
          // A <button> does not inherit the page font, and the `font:`
          // shorthand cannot name `inherit` as a family. Both properties are
          // set separately for exactly that reason.
          fontFamily: 'inherit',
          fontSize: 21,
          fontWeight: 800,
          lineHeight: 1,
          opacity: revealed ? 1 : 0,
          // Hidden and untappable until the name has landed, so the button can
          // never dismiss a ceremony she has not seen yet.
          pointerEvents: revealed ? 'auto' : 'none',
          transition: 'opacity 380ms ease',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        {CEREMONY_DISMISS}
      </button>
    </div>
  )
}

/** One line of the ceremony, fading in when its turn comes. */
function Line({
  show,
  size,
  dim,
  children,
}: {
  show: boolean
  size: number
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        maxWidth: 640,
        fontSize: size,
        fontWeight: dim ? 500 : 600,
        lineHeight: 1.35,
        color: '#f4efe2',
        opacity: show ? (dim ? 0.72 : 0.94) : 0,
        transform: show ? 'translateY(0)' : 'translateY(7px)',
        transition: 'opacity 420ms ease, transform 420ms ease',
      }}
    >
      {children}
    </div>
  )
}

/** Gold hairline framing the name. Purely decorative. */
function Rule({ show }: { show: boolean }) {
  return (
    <div
      style={{
        width: 200,
        height: 2,
        borderRadius: 1,
        background:
          'linear-gradient(90deg, rgba(255,217,138,0) 0%, rgba(255,217,138,0.6) 50%, rgba(255,217,138,0) 100%)',
        opacity: show ? 1 : 0,
        transition: 'opacity 520ms ease',
      }}
    />
  )
}
