/**
 * Browser-side copy of the signalling wire format. Kept in step by hand with
 * `signaling/src/protocol.ts`, deliberately duplicated rather than shared: the
 * app build must not reach into the Worker's source tree, and the Worker must
 * not depend on the game. Six lines of duplication buys two independently
 * deployable halves.
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
 * Phase 0 defines only the heartbeat. The game protocol from the PRD (`hello`,
 * `pose`, `prey`, `catch`, `tod`, `emote`, `bye`) is Phase 1 and lands here
 * when the pipe is proven, not before.
 */
export type NetMsg =
  /** Sent at NET_HEARTBEAT_HZ. `s` is the sender's clock at send time. */
  | { t: 'ping'; n: number; s: number }
  /** Echoed straight back with the ping's fields untouched, so the round trip
   *  is measured against the ORIGINAL send time and needs no clock agreement
   *  between the two devices. */
  | { t: 'pong'; n: number; s: number }
