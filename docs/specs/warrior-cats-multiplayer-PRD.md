# PRD: Local Two-Player Co-op (iPad-to-iPad)

**Feature:** Warrior Cats multiplayer, Round 2
**Date:** 2026-07-28
**Author:** Raj (PM)
**Status:** ⬜ Draft v2, pending Phil review
**Repo:** https://github.com/eusef/warrior-cats-round-2
**Backlog origin:** Item #11 ("players can see each other on the map and chase prey")

> **Changed from v1:** Delivery corrected from "install from Phil's laptop over LAN," which silently breaks the feature (a LAN `http` origin registers no service worker and blocks WebRTC, FACT), to a hosted HTTPS PWA. Pairing changed from an in-app two-QR handshake to a native-Camera URL scan plus a tiny signaling service, which is far simpler for a kid. Estimates are ASSUMED until the connectivity spike and a device test run.

---

## Problem Statement

Mila plays alone. Her friend can only watch. There is no way for two kids to be in the same forest at the same time, which is the most-requested kind of play for a game like this and the thing that turns a solo toy into a shared one. Today the codebase has zero networking: every device that loads the app runs a fully independent game.

## Target Users

| Persona | Who | Context of use |
|---|---|---|
| **Mila (host)** | The 10-year-old this game is built for | Starts the session on her own iPad, landscape, touch. Authority for the shared world. |
| **The friend (guest)** | A second child, physically present, on their own iPad | Joins Mila's session on the same home Wi-Fi. Brings their own cat, or makes one. |

Both are children. Every tradeoff resolves toward "is this fun and safe on a touchscreen," per the existing content policy.

## Solution Summary

Mila taps "Play with a friend." Her iPad shows a QR code. Her friend opens the iPad Camera app, scans it, and Safari opens the game, which loads and drops the friend straight into Mila's forest. They see each other move and hunt the same prey. Communication is canned emotes only. No text chat, no cat-versus-cat fighting. Their two iPads talk directly over the same Wi-Fi. The only shared infrastructure is a static host (for the app) and a tiny signaling service (to introduce the two iPads), both invisible to the kids.

---

## Goals

Adapted for an audience of one plus a friend. SaaS metrics (adoption %, revenue, retention, NPS) are **not applicable** to a personal, never-published build.

1. Two iPads on the same Wi-Fi end up in a shared forest via a single QR scan, no typing, no adult.
2. Each child sees the other's cat move smoothly, no visible teleport at run speed.
3. Both children hunt the same prey in one session without desync or crash.
4. 60fps on the iPad (the only performance bar that counts).
5. The app is not discoverable or distributable (unlisted host), honoring the spirit of "never published or sold."

## Non-Goals

| Not doing | Why |
|---|---|
| Text chat between the two players | Content policy: a free-text surface between two kids fails the Bluey test. Emotes only. |
| Cat-versus-cat combat / PvP | Content policy: "rivals get chased off, not fought." Player cats cannot damage each other. |
| Remote play across different networks | Would force a TURN relay routing game data through the internet. Same-Wi-Fi only. |
| Offline play at join time | The one-time app load and the join handshake need internet. Only the game **data path** stays local (iPad-to-iPad). |
| More than two players | Two is the whole ask. Design does not preclude it, but it is out of scope. |
| Shared save / merged progression | Each cat keeps its own save, hunger, and warrior-name journey. Simpler and more personal. |
| Accounts, matchmaking, lobbies, product telemetry | Pairing is a scan of an ephemeral session id. No account system. |

---

## User Stories & Acceptance Criteria

### Pairing

**US-1: Host a session.**
As Mila, I want to start a game a friend can join, so we can play together.
- [ ] "Play with a friend" opens a host screen showing a QR code and a "waiting for your friend" state.
- [ ] The QR encodes the app URL plus a short session id (e.g. `host/?join=AB12`).
- [ ] She can back out to solo play at any time with one tap.

**US-2: Join by scanning (native camera).**
As the friend, I want to join Mila's game by scanning her code with my Camera app, with nothing to install and nothing to type.
- [ ] Scanning the QR in the iOS Camera app opens the app URL in Safari.
- [ ] On load, the app reads the session id and connects to Mila through the signaling service.
- [ ] Both devices report connected within a few seconds of the scan, and the friend spawns in Mila's forest near camp.
- [ ] The friend's web app never requests camera permission (the native Camera app did the scanning).

**US-3: Host admits the joiner (safety).**
As Mila, I want to see that my friend is joining and let them in, so a stranger cannot drop into my game.
- [ ] When someone joins her session id, Mila sees a "your friend wants to join, tap to let them in" prompt.
- [ ] The connection completes only after she taps to admit. (P1, see Requirements.)

**US-4: Pairing fails gracefully.**
As either child, if we cannot connect, I want to understand that and try again, not sit on a frozen screen.
- [ ] A failed or timed-out join shows a plain, kid-readable message and a "try again" button.
- [ ] Backing out always returns to a working solo game. Pairing never bricks the app.

### In-game co-op

**US-5: See each other move.**
As either child, I want to see my friend's cat moving around the forest in real time.
- [ ] The peer's cat renders as the fox rig recolored to the peer's chosen pelt and eyes.
- [ ] The peer's cat interpolates smoothly between network updates, no visible snapping at run speed.
- [ ] The peer's cat sits correctly on the terrain (shared ground-height function, not a guess).
- [ ] Each device shows only its **own** cat's health and hunger. The peer is a moving model, not a second HUD. (Proposed default, see Open Questions.)

**US-6: Hunt the same prey.**
As either child, I want us to chase the same mice, so the hunt is shared.
- [ ] Both devices see prey in the same positions (host simulates prey, guest renders the stream).
- [ ] Either cat can catch a mouse. The host resolves the catch and both devices update.
- [ ] The catcher gets the hunt credit on their own device (their own huntCount and warrior-name progress). (Proposed default, see Open Questions.)
- [ ] If both cats pounce the same mouse in the same instant, the host awards it to one; the other sees it already caught. No double-credit, no crash.

**US-7: Send an emote.**
As either child, I want to send my friend a purr or a "come here," so we can play together without typing.
- [ ] A small emote control sends one of a fixed set (e.g. meow, purr, "follow me" ping).
- [ ] The peer sees and hears the emote (a canned sound + a brief visual over the sender's cat).
- [ ] There is no free-text input anywhere. (P1, see Requirements.)

### Failure and disconnect

**US-8: Handle a dropped friend.**
As either child, if my friend's iPad locks or leaves, I want the game to keep working and tell me what happened.
- [ ] If the connection drops (screen lock, backgrounded, out of range), the remaining device shows "your friend disconnected" and continues as a solo game.
- [ ] The peer's cat is removed or clearly frozen, never left ghosting mid-stride forever. (Exact behavior in Open Questions.)
- [ ] Reconnecting requires a re-scan. No silent auto-reconnect is promised for v1.

---

## Requirements

### Must-Have (P0): does not ship without these

| # | Requirement | Notes |
|---|---|---|
| P0-1 | Host the built app (`vite build`) as an HTTPS PWA on a free static host (e.g. Cloudflare Pages). | FACT: HTTPS is mandatory for the service worker and for WebRTC. See Key Decisions. |
| P0-2 | Tiny signaling service (e.g. Cloudflare Worker + Durable Object) that relays the WebRTC handshake between two peers in a session, then steps aside. | ASSUMED ~50-100 lines. No game data flows through it. |
| P0-3 | Host session screen: a URL+session-id QR plus a "waiting for your friend" state (US-1). | |
| P0-4 | Join-by-scan: read the session id on load, connect via signaling, spawn in the host's world (US-2). | No in-app scanner, no camera permission. |
| P0-5 | WebRTC transport: `RTCPeerConnection` + a reliable-ordered data channel; ICE via the signaling service. | Dep-free. |
| P0-6 | Shared world: host sends its world seed at connect; guest adopts it for the session. | Forests already match on the fixed seed; sending it is correct and cheap. |
| P0-7 | Remote-cat rendering + interpolation (US-5). | Must use `SkeletonUtils.clone`, see Technical Notes. |
| P0-8 | Presence + disconnect handling (US-4, US-8): connected/lost drives the UI; a drop never crashes or freezes. | |

### Nice-to-Have (P1): strong fast-follows

| # | Requirement |
|---|---|
| P1-1 | Shared prey with host-authoritative catch resolution (US-6). This is the "chase prey together" payoff. |
| P1-2 | Host admits the joiner before connecting (US-3). Safety. See Open Questions for P0-vs-P1. |
| P1-3 | Emotes / pings (US-7). |
| P1-4 | A connect/disconnect chirp so presence is audible. |

### Future Considerations (P2): design so as not to block these

| # | Consideration |
|---|---|
| P2-1 | A second unreliable/unordered data channel for pose, if reliable-ordered streaming feels laggy. |
| P2-2 | Shared landmark discovery or a co-op hunt tally. |
| P2-3 | Auto-reconnect after a brief drop (screen lock). |
| P2-4 | Add to Home Screen for an offline, app-like launch on repeat visits (not needed for the first scan-and-play). |

Ship order: P0-1 through P0-8 gets two cats into one forest via a scan (Tier 0). P1-1 (shared prey) is Tier 1 and completes backlog #11.

---

## Success Criteria

| Criterion | Target | How measured |
|---|---|---|
| Scan to shared forest | Under ~15s including first load, no typing, no adult | Stopwatch, real two-iPad test |
| Pairing reliability | Connects on >=9 of 10 attempts on the home network | Repeated attempts |
| Sync feel | No visible teleport of the peer cat at run speed | On-device eyeball + `window.__game` pose assertion in Chrome |
| Framerate | Holds 60fps with two cats + interpolation | On-device, per budget (100 draw calls, 150k tris) |
| Session stability | 20-minute session survives with no unforced disconnect | Real play test |
| The only KPI that matters | Mila asks to play multiplayer again | Observation |

---

## Key Decisions

| Decision | Rationale |
|---|---|
| Hosted HTTPS PWA, not a laptop | FACT: service workers and WebRTC/camera require a secure (HTTPS) context. A dev server over LAN serves plain `http`, which registers no service worker (no offline install) and blocks WebRTC, so v1's "install from laptop" path silently breaks the feature. An iPad or LAN server cannot easily provide HTTPS. A hosted URL is the clean path and removes the laptop entirely. Ref: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts |
| Mila's iPad is the authoritative peer | "Host" cannot mean "server" in Safari (a web page cannot listen for connections). Authoritative peer is the browser-native equivalent. |
| Native Camera app scans a URL QR, not an in-app scanner | Simplest possible kid interaction. The web app never needs camera permission and there is no return QR. |
| A tiny signaling service brokers the handshake | It is the piece that turns "scanned the app" into "joined Mila's game." Invisible to the kids. Bends "no cloud," see note below. |
| Unlisted host, not access-gated | Max kid-simplicity: a gate would put an auth wall in front of the scan. An unlisted URL shown only to the friend in person is unpublished in every practical sense. |
| Data path stays iPad-to-iPad over the LAN | WebRTC data flows directly between the two iPads. The signaling service only introduces them (~2s); no game data passes through it. |
| Needs, saves, progression stay per-device | Each cat's hunger and warrior-name journey are personal. Avoids sync and save-merge complexity. |
| No text chat, no PvP | Non-negotiable content policy. |

**Honest note on "no cloud":** CLAUDE.md says no cloud, no accounts, no deploy configs. This feature needs a static host and a signaling service. Both are free, zero-maintenance, hold no game data, and are invisible to the players, but they are a real departure from that rule. It is the price of scan-and-play-into-the-same-game on iOS. The only alternative that avoids any hosted service is the fully-offline two-QR handshake, which needs no signaling service but is fiddlier for a kid.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Router AP/client isolation blocks device-to-device traffic, so the P2P link never forms | ASSUMED Med | High | Connectivity spike before building. If blocked, toggle the router setting. A signaling service alone cannot fix it; only a TURN relay would, converting to slower relayed play. |
| iOS mDNS `.local` candidates fail to resolve between the two iPads | ASSUMED Low-Med | High | Same spike, real two-device test, not Chrome. |
| Signaling service unreachable at join time | ASSUMED Low | Med | Keep it trivial and serverless. If unreachable, pairing fails gracefully and solo play is unaffected. |
| Screen lock / backgrounding suspends the WebRTC connection | ASSUMED Med | Med | Detect the drop, show "friend disconnected," continue solo, allow re-scan. Unavoidable on iOS. |
| A stranger guesses a session id and joins | ASSUMED Low | Med | Short-lived, random session ids, plus the host-admits-joiner step (P1-2). |
| Second animated cat blows the 60fps budget on device | ASSUMED Low | Med | Budget has headroom (recent measures: 13-18 draw calls, well under 100). Measure on device. |

Dropped from v1: "QR too large" (a URL QR is tiny) and "two-QR pairing fiddly" (replaced by the native Camera scan).

---

## Technical Notes (proposed shape for the implementing session)

Per CLAUDE.md, the implementing session must **propose the component tree and state shape and wait for approval before writing code.** This is that proposal, not locked implementation.

**Delivery**
- `vite build` to a static bundle. Deploy to Cloudflare Pages (free, HTTPS). Add `manifest.webmanifest` and a minimal service worker (hand-rolled ~40 lines, or `vite-plugin-pwa` if Phil approves the dep) so repeat visits can launch offline.

**Signaling**
- Cloudflare Worker + Durable Object holding short-lived rooms keyed by session id, over WebSocket. Host creates a room and gets an id; guest joins by id; the Worker relays SDP offer/answer and ICE candidates between the two, then the room tears down once the data channel is open. No game data ever passes through it.
- Session ids are short and random. Rooms expire quickly.

**New module `src/net/`**
- `net.ts`: `RTCPeerConnection` + one reliable-ordered `RTCDataChannel`. Owns the connection state machine (idle -> signaling -> connected -> lost), the signaling WebSocket client, ICE handling, and the message protocol below.
- `RemoteCat.tsx`: renders the peer's cat. **Must `SkeletonUtils.clone(scene)`** the fox rig, or both cats share one skeleton and animate identically (this exact bug is called out in CLAUDE.md). Recolors by the peer's identity indices. Interpolates pose from refs inside `useFrame`. Renders `null` until a peer is present.

**Message protocol (small JSON to start, compact binary later if needed)**

| Type | Direction | Rate | Payload |
|---|---|---|---|
| `hello` | both, on connect | once | identity (pelt/eyes/prefix/warrior), display name, world seed |
| `pose` | both | ~15/s | x, z, yaw, speed, action |
| `prey` | host -> guest | ~10/s | array of {id, x, z, state} |
| `catch` | guest -> host, then host -> guest | on event | preyId (attempt), then resolved/denied |
| `tod` | host -> guest | low | timeOfDay |
| `emote` | both | on event | emote id |
| `bye` | either | on quit | none |

**Authority split**
- Host owns: world seed, all prey simulation, time-of-day.
- Guest owns: its own cat's pose and actions.
- Each device owns: its own cat's needs (health/hunger) and progression (huntCount, ceremony). Not synced.

**State shape**
- Extend `live.ts` with a `remote` block mirroring `live.cat` (pos, yaw, speed, action) plus interpolation targets and `present: boolean`. Mutated from the data-channel receive handler into refs, read in `RemoteCat`. **Never through React or zustand** (the per-frame-setState rule).
- Add to the zustand store (discrete, drives UI): `net.role: 'host' | 'guest' | null`, `net.status: 'idle' | 'waiting' | 'connected' | 'lost'`, `net.peerName: string | null`, `net.pendingJoiner: boolean` (for the admit step).
- Prey system (`Prey.tsx`) gains an authority mode: **authoritative** (host, runs AI, streams) vs **puppet** (guest, positions from the `prey` stream, no local AI). This is the main gameplay-code change for Tier 1.

**Non-negotiable engine rules the implementer must honor** (all in CLAUDE.md): `SkeletonUtils.clone` for the second cat; no setState/zustand setter in `useFrame` (mutate refs); all motion multiplied by `delta`; foliage stays instanced; hold 60fps or cut. Every new tunable number (interpolation rate, send rate, room-id length) goes in `constants.ts`.

---

## Design Notes (for Jony)

- **Host screen** is a new DOM overlay over the canvas, matching `CreateCat.tsx` (never WebGL). It shows a large, clean QR and a "waiting for your friend" state, then (P1) a "your friend wants to join, tap to let them in" prompt. Touch targets >=44px.
- **The friend does nothing in-app to scan.** They use the iOS Camera app. There is no in-app scanner UI to design. This is simpler than a two-QR flow.
- **Presence** should be glanceable: the child should know from across the room whether their friend is connected. A small, quiet indicator, not a HUD panel (the HUD stays two bars and one button).
- **Peer cat** uses the existing recolor path. No new model. A nameplate is optional and probably unnecessary.
- **Emotes** (P1): a small tap target, a fixed set, canned feedback. No keyboard, ever.
- **Disconnect** state needs a plain, non-alarming message. A dropped friend is normal (screen locks), not an error to panic about.

---

## Content-Safety Constraints (non-negotiable, from CLAUDE.md)

- No free-text input anywhere in multiplayer. Emotes are a fixed, hand-authored set.
- Player cats cannot fight or damage each other. Co-op only.
- No romance, mating, kits, nuzzling, gore, or death, same as the rest of the game. Two real players changes nothing here.
- No product telemetry, no analytics, no share buttons. The static host and signaling service hold no game data and no personal data.

---

## Open Questions

Genuinely open. Each lists a proposed default so implementation is not blocked, but Phil should confirm.

- [ ] **Admit step priority** (product/safety): is host-admits-the-joiner (US-3) a P0 safety requirement, or an acceptable P1? *Proposed: P1, since the scan is in-person and session ids are short-lived and random.*
- [ ] **Peer bar visibility** (product): show only your own health/hunger, or also the friend's? *Proposed: your own only.*
- [ ] **Hunt credit** (product): does the catcher get the credit on their own device (personal progression), or is progress shared? *Proposed: personal, per-player.*
- [ ] **Dropped-friend behavior** (design): when the peer disconnects, remove the cat instantly, or fade it out over a second? *Proposed: fade out, then remove.*
- [ ] **Screen-lock presence** (design): treat a screen lock the same as a full disconnect, or as a distinct "away" state? *Proposed: treat as disconnect for v1; "away" is P2.*
- [ ] **Connect/disconnect audio** (design, minor): add a chirp for presence changes? *Proposed: yes, P1.*

---

## Rollout / Phasing

| Phase | Scope | Gate |
|---|---|---|
| **Pre-flight** | Two-iPad WebRTC connectivity spike on the home Wi-Fi | Go/no-go. If it will not connect, stop and revisit before building. |
| **Tier 0** | Hosted PWA (P0-1), signaling (P0-2), host screen (P0-3), scan-join (P0-4), transport (P0-5), shared world (P0-6), remote cat (P0-7), disconnect handling (P0-8). Two cats see each other move. | Chrome self-verify + iPad confirm (framerate, real scan-and-join). |
| **Tier 1** | Shared prey with host-authoritative catches (P1-1). Completes backlog #11. | Chrome + iPad. |
| **Tier 2** | Emotes (P1-3), admit gate (P1-2), presence chirp (P1-4). | Chrome + iPad. |
| **Deferred** | All P2 items. | Not scheduled. |

ASSUMED effort, pending the spike and device testing: the gameplay changes (render a second cat, interpolate, puppet-mode prey) are small, roughly 1-2 sessions. The hosted PWA, the signaling service, and the join flow are the bulk of the work and the parts that bend the project's constraints. Tier 0 is the honest first milestone; do not scope past it until two cats are provably moving in one forest on the iPad.
