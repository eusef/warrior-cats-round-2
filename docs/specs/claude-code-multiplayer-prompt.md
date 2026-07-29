# Claude Code Prompt: Warrior Cats Multiplayer

## How to use this
1. Save the PRD into your repo as `docs/multiplayer-PRD.md` so the references below resolve.
2. From the repo root, paste everything below the line into Claude Code.
3. It will come back with a Phase 0 plan first. Approve or adjust before it writes code.

---

You are implementing local two-player co-op for this Warrior Cats game. Before writing any code, read `CLAUDE.md` and `docs/specs/warrior-cats-multiplayer-PRD.md` in full. They govern everything. If anything in this prompt conflicts with `CLAUDE.md`, stop and flag it rather than guessing.

**Objective:** two kids, each on their own iPad, on the same Wi-Fi, in the same forest, seeing each other move and hunting the same prey. Onboarding is a single QR scan: the host shows a QR, the friend scans it with the iOS Camera app, Safari opens the game and drops them into the host's session. Full detail is in the PRD.

**This is a multi-phase build. Do NOT attempt all of it in one pass.** Work one phase at a time, in order. For each phase, first propose your plan (the component tree, the state shape, the message-protocol changes, and any new dependency or infrastructure), and wait for my approval before writing code, exactly as `CLAUDE.md` requires. Do not write implementation in the same turn as the plan.

### Non-negotiable constraints (from CLAUDE.md and the PRD)
- **HTTPS is mandatory.** Service workers and WebRTC require a secure context. The app is delivered over HTTPS, never a plain LAN `http` origin. This is the whole reason we host it. A LAN `http` origin silently registers no service worker and blocks WebRTC.
- **The game data path stays peer-to-peer** between the two iPads over the LAN. The signaling service only introduces the peers, then steps aside. No game data flows through it.
- **Second cat:** render the peer's cat with `SkeletonUtils.clone`, or both cats share one skeleton and animate identically. This exact pitfall is called out in `CLAUDE.md`.
- **No `setState` or zustand setters inside `useFrame`.** High-frequency network state (peer pose, prey stream) mutates refs. Discrete state (connection status, identity) goes through the store.
- **Ask before adding any npm package.** You will likely need a QR-encoder to display the host QR. The friend scans with the native Camera app, so no scanner library is needed. Propose the encoder, do not just add it.
- **60fps on the iPad or cut the feature.** A second animated cat plus interpolation must stay inside the existing draw-call and triangle budget.
- **Authority:** the host owns the world seed, all prey simulation, and time-of-day. Each guest owns only its own cat's pose and actions. Needs, saves, and progression stay per-device and are never synced.
- **Content safety:** no text chat and no cat-versus-cat combat, ever. Player interaction is co-op plus a fixed set of emotes.
- Put every new tunable number (send rates, interpolation rate, room-id length) in `constants.ts`.
- Single-player must keep working exactly as it does today whenever no peer is connected.

### Verification, every phase
Follow the `CLAUDE.md` definition of done: self-verify headlessly in Chrome using the `window.__game` bridge where possible, then I confirm on the iPad. Nothing is done until it runs at 60fps on the iPad. Do not mark work complete on Chrome results alone. When I confirm a phase on the iPad, update the backlog and README status per the repo's conventions.

### Phases

**Phase 0: prove the pipe (do this first).**
Goal: two iPads on my home Wi-Fi scan-to-connect and exchange a heartbeat, with no game logic yet. This is the risky part, so we prove it before building on it.
- A minimal hosted client page (part of the app build) that can act as host or guest.
- A tiny signaling service that relays the WebRTC offer, answer, and ICE candidates between two peers in a session keyed by a short id, then tears the room down once connected. Propose the simplest free-tier option (for example a Cloudflare Worker) and flag any billing implication or paid-tier requirement before I deploy.
- Host shows a QR encoding the app URL plus a session id. Guest opens that URL and auto-connects through the signaling service.
- On connect, each side sends a heartbeat and logs "connected to peer" plus the round-trip time.
- Set up the static-host build config and the signaling service, and give me the exact commands to deploy both. I will deploy, since you will not have my hosting credentials, then test on two iPads.
- Deliverable: I can scan on two real iPads and see "connected." If my router blocks device-to-device traffic, we find out here, before any game code exists.

**Phase 1: Tier 0, see each other move.**
Goal: integrate the Phase 0 transport into the game so both cats appear in the same forest and move in real time.
- A new `src/net/` module wrapping the peer connection and the message protocol (see the PRD table).
- `RemoteCat.tsx`: clone the fox rig with `SkeletonUtils.clone`, recolor by the peer's identity, interpolate pose from refs inside `useFrame`, and sit on terrain via the shared ground-height function.
- Extend `live.ts` with a `remote` block. Add `net.*` fields to the store to drive a host / waiting / connected / lost UI.
- Host sends its world seed at connect. Guest adopts it for the session.
- A host screen as a DOM overlay (follow the `CreateCat.tsx` pattern): show the QR and a "waiting for your friend" state, and handle disconnect gracefully (show a message, fall back to solo, never freeze).
- Acceptance: the checklists for US-1, US-2, US-5, and US-8 in the PRD pass, at 60fps on the iPad.

**Phase 2: Tier 1, hunt together.**
Goal: shared prey.
- Give the prey system an authority mode: authoritative on the host (runs AI, streams positions), puppet on the guest (renders the stream, no local AI).
- Guest sends catch attempts. Host resolves and streams the result. The catcher gets the credit on their own device.
- Acceptance: US-6 passes, with no desync and no double-credit, at 60fps on the iPad.

**Later (do not build yet):** emotes, the host-admits-the-joiner safety step, a connect/disconnect chirp, and everything in the PRD's P2 list. We schedule these only after Tier 1 works on the iPad.

### What not to do
- Do not build Phase 1 or Phase 2 before Phase 0 connects on my two iPads.
- Do not add text chat, PvP, accounts, analytics, or a public or listed deploy.
- Do not serve the app over plain `http` on the LAN.
- Do not regress single-player.

Start now by reading `CLAUDE.md` and `docs/specs/warrior-cats-multiplayer-PRD.md`, then give me your Phase 0 plan. Do not write code yet.
