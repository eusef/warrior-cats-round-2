/**
 * The signalling wire format, shared by the Worker and the browser client.
 *
 * The single most important property of this protocol is what is NOT in it.
 * There is no `offer`, no `answer`, no `candidate`. The relay carries one
 * opaque `sig` payload and never looks inside it, so the Worker contains no
 * WebRTC knowledge at all, cannot be broken by a change to the handshake, and
 * cannot be quietly grown into a game server. Everything WebRTC-shaped lives in
 * `src/net/peer.ts` on the browser side.
 *
 * Kept as a standalone file with no imports so both halves can own a copy
 * without the app build reaching into the Worker or the reverse.
 */

/** Server to client. */
export type ServerMsg =
  /** Sent immediately on accept. First socket into a room is the host. */
  | { t: 'role'; role: 'host' | 'guest'; room: string }
  /** The other side has arrived. The HOST creates the offer on this. */
  | { t: 'peer' }
  /** Relayed verbatim from the other client. */
  | { t: 'sig'; data: unknown }
  /** The room already holds two sockets. Closed straight after. */
  | { t: 'full' }
  /** The other side's socket closed. */
  | { t: 'gone' }

/** Client to server. */
export type ClientMsg =
  /** Forwarded verbatim to the other socket. Contents never inspected. */
  | { t: 'sig'; data: unknown }
  /** "The data channel is open, we don't need you." Tears the room down. */
  | { t: 'done' }

/**
 * Hard ceiling on a single relayed message, in bytes.
 *
 * An SDP offer with a handful of ICE candidates is a few kilobytes, so 64KB is
 * enormous headroom for the job. It is here as an enforcement mechanism rather
 * than a safety valve: "no game data flows through the signalling service" is a
 * rule in CLAUDE.md, and a hard cap is what makes it true by construction
 * instead of true by good intentions.
 */
export const MAX_SIG_BYTES = 64 * 1024

/**
 * How long a room may exist before the relay closes it, in milliseconds.
 *
 * This is a guess-window limit, not a resource limit. A hibernating Durable
 * Object with an idle socket costs essentially nothing, so the reason to expire
 * a room is that a short session id is only unguessable while it is short-lived.
 * Ten minutes is far past any real handshake (they take about two seconds) and
 * well past a child who has opened the host screen and wandered off.
 */
export const ROOM_TTL_MS = 10 * 60 * 1000
