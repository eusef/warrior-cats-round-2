import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  CAT_GROUND_OFFSET,
  CAT_MODEL_YAW_OFFSET,
  CAT_SCALE,
  NET_REMOTE_CHASE,
  NET_REMOTE_SNAP_DIST,
  NET_REMOTE_SPEED_CHASE,
  NET_REMOTE_YAW_CHASE,
} from '../game/constants'
import { live, resetRemote } from '../game/live'
import { useGame } from '../game/store'
import { groundHeightAt } from '../game/terrain'
import { cloneCatSkin, paint } from './catSkin'
import { useCatAnimation } from './useCatAnimation'
import { useCatJuice, type JuiceContext } from './useCatJuice'

const MODEL_URL = '/models/Cat.glb'
useGLTF.preload(MODEL_URL)

/**
 * Hoisted. Nothing is allocated inside useFrame.
 *
 * This module's own copy, not an import. PlayerCat and RivalCat each declare
 * their own, and these are module singletons: three cats sharing one context
 * object happens to work only while every cat writes all five fields on every
 * frame, and it fails silently the moment one of those writes becomes
 * conditional. A per-module object cannot be got wrong that way.
 */
const _juice: JuiceContext = {
  action: 'idle',
  speed: 0,
  crouched: false,
  yawRate: 0,
  hopHeight: 0,
}

/**
 * The other child's cat, drawn from pose data her iPad sent over WebRTC.
 *
 * This component decides nothing. It owns no AI, no input and no rules: it eases
 * what is drawn toward the newest values on `live.remote` and plays the clip the
 * label off the wire names. Her cat is authoritative on her own device, and the
 * only honest thing this device can do is draw where she says she is.
 *
 * The chase is the whole of the smoothing, and it is the exponential idiom
 * FollowCamera, the HUD bars and useCatJuice already use. A true snapshot buffer
 * would be more accurate and would stutter on a late packet; this cannot,
 * because it has no idea a packet was late.
 *
 * **No cat-versus-cat combat between the two children, ever.** This file never
 * touches `live.duel`, `live.rival`, `live.cat` or `live.health`, and imports
 * nothing at all from `src/game/duel.ts` -- not `applyHit`, not `advance`, not
 * `startMove`. The way to guarantee two kids cannot fight each other is that the
 * code to do it is not present in the component that draws the peer.
 *
 * `rm.action` may still legitimately arrive as 'swipe', 'kick', 'hit' or
 * 'stagger'. The peer has her own CPU rival, which this device cannot see, so her
 * cat will sometimes appear to swing at nothing in the middle of a meadow. That
 * is a known Phase 1 artifact and not a bug; the rival becomes host-authoritative
 * in Phase 2.
 *
 * Nothing is registered into `debugHooks` here. The net debug surface belongs to
 * one file and this is not it.
 */
export function RemoteCat() {
  const group = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(MODEL_URL)

  // Own skeleton and own copies of the three painted materials, exactly as the
  // other two cats: a plain useGLTF reuse shares one skeleton and every cat
  // animates in lockstep, which is the bug this project has hit more than once.
  const { model, slots } = useMemo(() => cloneCatSkin(scene), [scene])

  const peerIdentity = useGame((s) => s.net.peerIdentity)

  // Discrete, from an effect, the same way PlayerCat repaints: her identity is
  // idempotent state that arrives once on `hello` and again whenever she changes
  // a swatch, so this fires about twice a session and never during play. Null
  // until `hello` lands, and painting nothing leaves the GLB's own colours up,
  // which is the right thing to draw for a cat whose owner has not chosen yet.
  useEffect(() => {
    if (peerIdentity) paint(slots, peerIdentity)
  }, [slots, peerIdentity])

  const animator = useCatAnimation(model, animations)
  const juice = useCatJuice(model, squash)
  const prevYaw = useRef(0)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const rm = live.remote
    const g = group.current
    // The ref is attached on the commit before the first frame runs, so this
    // never fires in practice. It is here because the ref type is nullable.
    if (!g) return

    // Phase is read with getState() rather than a subscription, the same as
    // RivalCat and FollowCamera: a subscribed phase re-renders this component
    // and its cloned scene graph, and the value is only ever needed inside the
    // frame that is about to use it.
    if (useGame.getState().phase !== 'playing') {
      g.visible = false
      return
    }

    // No peer, or a peer who has not sent a pose yet. There is nothing to draw
    // and nothing on `live.remote` worth chasing.
    if (!rm.present) {
      g.visible = false
      return
    }

    // --- linger -------------------------------------------------------------
    // NetDriver sets `frozen` when the link drops, along with linger =
    // NET_REMOTE_LINGER_SEC, tspeed = 0 and action = 'idle'. So the chase below
    // keeps running while frozen and she eases to a stand rather than being cut
    // mid-stride, and then she is taken off the field entirely.
    //
    // US-8 requires the peer's cat is "removed or clearly frozen, never left
    // ghosting mid-stride forever". Easing to a stop and then removing satisfies
    // both halves of that: the stop is what reads on screen, the removal is what
    // guarantees nothing is left standing there.
    //
    // This is deliberately NOT the fade the PRD proposes. A fade needs
    // `transparent = true` on her materials, and `Grey` and `Black` are now
    // SHARED material instances across every cat in the game, so making the peer
    // transparent would make Mila's cat and the rival transparent in the same
    // frame. Freezing costs nothing and touches no material.
    if (rm.frozen) {
      rm.linger -= delta
      if (rm.linger <= 0) {
        resetRemote()
        g.visible = false
        return
      }
    }

    // --- chase the wire targets ---------------------------------------------
    const k = 1 - Math.exp(-NET_REMOTE_CHASE * delta)

    const dx = rm.tx - rm.pos.x
    const dz = rm.tz - rm.pos.z
    if (Math.hypot(dx, dz) > NET_REMOTE_SNAP_DIST) {
      // A respawn or a debug teleport, not movement. Easing across that gap
      // would draw her sliding the length of the map at a speed no cat runs.
      rm.pos.x = rm.tx
      rm.pos.z = rm.tz
    } else {
      rm.pos.x += dx * k
      rm.pos.z += dz * k
    }

    // Shortest-angle, so a cat turning past due north eases 10 degrees rather
    // than unwinding 350 the other way.
    rm.yaw += shortestAngle(rm.yaw, rm.tyaw) * (1 - Math.exp(-NET_REMOTE_YAW_CHASE * delta))

    // Speed comes off the wire and is chased on its own rate, rather than being
    // differentiated from the position this function is already chasing. That is
    // exactly why the pose payload carries it: a differentiated chased value lags
    // twice and wobbles at every packet boundary, and speed is what drives the
    // walk/run blend, so the wobble would show up as a cat flickering between
    // two gaits while running in a straight line.
    rm.speed += (rm.tspeed - rm.speed) * (1 - Math.exp(-NET_REMOTE_SPEED_CHASE * delta))

    rm.hopHeight += (rm.thop - rm.hopHeight) * k

    // --- ground -------------------------------------------------------------
    // Height is never sent and is always recomputed here, from the same
    // analytic terrain both devices run. That is US-5's third acceptance
    // checkbox, it saves a third of every pose packet, and it makes it
    // impossible for the two iPads to disagree about the ground she is standing
    // on.
    rm.pos.y = groundHeightAt(rm.pos.x, rm.pos.z) + CAT_GROUND_OFFSET

    // No pushOutOfTrees, deliberately. Her position is authoritative on her own
    // device: shoving it locally would fight the wire, the chase would drag her
    // straight back into the trunk on the next packet, and the two screens would
    // show her standing in different places. She collides with her own trees on
    // her own iPad, which is the only place that collision means anything.

    // --- apply --------------------------------------------------------------
    g.visible = true
    g.position.set(rm.pos.x, rm.pos.y + rm.hopHeight, rm.pos.z)
    g.rotation.y = rm.yaw + CAT_MODEL_YAW_OFFSET
    animator.update(rm.action, rm.speed, delta)

    // Strictly after the animator, same as the other two cats: the mixer
    // rewrites every bone from the clip inside update(), so tail and ear offsets
    // written before that line are erased in the same frame and the whole system
    // looks like it is off.
    _juice.action = rm.action
    _juice.speed = rm.speed
    // Derived from the action off the wire, not from a crouch flag: a crouch is
    // not in the pose payload because the label already says it.
    _juice.crouched = rm.action === 'crouch'
    // Guarded divide. A frame with delta 0 -- which rAF hands you on the first
    // frame, and again whenever two frames share a timestamp -- makes this 0/0,
    // and the NaN is permanent: it flows into the tail's smoothed counter-swing
    // and deletes all eight tail bones for the rest of the session.
    _juice.yawRate = delta > 0 ? shortestAngle(prevYaw.current, rm.yaw) / delta : 0
    _juice.hopHeight = rm.hopHeight
    prevYaw.current = rm.yaw
    juice.update(_juice, delta)
  })

  return (
    <group ref={group} visible={false}>
      <group ref={squash}>
        <primitive object={model} scale={CAT_SCALE} />
      </group>
    </group>
  )
}

/**
 * Module-private, and a third copy on purpose. PlayerCat's is private to
 * PlayerCat and RivalCat's to RivalCat; exporting one of those to save four
 * lines would make a helper that three actors share out of a helper that none of
 * them can change without checking the other two.
 */
function shortestAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
