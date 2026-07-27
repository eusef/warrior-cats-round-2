import { Suspense, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { CAM_FAR, CAM_FOV, CAM_NEAR } from './game/constants'
import { useGame } from './game/store'
import { Terrain, WorldSkirt } from './world/Terrain'
import { Foliage } from './world/Foliage'
import { Camp } from './world/Camp'
import { Lighting } from './world/Lighting'
import { PlayerCat } from './actors/PlayerCat'
import { Prey } from './actors/Prey'
import { FollowCamera } from './actors/FollowCamera'
import { Hud } from './hud/Hud'
import { CreateCat } from './ui/CreateCat'
import { Ceremony } from './ui/Ceremony'
import { DebugOverlay, DebugSampler } from './debug/DebugOverlay'
import { DEBUG } from './debug/expose'
import { TITLE_HINT } from './content/lines'
import { AudioDriver } from './audio/AudioDriver'
import { unlockAudio } from './audio/engine'

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
          <Camp />
          {/* PlayerCat must mount before Prey: R3F runs useFrame in subscription
              order, and the mice read live.cat.crouched the same frame it is set.
              Reversed, stalking was always one frame stale and spooked them. */}
          <PlayerCat />
          <Prey />
        </Suspense>
        <FollowCamera />
        {/* Last frame subscriber, deliberately: it reads the cat state every
            other system has already finished writing this frame. */}
        <AudioDriver />
        {DEBUG && <DebugSampler />}
      </Canvas>

      <Hud />
      <CreateCat />
      <Ceremony />
      <DebugOverlay />
      <TitleScreen />
    </>
  )
}

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

  const begin = useCallback(() => {
    // Must happen synchronously inside the gesture. iOS will not let an
    // AudioContext start anywhere else, and a resume() deferred to a promise
    // or a timeout is already outside the gesture as far as Safari is concerned.
    unlockAudio()
    start()
  }, [start])

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
    </div>
  )
}
