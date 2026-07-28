import { RefObject, useCallback, useRef } from 'react'
import { setActionHeld } from '../input/useTouchInput'

interface Props {
  labelRef: RefObject<HTMLDivElement>
  /** Lets the HUD's rAF loop hide the button during a duel. */
  btnRef?: RefObject<HTMLButtonElement>
}

/**
 * One button, two verbs: hold to crouch and stalk, release to pounce.
 * 116px, well over the 44px touch minimum, sat above the home indicator.
 */
export function ActionButton({ labelRef, btnRef }: Props) {
  const ownRef = useRef<HTMLButtonElement>(null)
  const ref = btnRef ?? ownRef
  const heldPointer = useRef<number | null>(null)

  const press = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (heldPointer.current !== null) return
    heldPointer.current = e.pointerId
    ref.current?.setPointerCapture(e.pointerId)
    ref.current?.style.setProperty('transform', 'scale(0.92)')
    setActionHeld(true)
  }, [])

  const release = useCallback((e: React.PointerEvent) => {
    if (heldPointer.current !== e.pointerId) return
    heldPointer.current = null
    ref.current?.style.setProperty('transform', 'scale(1)')
    setActionHeld(false)
  }, [])

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
        right: 'calc(28px + var(--safe-right))',
        bottom: 'calc(28px + var(--safe-bottom))',
        width: 116,
        height: 116,
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
