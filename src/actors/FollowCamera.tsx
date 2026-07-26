import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CAM_DISTANCE,
  CAM_FOLLOW_LAG,
  CAM_HEIGHT,
  CAM_LOOK_HEIGHT,
  CAM_MIN_GROUND_CLEARANCE,
  CAM_ORBIT_SENSITIVITY,
  CAM_PITCH_MAX,
  CAM_PITCH_MIN,
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

    const dist = creating ? CREATE_CAM_DISTANCE : CAM_DISTANCE
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

    if (live.camera.snap) {
      live.camera.snap = false
      camera.position.copy(_target)
    } else {
      const t = 1 - Math.exp(-CAM_FOLLOW_LAG * delta)
      camera.position.lerp(_target, t)
    }

    _look.set(p.x, p.y + lookHeight, p.z)
    camera.lookAt(_look)
  })

  return null
}
