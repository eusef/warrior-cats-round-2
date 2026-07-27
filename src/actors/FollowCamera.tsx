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
 * Orbit-behind camera. `live.camera.yaw` is an absolute world yaw driven only
 * by the right-half drag, never auto-aligned, because a camera that fights the
 * player's thumb feels broken. The cat's movement is resolved relative to this
 * yaw, which is what makes joystick-up always mean "away from the camera".
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

    if (creating) {
      // Nothing to consume: creation ignores the finger entirely, so a stray
      // drag on the sheet can never spin the view she is choosing against.
      live.camera.yaw += CREATE_CAM_ORBIT_SPEED * delta
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

    // The camera eases back a little as she gets up to speed and closes again
    // when she stops. Creation is exempt: that framing is composed against a
    // fixed distance and a dolly would break it.
    if (creating) {
      dolly.current = CREATE_CAM_DISTANCE
    } else {
      const target =
        CAM_DISTANCE + CAM_SPEED_DOLLY * clamp(live.cat.speed / CAT_RUN_SPEED, 0, 1)
      dolly.current += (target - dolly.current) * (1 - Math.exp(-CAM_DOLLY_LAG * delta))
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

    // Never let the camera sink into a hill.
    const clearance = creating ? CREATE_CAM_MIN_CLEARANCE : CAM_MIN_GROUND_CLEARANCE
    const floor = groundHeightAt(_target.x, _target.z) + clearance
    if (_target.y < floor) _target.y = floor

    _look.set(p.x, p.y + lookHeight, p.z)

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
