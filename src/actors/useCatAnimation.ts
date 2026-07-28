import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  ANIM_FADE,
  ANIM_RUN_CYCLE_SPEED,
  ANIM_TIMESCALE_MAX,
  ANIM_TIMESCALE_MIN,
  ANIM_WALK_CYCLE_SPEED,
  CAT_RUN_SPEED,
  CAT_WALK_SPEED,
} from '../game/constants'
import { CatAction } from '../game/live'
import { clamp } from '../game/terrain'
import { DEBUG } from '../debug/expose'

/**
 * Clip names are read off the GLTF at runtime and matched by suffix, never
 * hard-coded. The pack ships two naming conventions in the wild: bare names
 * ("Walk") from the Blender exporter and armature-prefixed names
 * ("AnimalArmature|Walk") from the FBX pipeline. Suffix matching handles both.
 *
 * Death exists in the pack and is deliberately never resolved: nothing in this
 * game kills a cat. Attack and the two HitReacts ARE bound, for the duel only,
 * where a swing and a flinch are the whole of how a hit reads. Injury stays a
 * number on a health bar. See the content policy in CLAUDE.md.
 */
const WANTED = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Gallop',
  crouch: 'Idle_2_HeadLow',
  pounce: 'Gallop_Jump',
  eat: 'Eating',
  rest: 'Idle_2',
  swipe: 'Attack',
  hit: 'Idle_HitReact1',
  stagger: 'Idle_HitReact2',
} as const

type Slot = keyof typeof WANTED

/**
 * Actions that borrow another slot's clip instead of getting one of their own.
 *
 * The jump-kick wants Gallop_Jump, and so does the pounce. Giving it its own
 * WANTED entry would resolve to the same clip, and mixer.clipAction() returns
 * the SAME AnimationAction for the same clip on the same root — so the two
 * slots would share one action and fight over its weight every frame, one
 * setting it to 1 and the other to 0 depending on Object.keys order.
 */
const ALIAS: Partial<Record<CatAction, Slot>> = { kick: 'pounce' }

/** Slots that blend continuously with speed rather than switching. */
const LOCOMOTION: Slot[] = ['idle', 'walk', 'run']

function resolve(clips: THREE.AnimationClip[], wanted: string): THREE.AnimationClip | null {
  // Exact first, then "Prefix|Wanted", so Idle_2 never steals Idle.
  const exact = clips.find((c) => c.name === wanted)
  if (exact) return exact
  const suffixed = clips.find((c) => {
    const bar = c.name.lastIndexOf('|')
    return bar >= 0 && c.name.slice(bar + 1) === wanted
  })
  return suffixed ?? null
}

export interface CatAnimator {
  /** Call every frame from useFrame. */
  update: (action: CatAction, speed: number, delta: number) => void
}

export function useCatAnimation(
  root: THREE.Object3D | null,
  clips: THREE.AnimationClip[],
): CatAnimator {
  const mixer = useMemo(() => (root ? new THREE.AnimationMixer(root) : null), [root])
  const actionsRef = useRef<Partial<Record<Slot, THREE.AnimationAction>>>({})

  useEffect(() => {
    if (!mixer || !root) return
    const built: Partial<Record<Slot, THREE.AnimationAction>> = {}
    const missing: string[] = []

    for (const slot of Object.keys(WANTED) as Slot[]) {
      const clip = resolve(clips, WANTED[slot])
      if (!clip) {
        missing.push(`${slot} -> ${WANTED[slot]}`)
        continue
      }
      const action = mixer.clipAction(clip)
      action.enabled = true
      action.setEffectiveWeight(slot === 'idle' ? 1 : 0)
      action.play()
      built[slot] = action
    }
    actionsRef.current = built

    if (DEBUG) {
      // Never guess the strings: log what the file actually contains.
      // eslint-disable-next-line no-console
      console.log(
        '[cat] clips in GLB:',
        clips.map((c) => c.name).join(', '),
      )
      // eslint-disable-next-line no-console
      console.log('[cat] bound:', Object.keys(built).join(', ') || '(none)')
      if (missing.length) {
        // eslint-disable-next-line no-console
        console.warn('[cat] unresolved slots:', missing.join(', '))
      }
    }

    return () => {
      mixer.stopAllAction()
      for (const a of Object.values(built)) a.stop()
      mixer.uncacheRoot(root)
    }
  }, [mixer, root, clips])

  return useMemo<CatAnimator>(
    () => ({
      update(action, speed, delta) {
        if (!mixer) return
        const acts = actionsRef.current

        // Target weight per slot.
        let wIdle = 0
        let wWalk = 0
        let wRun = 0
        let oneShot: Slot | null = null

        if (action === 'walk' || action === 'run' || action === 'idle') {
          if (speed <= 0.05) {
            wIdle = 1
          } else if (speed < CAT_WALK_SPEED) {
            const t = speed / CAT_WALK_SPEED
            wIdle = 1 - t
            wWalk = t
          } else {
            const t = clamp((speed - CAT_WALK_SPEED) / (CAT_RUN_SPEED - CAT_WALK_SPEED), 0, 1)
            wWalk = 1 - t
            wRun = t
          }
        } else {
          oneShot = ALIAS[action] ?? (action as Slot)
          // Crouch keeps a little walk under it so stalking still has footfalls.
          if (action === 'crouch' && speed > 0.05) {
            wWalk = clamp(speed / CAT_WALK_SPEED, 0, 1) * 0.45
          }
        }

        const k = 1 - Math.exp(-delta / Math.max(ANIM_FADE, 0.0001))

        for (const slot of Object.keys(WANTED) as Slot[]) {
          const a = acts[slot]
          if (!a) continue
          let target: number
          if (LOCOMOTION.includes(slot)) {
            target = slot === 'idle' ? wIdle : slot === 'walk' ? wWalk : wRun
            if (oneShot && slot !== 'walk') target = 0
          } else {
            target = slot === oneShot ? 1 : 0
          }
          const w = a.getEffectiveWeight()
          a.setEffectiveWeight(w + (target - w) * k)
        }

        // Match footfall rate to ground speed so the cat never ice-skates.
        const walkAct = acts.walk
        if (walkAct) {
          walkAct.setEffectiveTimeScale(
            clamp(speed / ANIM_WALK_CYCLE_SPEED, ANIM_TIMESCALE_MIN, ANIM_TIMESCALE_MAX),
          )
        }
        const runAct = acts.run
        if (runAct) {
          runAct.setEffectiveTimeScale(
            clamp(speed / ANIM_RUN_CYCLE_SPEED, ANIM_TIMESCALE_MIN, ANIM_TIMESCALE_MAX),
          )
        }

        mixer.update(delta)
      },
    }),
    [mixer],
  )
}
