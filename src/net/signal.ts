import {
  NET_ROOM_ALPHABET,
  NET_ROOM_ID_LEN,
  NET_SIGNAL_OVERRIDE,
  NET_SIGNAL_PATH,
} from '../game/constants'
import type { ClientMsg, ServerMsg } from './protocol'

/**
 * The WebSocket client for the signalling relay, and nothing else.
 *
 * This file knows how to reach the relay and how to hand messages up. It does
 * NOT know what WebRTC is, the same way the Worker does not. Everything
 * SDP-shaped is `peer.ts`.
 */

export interface SignalHandlers {
  onRole: (role: 'host' | 'guest') => void
  onPeer: () => void
  onSig: (data: unknown) => void
  onFull: () => void
  onGone: () => void
  onClose: () => void
  onError: (why: string) => void
}

export class Signal {
  private ws: WebSocket | null = null

  constructor(
    readonly room: string,
    private h: SignalHandlers,
  ) {}

  get open() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** `CONNECTING | OPEN | CLOSING | CLOSED | NONE`, for the debug bridge. */
  get readyStateName() {
    const s = this.ws?.readyState
    return s === undefined
      ? 'NONE'
      : (['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][s] ?? String(s))
  }

  connect() {
    let url: string
    try {
      url = signalUrl(this.room)
    } catch (e) {
      this.h.onError(`bad signal url: ${String(e)}`)
      return
    }

    const ws = new WebSocket(url)
    this.ws = ws

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let msg: ServerMsg
      try {
        msg = JSON.parse(ev.data) as ServerMsg
      } catch {
        return
      }
      switch (msg.t) {
        case 'role':
          this.h.onRole(msg.role)
          break
        case 'peer':
          this.h.onPeer()
          break
        case 'sig':
          this.h.onSig(msg.data)
          break
        case 'full':
          this.h.onFull()
          break
        case 'gone':
          this.h.onGone()
          break
      }
    }

    // A WebSocket `error` event carries no useful detail by design (it would
    // leak cross-origin information), so there is nothing to report but the
    // fact. The distinction that matters to a child is "the relay is down"
    // versus "my friend never arrived", and /health answers that separately.
    ws.onerror = () => this.h.onError('signalling socket error')
    ws.onclose = () => this.h.onClose()
  }

  send(msg: ClientMsg) {
    if (!this.open) return false
    this.ws!.send(JSON.stringify(msg))
    return true
  }

  /**
   * "We are talking directly now, you can go." The relay closes the room on
   * this, which is what makes "no game data flows through signalling" an
   * enforced property rather than a promise.
   */
  done() {
    this.send({ t: 'done' })
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}

/**
 * Where the relay lives: THE PAGE'S OWN ORIGIN, under a path prefix.
 *
 * Not a second port. The relay had its own HTTPS listener on 8787 and both
 * iPads failed to open a single connection to it, health fetch and WebSocket
 * alike, while loading the page from 5173 over the same certificate. Vite
 * proxies it now, so the only origin either device ever touches is the one
 * already proven to work on both.
 *
 * The scheme is still derived, and that is not cosmetic: an `https:` page may
 * not open a `ws:` socket, so a hardcoded `ws://` works in Chrome on localhost
 * and fails on the device. Same-origin makes it a one-line derivation.
 */
export function signalOrigin() {
  return NET_SIGNAL_OVERRIDE ?? window.location.origin
}

/** `https://papa.local:5173` -> `wss://papa.local:5173/signal/room/AB12`. */
export function signalUrl(room: string) {
  const u = new URL(signalOrigin())
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = `${NET_SIGNAL_PATH}/room/${room}`
  return u.toString()
}

/** The relay's liveness probe. Separates "service is down" from "no friend yet". */
export async function signalHealthy(timeoutMs = 4000) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(new URL(`${NET_SIGNAL_PATH}/health`, signalOrigin()).toString(), {
      signal: ctl.signal,
    })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A fresh session id.
 *
 * `crypto.getRandomValues`, not `Math.random`: the id is the only thing
 * standing between a session and someone who guesses it. Rejection sampling
 * rather than a modulo, so every symbol is equally likely; with a 30-symbol
 * alphabet a plain `% 30` over bytes would make the first 16 symbols slightly
 * more common, which is a small bias but a free one to avoid.
 */
export function newRoomId(len = NET_ROOM_ID_LEN) {
  const n = NET_ROOM_ALPHABET.length
  const limit = Math.floor(256 / n) * n
  const out: string[] = []
  const buf = new Uint8Array(len * 2)
  while (out.length < len) {
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (b >= limit) continue
      out.push(NET_ROOM_ALPHABET[b % n])
      if (out.length === len) break
    }
  }
  return out.join('')
}

/** The `?join=` id on this URL, normalised, or null. */
export function roomFromUrl(search = window.location.search) {
  const raw = new URLSearchParams(search).get('join')
  if (!raw) return null
  const id = raw.toUpperCase()
  return /^[A-Z0-9]{1,16}$/.test(id) ? id : null
}
