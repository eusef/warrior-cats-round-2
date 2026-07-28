import { RefObject, useCallback, useEffect, useRef } from 'react'
import { ACTION_BUTTON_SIZE, HUD_EDGE_MARGIN_X, HUD_EDGE_MARGIN_Y } from '../game/constants'
import { setActionHeld } from '../input/useTouchInput'

interface Props {
  labelRef: RefObject<HTMLDivElement>
  /** Lets the HUD's rAF loop hide the button during a duel. */
  btnRef?: RefObject<HTMLButtonElement>
}

/**
 * One button, two verbs: hold to crouch and stalk, release to pounce.
 *
 * Sat clear of the home indicator, which is not a nicety: see
 * HUD_EDGE_MARGIN_Y, and see the comment in press() for what iPadOS competing
 * for this touch used to do to the button.
 */
export function ActionButton({ labelRef, btnRef }: Props) {
  const ownRef = useRef<HTMLButtonElement>(null)
  const ref = btnRef ?? ownRef
  const heldPointer = useRef<number | null>(null)

  const press = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (heldPointer.current !== null) return
    // Engage FIRST, decorate after. setPointerCapture used to be called on the
    // line above this one and it THROWS NotFoundError whenever the pointer is
    // no longer active by the time the handler runs -- which on iOS is exactly
    // what happens when the touch has already been claimed by a system gesture,
    // and this button sits in the home-indicator strip along the bottom edge.
    // The throw left heldPointer set but setActionHeld unreached, so the button
    // was both dead on that tap and, because of the guard above, dead on every
    // tap afterwards. That is the whole of "the Stalk button is hard to press".
    //
    // Capture is gone rather than wrapped: the window listener below catches
    // the release wherever the finger lifts, which is the thing capture was
    // for, and it cannot throw.
    heldPointer.current = e.pointerId
    setActionHeld(true)
    ref.current?.style.setProperty('transform', 'scale(0.92)')
  }, [])

  const release = useCallback((e: { pointerId: number }) => {
    if (heldPointer.current !== e.pointerId) return
    heldPointer.current = null
    ref.current?.style.setProperty('transform', 'scale(1)')
    setActionHeld(false)
  }, [])

  // The backstop, and it is not optional.
  //
  // The press guard above refuses a new touch while one is already held, and
  // until this existed the ONLY things that cleared that were pointerup and
  // pointercancel ON THE BUTTON. iOS Safari does not reliably deliver either:
  // a thumb that slides off the circle mid-hold lifts somewhere else entirely,
  // and WebKit releases pointer capture on its own often enough that the
  // capture call cannot be trusted to bring the event back.
  //
  // Miss one release and heldPointer stays set for the rest of the session:
  // the button is dead, and setActionHeld(true) stays latched so the cat is
  // stuck crouching at CAT_CROUCH_SPEED_MULT with nothing on screen to say why.
  // Listening on window is the same thing useTouchInput does for the joystick,
  // and for the same reason.
  useEffect(() => {
    const up = (e: PointerEvent) => release(e)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [release])

  return (
    <button
      ref={ref}
      className="no-touch-scroll"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        right: `calc(${HUD_EDGE_MARGIN_X}px + var(--safe-right))`,
        bottom: `calc(${HUD_EDGE_MARGIN_Y}px + var(--safe-bottom))`,
        width: ACTION_BUTTON_SIZE,
        height: ACTION_BUTTON_SIZE,
        borderRadius: '50%',
        border: '4px solid rgba(255,255,255,0.55)',
        background: 'radial-gradient(circle at 35% 30%, #d8a24e, #a9631f)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        color: '#fffaf0',
        // A button does not inherit the page font on its own, and the `font:`
        // shorthand cannot take `inherit` as its family: that form is invalid
        // and gets dropped, which is how this label sat at 16px/400 system
        // sans instead of the rounded game face.
        fontFamily: 'inherit',
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1.1,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 80ms ease-out',
        zIndex: 30,
        touchAction: 'none',
        cursor: 'pointer',
      }}
    >
      <div ref={labelRef} style={{ textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 30, lineHeight: 1 }}>🐾</div>
        <div style={{ marginTop: 4 }}>Stalk</div>
      </div>
    </button>
  )
}
