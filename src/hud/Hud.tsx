import { useEffect, useRef } from 'react'
import {
  HEALTH_BAR_EASE,
  HUNGER_LOW_THRESHOLD,
  NEED_MAX,
  RIVAL_START_HEALTH,
} from '../game/constants'
import { RIVAL_NAME } from '../content/lines'
import { DEBUG } from '../debug/expose'
import { live } from '../game/live'
import { useGame } from '../game/store'
import { input, useTouchInput } from '../input/useTouchInput'
import { ActionButton } from './ActionButton'
import { DuelControls } from './DuelControls'
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
  const rivalPill = useRef<HTMLDivElement>(null)
  const rivalFill = useRef<HTMLDivElement>(null)
  const fightBtn = useRef<HTMLButtonElement>(null)
  const moveGrid = useRef<HTMLDivElement>(null)
  const actionBtn = useRef<HTMLButtonElement>(null)

  useTouchInput(layerRef)

  useEffect(() => {
    let raf = 0
    let lastLabel = ''
    let lastT = performance.now()
    // What the bars are DRAWING, chasing what the game says. A hit takes 30
    // points off in one frame, and a bar that jump-cuts reads as a glitch
    // rather than as damage. Purely presentational, so it lives here in the
    // HUD and never touches `live`.
    let shownHealth = live.health
    let shownRival = live.rival.health

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000))
      lastT = now
      const k = 1 - Math.exp(-HEALTH_BAR_EASE * dt)
      shownHealth += (live.health - shownHealth) * k
      shownRival += (live.rival.health - shownRival) * k

      const h = shownHealth / NEED_MAX
      const f = live.hunger / NEED_MAX
      if (healthFill.current) healthFill.current.style.transform = `scaleX(${h})`
      if (hungerFill.current) hungerFill.current.style.transform = `scaleX(${f})`
      if (rivalFill.current) {
        rivalFill.current.style.transform = `scaleX(${Math.max(0, shownRival / RIVAL_START_HEALTH)})`
      }

      // Duel chrome. All of it is driven from `live` here rather than from the
      // store, so walking in and out of range costs zero React re-renders.
      const duelling = live.duel.active
      if (rivalPill.current) {
        rivalPill.current.style.opacity = duelling ? '1' : '0'
      }
      if (fightBtn.current) {
        const show = live.duel.inRange
        fightBtn.current.style.opacity = show ? '1' : '0'
        fightBtn.current.style.pointerEvents = show ? 'auto' : 'none'
      }
      if (moveGrid.current) {
        moveGrid.current.style.opacity = duelling ? '1' : '0'
        moveGrid.current.style.pointerEvents = duelling ? 'auto' : 'none'
      }
      if (actionBtn.current) {
        // No stalking mice mid-fight. Hidden rather than disabled: a dead
        // button she can still press is worse than one that is not there.
        actionBtn.current.style.opacity = duelling ? '0' : '1'
        actionBtn.current.style.pointerEvents = duelling ? 'none' : 'auto'
      }

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

          {/* The opponent bar, mirrored into the opposite corner so the two are
              never confusable, and faded in only while a duel is running. */}
          <div
            ref={rivalPill}
            style={{
              position: 'fixed',
              // Dropped clear of the debug overlay, which owns the top-right
              // corner under ?debug=1. Her build has no overlay and gets the
              // corner, mirroring the player's bars in the opposite one.
              top: DEBUG ? 'calc(262px + var(--safe-top))' : 'calc(18px + var(--safe-top))',
              right: 'calc(20px + var(--safe-right))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 220ms ease-out',
              zIndex: 25,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textShadow: '0 2px 4px rgba(0,0,0,0.7)',
              }}
            >
              {RIVAL_NAME}
            </div>
            <NeedBar icon="🐱" color="#b96be0" fillRef={rivalFill} mirrored />
          </div>

          <Joystick baseRef={stickBase} knobRef={stickKnob} />
          <ActionButton labelRef={actionLabel} btnRef={actionBtn} />
          <DuelControls fight={fightBtn} moves={moveGrid} />
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
  /** Icon on the right and the bar draining rightward, for the opposite corner. */
  mirrored?: boolean
}

function NeedBar({ icon, color, fillRef, pillRef, mirrored }: NeedBarProps) {
  return (
    <div
      ref={pillRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexDirection: mirrored ? 'row-reverse' : 'row',
      }}
    >
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
            transformOrigin: mirrored ? 'right center' : 'left center',
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
    const id = window.setTimeout(() => clearToast(toast.id), toast.duration * 1000)
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
        lineHeight: 1.32,
        letterSpacing: '0.01em',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 40,
        animation: 'none',
        // pre-line, not nowrap: a landmark toast carries a name and two lines of
        // journal entry separated by \n. Every other toast is a single line with
        // no newline in it, so none of them wrap or change shape.
        whiteSpace: 'pre-line',
      }}
    >
      {toast.text}
    </div>
  )
}
