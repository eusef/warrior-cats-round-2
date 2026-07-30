import { Suspense, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { CAM_FAR, CAM_FOV, CAM_NEAR } from './game/constants'
import { useGame } from './game/store'
import { Terrain, WorldSkirt } from './world/Terrain'
import { Foliage } from './world/Foliage'
import { Landmarks } from './world/Landmarks'
import { Camp } from './world/Camp'
import { Fireflies } from './world/Fireflies'
import { Lighting } from './world/Lighting'
import { PlayerCat } from './actors/PlayerCat'
import { RivalCat } from './actors/RivalCat'
import { RemoteCat } from './actors/RemoteCat'
import { Prey } from './actors/Prey'
import { FollowCamera } from './actors/FollowCamera'
import { Hud } from './hud/Hud'
import { CreateCat } from './ui/CreateCat'
import { Ceremony } from './ui/Ceremony'
import { ConnectScreen } from './ui/ConnectScreen'
import { DebugOverlay, DebugSampler } from './debug/DebugOverlay'
import { DEBUG } from './debug/expose'
import { COOP_HOST_LABEL, COOP_JOIN_LABEL, TITLE_HINT } from './content/lines'
import { AudioDriver } from './audio/AudioDriver'
import { unlockAudio } from './audio/engine'
import { NetDriver } from './net/NetDriver'
import { roomFromUrl } from './net/signal'

export function App() {
  return (
    <>
      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: CAM_FOV, near: CAM_NEAR, far: CAM_FAR, position: [0, 4, 10] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <Suspense fallback={null}>
          <Lighting />
          <Terrain />
          <WorldSkirt />
          <Foliage />
        <Landmarks />
          <Camp />
          <Fireflies />
          {/* PlayerCat must mount before Prey: R3F runs useFrame in subscription
              order, and the mice read live.cat.crouched the same frame it is set.
              Reversed, stalking was always one frame stale and spooked them. */}
          <PlayerCat />
          {/* After PlayerCat: she reads live.cat this frame and resolves her
              strike against it, and on a tie the player's strike lands first,
              which is the right direction for a 10-year-old to be wrong in. */}
          <RivalCat />
          {/* Inside the Suspense boundary because it calls useGLTF, like both
              cats above it. Order matters here too, and for the same reason as
              theirs: R3F runs useFrame in JSX mount order, so the peer's cat is
              eased toward the newest wire pose AFTER PlayerCat has moved this
              frame and before the camera and the audio read the scene. */}
          <RemoteCat />
          <Prey />
        </Suspense>
        <FollowCamera />
        {/* Last frame subscriber, deliberately: it reads the cat state every
            other system has already finished writing this frame. */}
        <AudioDriver />
        {/* After AudioDriver, so it is now the last frame subscriber: the pose
            it sends is the one PlayerCat computed THIS frame, not last frame's.
            Inside the Canvas rather than on its own rAF for the same reason
            AudioDriver is, so the whole system steps under __game.step() and
            shares the delta the game integrated with. Outside Suspense: it
            loads no model, and it must keep sending while one is still fetching. */}
        <NetDriver />
        {DEBUG && <DebugSampler />}
      </Canvas>

      <Hud />
      <CreateCat />
      <Ceremony />
      <DebugOverlay />
      <TitleScreen />
      {/* Last, and at z-index 110: the host opens it from the title screen,
          which is still mounted underneath at 100. */}
      <ConnectScreen />
    </>
  )
}

/**
 * Whether the co-op button exists at all, decided once, at module scope.
 *
 * This single expression is what makes "solo play must work with no
 * certificate, no relay and no peer" structural instead of a promise. On a plain
 * http LAN origin -- no `certs/`, so Vite serves http -- `isSecureContext` is
 * false and there is no `RTCPeerConnection` constructor at all: not a broken
 * one, not a throwing one, simply absent. So the button is not rendered, nothing
 * reachable from the title screen touches src/net/, and the screen is
 * byte-identical to the one she has been playing.
 *
 * Feature-detected rather than asked of the URL, because both halves have to be
 * true and only the browser knows: https on its own is not enough on an old
 * Safari, and `RTCPeerConnection` on its own is not enough on an insecure origin.
 */
const CAN_COOP = window.isSecureContext && 'RTCPeerConnection' in window

/**
 * The `?join=` room on this page's URL, read once. The URL cannot change under
 * a running page without a reload, so re-reading it per render would ask the
 * same question and get the same answer.
 */
const JOIN_ROOM = roomFromUrl()

/**
 * Covers the canvas until the first tap. That tap is also the user gesture the
 * audio context will need when sound lands (backlog item 3), which is why it
 * exists at all rather than dropping straight into play.
 *
 * `start()` reads the save and routes: a cat she has already made goes straight
 * to play, no cat sends her to creation.
 */
function TitleScreen() {
  const phase = useGame((s) => s.phase)
  const start = useGame((s) => s.start)
  const netHost = useGame((s) => s.netHost)
  const setPendingJoin = useGame((s) => s.setPendingJoin)

  const begin = useCallback(() => {
    // Must happen synchronously inside the gesture. iOS will not let an
    // AudioContext start anywhere else, and a resume() deferred to a promise
    // or a timeout is already outside the gesture as far as Safari is concerned.
    unlockAudio()
    start()
  }, [start])

  const coop = useCallback(
    (e: React.PointerEvent) => {
      // The whole title screen is one tap target. Without this the same finger
      // bubbles up to `begin` and starts a solo game underneath the connect
      // screen, and both would then be running.
      e.stopPropagation()
      e.preventDefault()

      // The state change goes first and the audio unlock second, so a throw on
      // the way through can only cost this session its sound, never leave the
      // button doing nothing at all. Still inside the gesture either way: React
      // flushes a discrete event's updates after the handler returns, so nothing
      // has unmounted by the time unlockAudio() runs.
      if (JOIN_ROOM) {
        // Parked rather than joined here. A friend may have no save, so start()
        // routes her into creation, and connecting from there would drop this
        // overlay on top of the sheet while she is picking a pelt. beginPlay()
        // spends it.
        setPendingJoin(JOIN_ROOM)
        start()
      } else {
        // No start() on the host path. NetDriver calls it once the peer is
        // actually on the other end, so the forest is never opened, and the
        // clock never started, for a friend who has not arrived yet.
        netHost()
      }
      unlockAudio()
    },
    [netHost, setPendingJoin, start],
  )

  if (phase !== 'title') return null

  return (
    <div
      className="no-touch-scroll"
      onPointerDown={begin}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        background: 'linear-gradient(170deg, #24361c 0%, #131d0f 100%)',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 68 }}>🐾</div>
      {/* Never use the `font:` shorthand with `inherit` as the family. It is not
          a legal value there, so the browser drops the whole declaration and
          the text silently renders at 16px/400. This title did exactly that
          from v1 until it was caught in Chrome. */}
      <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em' }}>
        Warrior Cats
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, opacity: 0.72 }}>
        {TITLE_HINT}
      </div>

      {CAN_COOP && (
        <button
          type="button"
          onPointerDown={coop}
          onContextMenu={(e) => e.preventDefault()}
          className="no-touch-scroll"
          style={{
            marginTop: 14,
            height: 62,
            padding: '0 34px',
            borderRadius: 18,
            border: '2px solid rgba(255,217,138,0.5)',
            background: 'rgba(255,217,138,0.13)',
            color: '#ffd98a',
            // Separate properties, never the `font:` shorthand: `inherit` is
            // not a legal family inside it, so the whole declaration is dropped
            // and the label lands at 16px/400. A <button> also does not inherit
            // the page font without being told.
            fontFamily: 'inherit',
            fontSize: 23,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '0.01em',
            cursor: 'pointer',
          }}
        >
          {JOIN_ROOM ? COOP_JOIN_LABEL : COOP_HOST_LABEL}
        </button>
      )}
    </div>
  )
}
