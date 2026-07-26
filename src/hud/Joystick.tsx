import { RefObject } from 'react'
import { JOYSTICK_RADIUS } from '../game/constants'

interface Props {
  baseRef: RefObject<HTMLDivElement>
  knobRef: RefObject<HTMLDivElement>
}

const BASE = JOYSTICK_RADIUS * 2

/**
 * Purely presentational. The stick spawns under whichever finger lands in the
 * left half of the screen, so there is nothing to aim at and nothing to miss.
 * Hud.tsx drives both refs from its rAF loop; this never re-renders.
 */
export function Joystick({ baseRef, knobRef }: Props) {
  return (
    <div
      ref={baseRef}
      className="no-touch-scroll"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: BASE,
        height: BASE,
        marginLeft: -BASE / 2,
        marginTop: -BASE / 2,
        borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.42)',
        background: 'rgba(20,32,16,0.24)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'none',
        opacity: 0,
        transition: 'opacity 120ms ease-out',
        willChange: 'transform, opacity',
        zIndex: 20,
      }}
    >
      <div
        ref={knobRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 62,
          height: 62,
          marginLeft: -31,
          marginTop: -31,
          borderRadius: '50%',
          background: 'rgba(255,248,232,0.9)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
