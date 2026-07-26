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
} from '../game/constants'
import { live } from '../game/live'
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

    // Consume the accumulated drag.
    if (input.lookDX !== 0 || input.lookDY !== 0) {
      live.camera.yaw -= input.lookDX * CAM_ORBIT_SENSITIVITY
      live.camera.pitch = clamp(
        live.camera.pitch + input.lookDY * CAM_ORBIT_SENSITIVITY,
        CAM_PITCH_MIN,
        CAM_PITCH_MAX,
      )
      input.lookDX = 0
      input.lookDY = 0
    }

    const yaw = live.camera.yaw
    const pitch = live.camera.pitch
    const p = live.cat.pos

    const horiz = CAM_DISTANCE * Math.cos(pitch)
    _target.set(
      p.x + Math.sin(yaw) * horiz,
      p.y + CAM_HEIGHT + CAM_DISTANCE * Math.sin(pitch),
      p.z + Math.cos(yaw) * horiz,
    )

    // Never let the camera sink into a hill.
    const floor = groundHeightAt(_target.x, _target.z) + CAM_MIN_GROUND_CLEARANCE
    if (_target.y < floor) _target.y = floor

    const t = 1 - Math.exp(-CAM_FOLLOW_LAG * delta)
    camera.position.lerp(_target, t)

    _look.set(p.x, p.y + CAM_LOOK_HEIGHT, p.z)
    camera.lookAt(_look)
  })

  return null
}
