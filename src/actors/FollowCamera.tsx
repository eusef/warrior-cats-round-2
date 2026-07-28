import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CAM_DISTANCE,
  CAM_DOLLY_LAG,
  CAM_FOLLOW_LAG,
  CAM_HEIGHT,
  CAM_LOOK_HEIGHT,
  CAM_LOOK_LAG,
  CAM_MIN_GROUND_CLEARANCE,
  CAM_ORBIT_SENSITIVITY,
  CAM_PITCH_MAX,
  CAM_PITCH_MIN,
  CAM_SPEED_DOLLY,
  CAT_RUN_SPEED,
  CREATE_CAM_DISTANCE,
  CREATE_CAM_HEIGHT,
  CREATE_CAM_LOOK_HEIGHT,
  CREATE_CAM_MIN_CLEARANCE,
  DUEL_CAM_LOCK_LAG,
  DUEL_CAM_SIDE_DISTANCE,
  DUEL_CAM_SIDE_GAP_DOLLY,
  DUEL_CAM_SIDE_HEIGHT,
  DUEL_CAM_SIDE_LOOK_HEIGHT,
  DUEL_CAM_SIDE_MAX_DISTANCE,
  CREATE_CAM_ORBIT_SPEED,
} from '../game/constants'
import { live } from '../game/live'
import { useGame } from '../game/store'
import { clamp, groundHeightAt } from '../game/terrain'
import { input } from '../input/useTouchInput'

// Hoisted: nothing is allocated inside the frame loop.
const _target = new THREE.Vector3()
const _look = new THREE.Vector3()

/**
 * Orbit-behind camera, plus the ringside rig a duel switches to.
 *
 * Out of a fight, `live.camera.yaw` is an absolute world yaw driven only by the
 * right-half drag, never auto-aligned, because a camera that fights the
 * player's thumb feels broken. The cat's movement is resolved relative to this
 * yaw, which is what makes joystick-up always mean "away from the camera".
 *
 * In a fight the thumb loses the yaw, and that is the one place this file
 * contradicts the paragraph above. It is deliberate: the fight runs on a fixed
 * line and the controls are left and right along it, so a camera the player
 * could spin would make "left" mean something different every few seconds. The
 * drag is consumed and discarded exactly the way the creation screen does it,
 * rather than left to accumulate and snap the view the moment the fight ends.
 *
 * The two rigs are blended by `live.duel.lock`, not switched between, so there
 * is no cut in either direction. While the fight runs, `live.camera.yaw` is
 * written to match where the ringside camera actually is, so when lock fades
 * back to 0 the follow rig is already pointing there and nothing swings.
 */
export function FollowCamera() {
  const camera = useThree((s) => s.camera)
  // The aim point the camera is actually looking at, chasing the cat rather
  // than nailed to her. Kept here so it survives a re-render.
  const look = useRef(new THREE.Vector3()).current
  const dolly = useRef(CAM_DISTANCE)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const creating = useGame.getState().phase === 'create'

    // Ringside from the frame the stage is laid out until the frame it is torn
    // down, which includes the yield beat at the end of a fight and excludes a
    // flee: running away hands the follow camera straight back.
    const staged = live.duel.onStage && live.rival.active

    if (creating) {
      // Nothing to consume: creation ignores the finger entirely, so a stray
      // drag on the sheet can never spin the view she is choosing against.
      live.camera.yaw += CREATE_CAM_ORBIT_SPEED * delta
      input.lookDX = 0
      input.lookDY = 0
    } else if (staged) {
      // Same treatment, same reason: the fight's own controls own the screen
      // axes now. Zeroed rather than ignored, or the drag would bank up and
      // spin the view the instant the fight ended.
      input.lookDX = 0
      input.lookDY = 0
    } else if (input.lookDX !== 0 || input.lookDY !== 0) {
      // Consume the accumulated drag.
      live.camera.yaw -= input.lookDX * CAM_ORBIT_SENSITIVITY
      live.camera.pitch = clamp(
        live.camera.pitch + input.lookDY * CAM_ORBIT_SENSITIVITY,
        CAM_PITCH_MIN,
        CAM_PITCH_MAX,
      )
      input.lookDX = 0
      input.lookDY = 0
    }

    live.duel.lock += ((staged ? 1 : 0) - live.duel.lock) * (1 - Math.exp(-DUEL_CAM_LOCK_LAG * delta))
    const lock = live.duel.lock

    // The camera eases back a little as she gets up to speed and closes again
    // when she stops. Creation is exempt: that framing is composed against a
    // fixed distance and a dolly would break it.
    if (creating) {
      dolly.current = CREATE_CAM_DISTANCE
    } else {
      const speedTarget =
        CAM_DISTANCE + CAM_SPEED_DOLLY * clamp(live.cat.speed / CAT_RUN_SPEED, 0, 1)
      dolly.current += (speedTarget - dolly.current) * (1 - Math.exp(-CAM_DOLLY_LAG * delta))
    }

    const dist = dolly.current
    const height = creating ? CREATE_CAM_HEIGHT : CAM_HEIGHT
    const lookHeight = creating ? CREATE_CAM_LOOK_HEIGHT : CAM_LOOK_HEIGHT

    const yaw = live.camera.yaw
    const pitch = creating ? 0 : live.camera.pitch
    const p = live.cat.pos

    const horiz = dist * Math.cos(pitch)
    _target.set(
      p.x + Math.sin(yaw) * horiz,
      p.y + height + dist * Math.sin(pitch),
      p.z + Math.cos(yaw) * horiz,
    )
    _look.set(p.x, p.y + lookHeight, p.z)

    // --- ringside -----------------------------------------------------------
    // Out on the perpendicular, looking back down the fight line at the two
    // cats. Both the eye and the aim point are blended in by `lock` rather than
    // switched to, so the move into and out of a fight is the same eased
    // handover the soft lock-on used to be, and it still cannot cut.
    if (lock > 0.001) {
      const s = live.duel.stage
      const rp = live.rival.pos
      const midX = (p.x + rp.x) * 0.5
      const midZ = (p.z + rp.z) * 0.5
      const midY = (p.y + rp.y) * 0.5
      // Pull back with the gap so a jump-kick's whole approach stays in frame,
      // and cap it so the two cats never shrink to specks on a wide stage.
      const gap = Number.isFinite(live.duel.gap) ? live.duel.gap : 0
      const side = Math.min(
        DUEL_CAM_SIDE_DISTANCE + DUEL_CAM_SIDE_GAP_DOLLY * gap,
        DUEL_CAM_SIDE_MAX_DISTANCE,
      )
      // The perpendicular, on the side chosen when the stage was laid out. This
      // is the same vector `lateralOf` measures against, which is what keeps
      // the camera and the left/right controls agreeing on which way is which.
      const px = -s.az * live.duel.camSide
      const pz = s.ax * live.duel.camSide
      const eyeX = midX + px * side
      const eyeZ = midZ + pz * side

      _target.x += (eyeX - _target.x) * lock
      _target.y += (midY + DUEL_CAM_SIDE_HEIGHT - _target.y) * lock
      _target.z += (eyeZ - _target.z) * lock
      _look.x += (midX - _look.x) * lock
      _look.y += (midY + DUEL_CAM_SIDE_LOOK_HEIGHT - _look.y) * lock
      _look.z += (midZ - _look.z) * lock

      // Keep the follow rig's yaw pointing where the camera actually ended up.
      // Costs one atan2 a frame and buys the whole exit: when the fight closes
      // and lock fades, the follow target is already under the camera and there
      // is nothing left to unwind, so the view does not swing back.
      live.camera.yaw = Math.atan2(_target.x - p.x, _target.z - p.z)
    }

    // Never let the camera sink into a hill. After the blend, not before, so it
    // applies to whichever rig is actually driving this frame.
    const clearance = creating ? CREATE_CAM_MIN_CLEARANCE : CAM_MIN_GROUND_CLEARANCE
    const floor = groundHeightAt(_target.x, _target.z) + clearance
    if (_target.y < floor) _target.y = floor

    if (live.camera.snap) {
      live.camera.snap = false
      camera.position.copy(_target)
      look.copy(_look)
      dolly.current = dist
    } else {
      const t = 1 - Math.exp(-CAM_FOLLOW_LAG * delta)
      camera.position.lerp(_target, t)
      // The aim point lags too. The position already eased; the lookAt was
      // exact, and an exact lookAt is what made a hard turn feel like the
      // scenery was on a turntable. Creation snaps: the cat does not move
      // there, so lag can only smear the composed framing.
      if (creating) look.copy(_look)
      else look.lerp(_look, 1 - Math.exp(-CAM_LOOK_LAG * delta))
    }

    live.camera.dist = dist
    camera.lookAt(look)
  })

  return null
}
