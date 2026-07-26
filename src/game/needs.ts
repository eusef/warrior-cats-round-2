import {
  CAMP_HEAL_PER_SEC,
  CAMP_REST_HUNGER_MULT,
  HEALTH_DRAIN_WHEN_STARVING,
  HUNGER_DECAY_PER_SEC,
  HUNGER_LOW_THRESHOLD,
  HUNGER_STARVING_THRESHOLD,
  NEED_MAX,
} from './constants'
import { live } from './live'

/**
 * Ticks health and hunger. Called from useFrame, so it never touches the store.
 * Returns a threshold-crossing event when one happens, and only then, which is
 * the one moment the caller is allowed to push to zustand.
 */
export type NeedEvent = 'hunger-low' | 'hunger-empty' | 'health-low' | null

let wasLow = false
let wasEmpty = false
let wasHealthLow = false

export function resetNeedEdges() {
  wasLow = false
  wasEmpty = false
  wasHealthLow = false
}

export function tickNeeds(delta: number, resting: boolean): NeedEvent {
  const mult = resting ? CAMP_REST_HUNGER_MULT : 1
  live.hunger = Math.max(0, live.hunger - HUNGER_DECAY_PER_SEC * mult * delta)

  if (live.hunger <= HUNGER_STARVING_THRESHOLD) {
    live.health = Math.max(0, live.health - HEALTH_DRAIN_WHEN_STARVING * delta)
  }
  if (resting) {
    live.health = Math.min(NEED_MAX, live.health + CAMP_HEAL_PER_SEC * delta)
  }

  // Rising edges only. No fail state: at 0 health the cat just stays at 0 and
  // the HUD nags. Getting hurt never ends the game.
  let event: NeedEvent = null

  const low = live.hunger <= HUNGER_LOW_THRESHOLD
  if (low && !wasLow) event = 'hunger-low'
  wasLow = low

  const empty = live.hunger <= 0
  if (empty && !wasEmpty) event = 'hunger-empty'
  wasEmpty = empty

  const healthLow = live.health <= 30
  if (healthLow && !wasHealthLow) event = event ?? 'health-low'
  wasHealthLow = healthLow

  return event
}

export function feed(amount: number) {
  live.hunger = Math.min(NEED_MAX, live.hunger + amount)
}
