import { useEffect, useRef } from 'react'
import { HUNGER_LOW_THRESHOLD, NEED_MAX, TOAST_DURATION } from '../game/constants'
import { live } from '../game/live'
import { useGame } from '../game/store'
import { input, useTouchInput } from '../input/useTouchInput'
import { ActionButton } from './ActionButton'
import { Joystick } from './Joystick'

/**
 * Plain DOM over the canvas, never in WebGL.
 *
 * One rAF loop writes bar widths, the joystick transform and the button label
 * straight into style properties. Nothing here re-renders per frame, so the
 * HUD costs the React tree nothing while the game is running.
 */
export function Hud() {
  // The bars and buttons are hidden outside play so they never sit on top of
  // the title or the creation sheet. The input layer below stays mounted
  // regardless: useTouchInput binds to it once, and unmounting it would drop
  // the listeners the joystick depends on.
  const playing = useGame((s) => s.phase === 'playing')
  const layerRef = useRef<HTMLDivElement>(null)
  const healthFill = useRef<HTMLDivElement>(null)
  const hungerFill = useRef<HTMLDivElement>(null)
  const hungerPill = useRef<HTMLDivElement>(null)
  const stickBase = useRef<HTMLDivElement>(null)
  const stickKnob = useRef<HTMLDivElement>(null)
  const actionLabel = useRef<HTMLDivElement>(null)
  const vignette = useRef<HTMLDivElement>(null)

  useTouchInput(layerRef)

  useEffect(() => {
    let raf = 0
    let lastLabel = ''

    const tick = () => {
      raf = requestAnimationFrame(tick)

      const h = live.health / NEED_MAX
      const f = live.hunger / NEED_MAX
      if (healthFill.current) healthFill.current.style.transform = `scaleX(${h})`
      if (hungerFill.current) hungerFill.current.style.transform = `scaleX(${f})`

      // Low hunger pulses the pill and dims the screen edge. Readable across a room.
      const low = live.hunger <= HUNGER_LOW_THRESHOLD
      if (hungerPill.current) {
        hungerPill.current.style.opacity = low
          ? String(0.72 + 0.28 * Math.abs(Math.sin(performance.now() / 320)))
          : '1'
      }
      if (vignette.current) {
        const urgency = low ? 1 - live.hunger / HUNGER_LOW_THRESHOLD : 0
        vignette.current.style.opacity = String(urgency * 0.5)
      }

      if (stickBase.current) {
        stickBase.current.style.opacity = input.stickActive ? '1' : '0'
        if (input.stickActive) {
          stickBase.current.style.transform = `translate(${input.stickOriginX}px, ${input.stickOriginY}px)`
        }
      }
      if (stickKnob.current) {
        stickKnob.current.style.transform = `translate(${input.stickKnobX}px, ${input.stickKnobY}px)`
      }

      if (actionLabel.current) {
        const label = live.cat.action === 'crouch' ? 'Pounce!' : 'Stalk'
        if (label !== lastLabel) {
          lastLabel = label
          const sub = actionLabel.current.lastElementChild as HTMLElement | null
          if (sub) sub.textContent = label
        }
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <div
        ref={layerRef}
        className="no-touch-scroll"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10,
        }}
      />

      {playing && (
        <>
          <div
            ref={vignette}
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              opacity: 0,
              background:
                'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(90,20,10,0.85) 100%)',
              zIndex: 15,
              transition: 'opacity 300ms linear',
            }}
          />

          <div
            style={{
              position: 'fixed',
              top: 'calc(18px + var(--safe-top))',
              left: 'calc(20px + var(--safe-left))',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              pointerEvents: 'none',
              zIndex: 25,
            }}
          >
            <NeedBar icon="❤️" color="#e05a48" fillRef={healthFill} />
            <NeedBar icon="🐭" color="#e0a038" fillRef={hungerFill} pillRef={hungerPill} />
          </div>

          <Joystick baseRef={stickBase} knobRef={stickKnob} />
          <ActionButton labelRef={actionLabel} />
        </>
      )}

      <Toast />
    </>
  )
}

interface NeedBarProps {
  icon: string
  color: string
  fillRef: React.RefObject<HTMLDivElement>
  pillRef?: React.RefObject<HTMLDivElement>
}

function NeedBar({ icon, color, fillRef, pillRef }: NeedBarProps) {
  return (
    <div ref={pillRef} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          fontSize: 26,
          width: 34,
          textAlign: 'center',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          width: 208,
          height: 26,
          borderRadius: 13,
          background: 'rgba(12,20,10,0.55)',
          border: '3px solid rgba(255,255,255,0.5)',
          overflow: 'hidden',
          boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
        }}
      >
        <div
          ref={fillRef}
          style={{
            width: '100%',
            height: '100%',
            background: color,
            transformOrigin: 'left center',
            transform: 'scaleX(1)',
            borderRadius: 10,
          }}
        />
      </div>
    </div>
  )
}

/** Short confirmation beats. Re-renders only when a toast changes, never per frame. */
function Toast() {
  const toast = useGame((s) => s.toast)
  const clearToast = useGame((s) => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => clearToast(toast.id), TOAST_DURATION * 1000)
    return () => window.clearTimeout(id)
  }, [toast, clearToast])

  if (!toast) return null
  return (
    <div
      key={toast.id}
      style={{
        position: 'fixed',
        top: 'calc(26px + var(--safe-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 26px',
        borderRadius: 22,
        background: 'rgba(18,28,14,0.82)',
        border: '2px solid rgba(255,255,255,0.35)',
        // Not `font: '600 20px/1 inherit'`: `inherit` is not a legal family
        // inside the shorthand, so that form is dropped entirely and lands at
        // 16px/400.
        fontSize: 20,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: '0.01em',
        pointerEvents: 'none',
        zIndex: 40,
        animation: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {toast.text}
    </div>
  )
}
