import { useEffect } from 'react'
import { JOYSTICK_DEADZONE, JOYSTICK_RADIUS } from '../game/constants'

/**
 * The single source of truth for input. One module-level mutable object that
 * every consumer reads from inside useFrame. Nothing here touches React state.
 *
 * Touch layout, landscape iPad:
 *   left half  - drag to move. The stick spawns wherever the finger lands.
 *   right half - drag to orbit the camera.
 *   action button (bottom right) - hold to crouch, release to pounce.
 */
export const input = {
  /** Normalised move vector. x = strafe right, y = forward. Magnitude <= 1. */
  move: { x: 0, y: 0 },
  /** Magnitude of `move`, precomputed because everything wants it. */
  moveMag: 0,

  /** Joystick visuals, CSS px. Read by <Joystick/> only. */
  stickActive: false,
  stickOriginX: 0,
  stickOriginY: 0,
  stickKnobX: 0,
  stickKnobY: 0,

  /** Camera orbit delta in px accumulated since the last frame. Consumed and zeroed by the camera. */
  lookDX: 0,
  lookDY: 0,

  /** True while the action button (or Space) is held. */
  action: false,
  /** Set true for one frame on the release edge. Consumed by PlayerCat. */
  actionReleased: false,

  // Duel taps. All three are latched edges rather than held states: a duel
  // move is a discrete commitment, and holding a button down through a
  // 1.2-second jump-kick must not queue a second one. PlayerCat consumes and
  // clears each of them, so a tap that arrives on a frame the game is not
  // playing is dropped rather than banked.
  /** The move whose button was last tapped, or null. */
  duelMove: null as DuelMove | null,
  /** The Fight prompt was tapped. */
  fightTap: false,
  /** Run away was tapped. Always honoured, whatever phase she is in. */
  fleeTap: false,
}

/** Mirrors MoveId in game/duel.ts. Declared locally so the input layer stays a
 *  leaf module that imports nothing but its own constants. */
export type DuelMove = 'swipe' | 'pounce' | 'jumpkick'

export function resetInput() {
  input.move.x = 0
  input.move.y = 0
  input.moveMag = 0
  input.stickActive = false
  input.lookDX = 0
  input.lookDY = 0
  input.action = false
  input.actionReleased = false
  input.duelMove = null
  input.fightTap = false
  input.fleeTap = false
}

/** Called by the four duel buttons, so touch and the debug hooks share one
 *  code path into the game exactly the way setActionHeld already does. */
export function tapDuelMove(move: DuelMove) {
  input.duelMove = move
}

export function tapFight() {
  input.fightTap = true
}

export function tapFlee() {
  input.fleeTap = true
}

/** Called by <ActionButton/> so touch and keyboard share one code path. */
export function setActionHeld(held: boolean) {
  if (input.action && !held) input.actionReleased = true
  input.action = held
}

let movePointer: number | null = null
let lookPointer: number | null = null
let lookLastX = 0
let lookLastY = 0

function applyStick(dx: number, dy: number) {
  const dist = Math.hypot(dx, dy)
  const clamped = Math.min(dist, JOYSTICK_RADIUS)
  const nx = dist > 0 ? (dx / dist) * clamped : 0
  const ny = dist > 0 ? (dy / dist) * clamped : 0
  input.stickKnobX = nx
  input.stickKnobY = ny

  let mag = clamped / JOYSTICK_RADIUS
  if (mag < JOYSTICK_DEADZONE) {
    input.move.x = 0
    input.move.y = 0
    input.moveMag = 0
    return
  }
  // Rescale past the deadzone so the first responsive pixel is a real 0.
  mag = (mag - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE)
  const dirX = dist > 0 ? dx / dist : 0
  const dirY = dist > 0 ? dy / dist : 0
  input.move.x = dirX * mag
  input.move.y = -dirY * mag // screen-down is backward
  input.moveMag = mag
}

function releaseStick() {
  movePointer = null
  input.stickActive = false
  input.move.x = 0
  input.move.y = 0
  input.moveMag = 0
  input.stickKnobX = 0
  input.stickKnobY = 0
}

/**
 * Installs the pointer handlers on the given layer element. The layer sits over
 * the canvas and under the HUD buttons, so buttons never steal a drag.
 */
export function useTouchInput(layerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const onDown = (e: PointerEvent) => {
      const leftHalf = e.clientX < window.innerWidth * 0.5
      if (leftHalf) {
        if (movePointer !== null) return
        movePointer = e.pointerId
        input.stickActive = true
        input.stickOriginX = e.clientX
        input.stickOriginY = e.clientY
        applyStick(0, 0)
      } else {
        if (lookPointer !== null) return
        lookPointer = e.pointerId
        lookLastX = e.clientX
        lookLastY = e.clientY
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerId === movePointer) {
        applyStick(e.clientX - input.stickOriginX, e.clientY - input.stickOriginY)
      } else if (e.pointerId === lookPointer) {
        input.lookDX += e.clientX - lookLastX
        input.lookDY += e.clientY - lookLastY
        lookLastX = e.clientX
        lookLastY = e.clientY
      }
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerId === movePointer) releaseStick()
      else if (e.pointerId === lookPointer) lookPointer = null
    }

    // Desktop convenience only. The iPad never sees these.
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.repeat) return
      let handled = true
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.f = down
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.b = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.l = down
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.r = down
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.fast = down
          break
        case 'Space':
          setActionHeld(down)
          break
        default:
          handled = false
      }
      if (handled) {
        e.preventDefault()
        applyKeys()
      }
    }
    const onKeyDown = onKey(true)
    const onKeyUp = onKey(false)

    layer.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      layer.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      releaseStick()
      lookPointer = null
    }
  }, [layerRef])
}

const keys = { f: false, b: false, l: false, r: false, fast: false }

function applyKeys() {
  if (movePointer !== null) return // a real finger always wins
  const x = (keys.r ? 1 : 0) - (keys.l ? 1 : 0)
  const y = (keys.f ? 1 : 0) - (keys.b ? 1 : 0)
  const mag = Math.hypot(x, y)
  if (mag === 0) {
    input.move.x = 0
    input.move.y = 0
    input.moveMag = 0
    return
  }
  const scale = keys.fast ? 1 : 0.45
  input.move.x = (x / mag) * scale
  input.move.y = (y / mag) * scale
  input.moveMag = scale
}
