import { useEffect, useRef, type RefObject } from 'react'
import {
  ACTION_BUTTON_SIZE,
  DUEL_BUTTON_GAP,
  DUEL_BUTTON_SIZE,
  HUD_EDGE_MARGIN_X,
  HUD_EDGE_MARGIN_Y,
} from '../game/constants'
import {
  FIGHT_LABEL,
  MOVE_LABEL_FLEE,
  MOVE_LABEL_JUMPKICK,
  MOVE_LABEL_POUNCE,
  MOVE_LABEL_SWIPE,
} from '../content/lines'
import { tapDuelMove, tapFight, tapFlee, type DuelMove } from '../input/useTouchInput'

/**
 * The Fight prompt and the four duel buttons.
 *
 * Both are mounted for the whole of play and shown or hidden by the HUD's rAF
 * loop writing `opacity` and `pointerEvents`, never by React. Proximity to the
 * rival changes every frame, and a component that re-mounted on it would
 * re-render the HUD continuously for the length of a fight.
 *
 * Everything sits in the right half of the screen. The joystick has no fixed
 * home -- it spawns wherever a finger lands on the left -- so a button over
 * there would quietly eat movement area with nothing on screen to explain it.
 *
 * Layout, bottom-right, where the Stalk button sits outside a duel:
 *
 *     ( Jump-kick ) ( Pounce )
 *     (   Swipe   ) (  Run   )
 *
 * Run away is the corner cell: the shortest thumb reach on the whole screen.
 * That is deliberate and it is the safe direction to be wrong in. Mis-tapping
 * Run away ends a fight she can restart by walking back; mis-tapping an attack
 * when she meant to run is the one that would make her feel trapped.
 */

const GRID = DUEL_BUTTON_SIZE * 2 + DUEL_BUTTON_GAP
/** Stacked directly above the Stalk button with a 16px gutter. The Fight prompt
 *  and the four move buttons never coexist, but Fight and Stalk do. */
const FIGHT_BOTTOM = HUD_EDGE_MARGIN_Y + ACTION_BUTTON_SIZE + 16

export interface DuelControlRefs {
  fight: RefObject<HTMLButtonElement>
  moves: RefObject<HTMLDivElement>
}

export function DuelControls({ fight, moves }: DuelControlRefs) {
  return (
    <>
      <DuelButton
        btnRef={fight}
        label={FIGHT_LABEL}
        glyph="⚔️"
        onTap={tapFight}
        accent="attack"
        size={DUEL_BUTTON_SIZE}
        style={{
          right: `calc(${HUD_EDGE_MARGIN_X}px + var(--safe-right))`,
          bottom: `calc(${FIGHT_BOTTOM}px + var(--safe-bottom))`,
        }}
      />

      <div
        ref={moves}
        style={{
          position: 'fixed',
          right: `calc(${HUD_EDGE_MARGIN_X}px + var(--safe-right))`,
          bottom: `calc(${HUD_EDGE_MARGIN_Y}px + var(--safe-bottom))`,
          width: GRID,
          height: GRID,
          display: 'grid',
          gridTemplateColumns: `repeat(2, ${DUEL_BUTTON_SIZE}px)`,
          gridTemplateRows: `repeat(2, ${DUEL_BUTTON_SIZE}px)`,
          gap: DUEL_BUTTON_GAP,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 30,
        }}
      >
        <GridButton label={MOVE_LABEL_JUMPKICK} glyph="💥" move="jumpkick" accent="attack" />
        <GridButton label={MOVE_LABEL_POUNCE} glyph="🐾" move="pounce" accent="attack" />
        <GridButton label={MOVE_LABEL_SWIPE} glyph="✋" move="swipe" accent="attack" />
        <GridButton label={MOVE_LABEL_FLEE} glyph="🍃" onTap={tapFlee} accent="flee" />
      </div>
    </>
  )
}

function GridButton(props: {
  label: string
  glyph: string
  move?: DuelMove
  onTap?: () => void
  accent: Accent
}) {
  const { move, onTap, ...rest } = props
  return (
    <DuelButton
      {...rest}
      size={DUEL_BUTTON_SIZE}
      onTap={onTap ?? (() => (move ? tapDuelMove(move) : undefined))}
      // The grid parent owns visibility for all four at once, so the children
      // opt back in and let it do the hiding.
      style={{ position: 'relative', opacity: 1, pointerEvents: 'auto' }}
    />
  )
}

type Accent = 'attack' | 'flee'

const FILL: Record<Accent, string> = {
  attack: 'radial-gradient(circle at 35% 30%, #d8a24e, #a9631f)',
  // Muted green, so Run away never reads as one of the three attacks at a
  // glance. Colour is doing real work here: she is choosing under pressure.
  flee: 'radial-gradient(circle at 35% 30%, #7fa268, #3f6234)',
}

/**
 * One duel button. Copies ActionButton's touch contract exactly, because that
 * contract is what keeps a HUD tap from also spawning the joystick or starting
 * an orbit drag: the button sits above the input layer, so the pointerdown
 * hit-tests to it and never reaches the layer's listener at all, and
 * stopPropagation is belt and braces on top of that.
 */
function DuelButton({
  label,
  glyph,
  onTap,
  accent,
  size,
  btnRef,
  style,
}: {
  label: string
  glyph: string
  onTap: () => void
  accent: Accent
  size: number
  btnRef?: RefObject<HTMLButtonElement>
  style?: React.CSSProperties
}) {
  const own = useRef<HTMLButtonElement>(null)
  const ref = btnRef ?? own
  const heldPointer = useRef<number | null>(null)

  const press = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (heldPointer.current !== null) return
    heldPointer.current = e.pointerId
    // Fires on press, not release. Every action gets feedback inside 100ms, and
    // waiting for the finger to lift adds however long she holds it for.
    //
    // Called BEFORE anything that can throw, and there is no setPointerCapture
    // here for the same reason ActionButton no longer has one: it throws
    // NotFoundError when iOS has already claimed the touch for a system
    // gesture, which killed the tap and then every tap after it. On Run away
    // that is the one failure this design exists to make impossible.
    onTap()
    ref.current?.style.setProperty('transform', 'scale(0.92)')
  }

  const release = (e: { pointerId: number }) => {
    if (heldPointer.current !== e.pointerId) return
    heldPointer.current = null
    ref.current?.style.setProperty('transform', 'scale(1)')
  }

  // Same backstop as ActionButton, for the same reason: without it a missed
  // pointerup leaves heldPointer set and the button refuses every later tap
  // for the rest of the session. On Run away that is the one failure this
  // whole design is meant to make impossible.
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (heldPointer.current !== e.pointerId) return
      heldPointer.current = null
      ref.current?.style.setProperty('transform', 'scale(1)')
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [ref])

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
        width: size,
        height: size,
        borderRadius: '50%',
        border: '4px solid rgba(255,255,255,0.55)',
        background: FILL[accent],
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        color: '#fffaf0',
        // Never the `font:` shorthand: `inherit` is not a legal family inside
        // it, so the whole declaration is dropped and lands at 16px/400. A
        // <button> also does not inherit the page font without being told.
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.1,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 80ms ease-out',
        zIndex: 30,
        touchAction: 'none',
        cursor: 'pointer',
        opacity: 0,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <div style={{ fontSize: 26, lineHeight: 1 }}>{glyph}</div>
      <div style={{ marginTop: 3 }}>{label}</div>
    </button>
  )
}
