/**
 * `import type`, not a plain import, on purpose: a type-only import is fully
 * erased at build time, so this file keeps no runtime dependency on `live.ts` or
 * on the THREE import that `live.ts` pulls in with it. The union still cannot
 * drift from the real set of actions, because it IS the real set.
 */
import type { CatAction } from '../game/live'

/**
 * Browser-side copy of the signalling wire format. Kept in step by hand with
 * `signaling/src/protocol.ts`, deliberately duplicated rather than shared: the
 * app build must not reach into the Worker's source tree, and the Worker must
 * not depend on the game. Six lines of duplication keeps the browser half free
 * of any import from `signaling/`.
 */
export type ServerMsg =
  | { t: 'role'; role: 'host' | 'guest'; room: string }
  | { t: 'peer' }
  | { t: 'sig'; data: unknown }
  | { t: 'full' }
  | { t: 'gone' }

export type ClientMsg = { t: 'sig'; data: unknown } | { t: 'done' }

/**
 * What crosses the WebRTC data channel once the relay has stepped aside.
 *
 * `prey`, `catch` and `emote` from the PRD's message table are Phase 2 / Tier 2
 * and are deliberately absent: Phase 1 is Tier 0, two cats in one forest, each
 * hunting its own mice.
 */
export type NetMsg =
  /** Sent at NET_HEARTBEAT_HZ. `s` is the sender's clock at send time. */
  | { t: 'ping'; n: number; s: number }
  /** Echoed straight back with the ping's fields untouched, so the round trip
   *  is measured against the ORIGINAL send time and needs no clock agreement
   *  between the two devices. */
  | { t: 'pong'; n: number; s: number }
  /**
   * Identity: the four indices, plus the world seed so both forests are the same
   * forest.
   *
   * NO DISPLAY NAME AND NO FREE TEXT OF ANY KIND CROSSES THE WIRE. The PRD's
   * table has a "display name" field and it is dropped on purpose: each device
   * derives the name locally with the existing `catName()`, and four small
   * integers cannot carry anything the content policy forbids.
   *
   * This is idempotent STATE, not an event, and may arrive more than once. A
   * friend who scans the code and then makes her cat sends her identity before
   * she has chosen it, so it is re-sent whenever identity changes and the
   * receiver simply overwrites what it had.
   */
  | { t: 'hello'; pelt: number; eyes: number; prefix: number; warrior: boolean; seed: number }
  /**
   * Where the sender's cat is and what it is doing. `sp` is speed in m/s and
   * drives the walk/run blend on the far side. `hop` is metres above the ground
   * from a pounce arc.
   *
   * `hop` is an addition beyond the PRD's table. Without it a pouncing peer
   * slides along the ground instead of arcing, and it is one number.
   *
   * There is no `y`. Height is never sent: the receiver recomputes it from the
   * shared `groundHeightAt()`, which costs a function call instead of bytes and
   * makes it impossible for the two devices to disagree about the terrain.
   */
  | { t: 'pose'; x: number; z: number; yaw: number; sp: number; act: CatAction; hop: number }
  /** Time of day, 0..1, host to guest only. The guest keeps advancing its own
   *  clock at the normal rate and snaps to this when it arrives. */
  | { t: 'tod'; tod: number }
  /** Sent on a deliberate quit, so the other side can say so rather than wait.
   *  Everything else is covered by the NET_PEER_TIMEOUT_SEC heartbeat timeout,
   *  which matters because iOS `pagehide` is not reliable. */
  | { t: 'bye' }
