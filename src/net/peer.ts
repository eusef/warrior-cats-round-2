import {
  NET_CONNECT_TIMEOUT_SEC,
  NET_HEARTBEAT_HZ,
  NET_ICE_SERVERS,
  NET_PEER_TIMEOUT_SEC,
} from '../game/constants'
import type { NetMsg } from './protocol'
import { Signal } from './signal'

/**
 * The peer connection: one `RTCPeerConnection`, one reliable-ordered data
 * channel, and the state machine around them.
 *
 * No React, no zustand, no R3F, no `live`. Same standing as `duel.ts` and
 * `landmarks.ts`: it can be driven and asserted from a script with no scene
 * mounted, which is the only reason the transport is verifiable at all.
 *
 * This file survives into Phase 1. The spike page that drives it does not.
 */

export type NetStatus =
  /** Nothing started. */
  | 'idle'
  /** Talking to the relay, or mid-handshake. */
  | 'signaling'
  /** Data channel open. The relay is gone by this point. */
  | 'connected'
  /** Was connected, then the peer went away (iPad locked, walked out of range). */
  | 'lost'
  /** Never connected. Timed out, room was full, or ICE failed outright. */
  | 'failed'

export interface PeerHandlers {
  onStatus?: (status: NetStatus, detail: string) => void
  onMessage?: (msg: NetMsg) => void
  onLog?: (line: string) => void
}

/** The bit of `getStats()` worth reporting: which candidate pair actually won. */
export interface PairInfo {
  local: string | null
  remote: string | null
  /** `true` only if the winning pair routes through a TURN server. Must never
   *  be true here: there is no TURN server configured, and this is the assertion
   *  that proves gameplay is not being relayed through the internet. */
  relayed: boolean
  rttMs: number | null
}

export class Peer {
  status: NetStatus = 'idle'
  role: 'host' | 'guest' | null = null
  /** Last measured application-level round trip, in milliseconds. */
  rtt = 0
  /** Heartbeats sent and received, so a stalled link is visible as a number. */
  sent = 0
  recv = 0

  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private sig: Signal
  private beat: ReturnType<typeof setInterval> | null = null
  private deadline: ReturnType<typeof setTimeout> | null = null
  private seq = 0
  private lastHeard = 0
  private disposed = false

  /**
   * Candidates that arrived before `setRemoteDescription`.
   *
   * Not an edge case, the normal case: the guest starts trickling the moment it
   * answers, and those arrive at the host interleaved with the answer itself.
   * `addIceCandidate` throws if there is no remote description yet, and a
   * dropped candidate is invisible until it turns out to have been the only one
   * that would have worked.
   */
  private pending: RTCIceCandidateInit[] = []
  private haveRemote = false

  constructor(
    readonly room: string,
    private h: PeerHandlers = {},
    /** What this side is trying to be. A mismatch is a stale QR; see onRole. */
    private want: 'host' | 'guest' = 'host',
  ) {
    this.sig = new Signal(room, {
      onRole: (role) => {
        // Asked to join, and the relay says you are the host: that room was
        // empty, so the code being scanned is stale. Mila's session expired or
        // she backed out, and her friend is holding a photo of a dead QR. Left
        // unhandled this is the worst failure in the whole flow, because it
        // looks identical to a working join and waits forever.
        if (this.want === 'guest' && role === 'host') {
          this.fail('that code has expired, ask for a new one')
          return
        }
        this.role = role
        this.log(`relay says: you are the ${role}`)
        if (role === 'host') this.makeChannel()
      },
      onPeer: () => {
        this.log('the other side is here')
        // The connect clock starts HERE, not at start(). Armed in start() it
        // measured "how long until a friend walks over with an iPad", so a host
        // who put the QR on the table and waited timed out at 20 seconds and
        // dropped her own room. Caught in Chrome doing exactly that. What the
        // timeout is actually for is a handshake that stalls, and a handshake
        // cannot stall before there is someone to shake hands with.
        this.arm()
        if (this.role === 'host') void this.offer()
      },
      onSig: (data) => void this.onSignal(data),
      onFull: () => this.fail('that game already has two cats in it'),
      onGone: () => {
        // Before the channel opens this is fatal; after it, the two are talking
        // directly and the relay's opinion no longer matters.
        if (this.status !== 'connected') this.log('the other side left the relay')
      },
      onClose: () => this.log(`relay socket closed (${this.sig.readyStateName})`),
      onError: (why) => {
        this.log(why)
        if (this.status === 'signaling') this.fail('could not reach the relay')
      },
    })
  }

  /** Everything the debug bridge and the UI need, in one plain object. */
  snapshot() {
    return {
      status: this.status,
      role: this.role,
      room: this.room,
      rtt: Math.round(this.rtt),
      sent: this.sent,
      recv: this.recv,
      signalSocket: this.sig.readyStateName,
      iceState: this.pc?.iceConnectionState ?? 'none',
      pcState: this.pc?.connectionState ?? 'none',
      dcState: this.dc?.readyState ?? 'none',
    }
  }

  start() {
    if (this.status !== 'idle') return
    this.setStatus('signaling', 'contacting the relay')

    this.pc = new RTCPeerConnection({ iceServers: NET_ICE_SERVERS })

    this.pc.onicecandidate = (ev) => {
      // A null candidate is the end-of-gathering marker, not something to send.
      if (!ev.candidate) return this.log('ice gathering complete')
      this.sig.send({ t: 'sig', data: { candidate: ev.candidate.toJSON() } })
    }

    this.pc.ondatachannel = (ev) => {
      // Guest side: the host created the channel, this is it arriving.
      this.bindChannel(ev.channel)
    }

    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState
      this.log(`pc: ${s}`)
      if (s === 'failed') this.fail('the two devices could not reach each other')
      else if (s === 'disconnected' && this.status === 'connected') {
        this.setStatus('lost', 'your friend disconnected')
      }
    }

    this.pc.oniceconnectionstatechange = () => this.log(`ice: ${this.pc?.iceConnectionState}`)

    this.sig.connect()
  }

  /**
   * Start the handshake clock. Called when the peer appears, never before.
   *
   * A host with the QR on screen and nobody there yet is not failing at
   * anything, and must be allowed to wait indefinitely. The relay's own room
   * TTL is what eventually reclaims an abandoned room.
   */
  private arm() {
    if (this.deadline) clearTimeout(this.deadline)
    this.deadline = setTimeout(() => {
      if (this.status !== 'connected') this.fail('took too long to connect')
    }, NET_CONNECT_TIMEOUT_SEC * 1000)
  }

  send(msg: NetMsg) {
    if (this.dc?.readyState !== 'open') return false
    this.dc.send(JSON.stringify(msg))
    return true
  }

  /**
   * Which ICE candidate pair actually carried the connection.
   *
   * This is the single most valuable readout in Phase 0. If two iPads fail to
   * connect, "it didn't work" is useless and "no pair was ever nominated, and
   * the local candidates were all mDNS `.local` host candidates" points
   * straight at the router. Async because `getStats` is.
   */
  async pairInfo(): Promise<PairInfo> {
    const empty: PairInfo = { local: null, remote: null, relayed: false, rttMs: null }
    if (!this.pc) return empty
    const stats = await this.pc.getStats()

    let pair: RTCIceCandidatePairStats | null = null
    stats.forEach((r) => {
      const s = r as RTCIceCandidatePairStats & { selected?: boolean }
      if (s.type !== 'candidate-pair') return
      // `state === 'succeeded'` plus nominated is the portable read. Chrome also
      // sets `selected`; Safari does not, so do not rely on it alone.
      if (s.state === 'succeeded' && (s.nominated || s.selected)) pair = s
    })
    if (!pair) return empty

    const p = pair as RTCIceCandidatePairStats
    const typeOf = (id?: string) => {
      if (!id) return null
      const c = stats.get(id) as { candidateType?: string } | undefined
      return c?.candidateType ?? null
    }
    const local = typeOf(p.localCandidateId)
    const remote = typeOf(p.remoteCandidateId)
    return {
      local,
      remote,
      relayed: local === 'relay' || remote === 'relay',
      rttMs: typeof p.currentRoundTripTime === 'number' ? p.currentRoundTripTime * 1000 : null,
    }
  }

  dispose() {
    this.disposed = true
    if (this.beat) clearInterval(this.beat)
    if (this.deadline) clearTimeout(this.deadline)
    this.beat = null
    this.deadline = null
    this.dc?.close()
    this.pc?.close()
    this.sig.close()
  }

  // -- handshake ------------------------------------------------------------

  /** Host only. Created before the offer so the channel is part of the SDP. */
  private makeChannel() {
    if (!this.pc || this.dc) return
    this.bindChannel(this.pc.createDataChannel('game', { ordered: true }))
  }

  private async offer() {
    if (!this.pc || this.pc.signalingState !== 'stable') return
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.sig.send({ t: 'sig', data: { sdp: this.pc.localDescription } })
    this.log('sent offer')
  }

  private async onSignal(data: unknown) {
    if (!this.pc || this.disposed) return
    const d = data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

    if (d.sdp) {
      await this.pc.setRemoteDescription(d.sdp)
      this.haveRemote = true
      this.log(`got ${d.sdp.type}`)

      if (d.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.sig.send({ t: 'sig', data: { sdp: this.pc.localDescription } })
        this.log('sent answer')
      }

      // Drain whatever arrived early. See `pending` above.
      const queued = this.pending
      this.pending = []
      for (const c of queued) await this.pc.addIceCandidate(c).catch(() => {})
      if (queued.length) this.log(`drained ${queued.length} early candidate(s)`)
      return
    }

    if (d.candidate) {
      if (!this.haveRemote) {
        this.pending.push(d.candidate)
        return
      }
      await this.pc.addIceCandidate(d.candidate).catch(() => {})
    }
  }

  private bindChannel(dc: RTCDataChannel) {
    this.dc = dc

    dc.onopen = () => {
      // The relay has done its entire job. Closing it here is what makes the
      // "no game data passes through signalling" rule structural.
      this.sig.done()
      this.sig.close()
      if (this.deadline) clearTimeout(this.deadline)
      this.deadline = null
      this.lastHeard = now()
      this.setStatus('connected', 'connected to peer')
      this.startHeartbeat()
    }

    dc.onclose = () => {
      if (this.status === 'connected') this.setStatus('lost', 'your friend disconnected')
    }

    dc.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let msg: NetMsg
      try {
        msg = JSON.parse(ev.data) as NetMsg
      } catch {
        return
      }
      this.lastHeard = now()

      if (msg.t === 'ping') {
        // Echo `n` and `s` untouched. Measuring against the original sender's
        // own clock means the two devices never have to agree on what time it
        // is, which they will not.
        this.send({ t: 'pong', n: msg.n, s: msg.s })
        return
      }
      if (msg.t === 'pong') {
        this.recv++
        this.rtt = now() - msg.s
        return
      }
      this.h.onMessage?.(msg)
    }
  }

  private startHeartbeat() {
    if (this.beat) clearInterval(this.beat)
    this.beat = setInterval(() => {
      if (this.status !== 'connected') return
      this.seq++
      this.sent++
      this.send({ t: 'ping', n: this.seq, s: now() })

      // iOS will happily leave `connectionState` reading `connected` for a long
      // while after a screen lock has actually killed the flow, so silence is
      // the reliable signal, not the connection state.
      if (now() - this.lastHeard > NET_PEER_TIMEOUT_SEC * 1000) {
        this.setStatus('lost', 'your friend disconnected')
      }
    }, 1000 / NET_HEARTBEAT_HZ)
  }

  // -- plumbing -------------------------------------------------------------

  private setStatus(s: NetStatus, detail: string) {
    if (this.status === s) return
    this.status = s
    this.log(`status: ${s} (${detail})`)
    this.h.onStatus?.(s, detail)
  }

  private fail(why: string) {
    if (this.status === 'connected' || this.status === 'failed') return
    this.setStatus('failed', why)
    if (this.beat) clearInterval(this.beat)
    this.beat = null
    this.sig.close()
  }

  private log(line: string) {
    this.h.onLog?.(line)
  }
}

function now() {
  return performance.now()
}
