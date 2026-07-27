import { useEffect, useRef } from 'react'
import { advance, useFrame, useThree } from '@react-three/fiber'
import { HUNTS_TO_WARRIOR } from '../game/constants'
import { live } from '../game/live'
import { useGame } from '../game/store'
import { attachSceneToBridge, attachStepToBridge, DEBUG } from './expose'
import { audioDiagnostics } from '../audio/engine'

/**
 * Samples gl.info.render inside the R3F loop and hands the numbers to a DOM
 * readout. ?debug=1 only, so her build never shows any of it.
 */
export function DebugSampler() {
  const state = useThree()
  const { gl, scene, camera } = state
  const frames = useRef(0)
  const elapsed = useRef(0)

  // Hand the live three.js objects to the bridge so verification can assert on
  // real world-space transforms instead of judging from pixels.
  useEffect(() => {
    attachSceneToBridge(scene, camera, gl)

    /**
     * Deterministic frame stepping. Chrome parks requestAnimationFrame whenever
     * the window is occluded, which makes "drag the stick and see if the cat
     * moved" impossible to check from a headless driver. This runs the real
     * loop -- every useFrame subscriber, then a render -- N times at a fixed
     * delta, so a verification run is reproducible and independent of whether
     * anyone is looking at the window.
     */
    attachStepToBridge((count: number, dt: number) => {
      const clock = state.clock
      const realGetDelta = clock.getDelta.bind(clock)
      clock.getDelta = () => dt
      try {
        for (let i = 0; i < count; i++) advance(performance.now(), true, state)
      } finally {
        clock.getDelta = realGetDelta
      }
      return count * dt
    })
  }, [state, scene, camera, gl])

  useFrame((_, delta) => {
    frames.current++
    elapsed.current += delta
    if (elapsed.current >= 0.25) {
      live.stats.fps = frames.current / elapsed.current
      frames.current = 0
      elapsed.current = 0
    }
    live.stats.drawCalls = gl.info.render.calls
    live.stats.triangles = gl.info.render.triangles
  })

  return null
}

export function DebugOverlay() {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!DEBUG) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = ref.current
      if (!el) return
      const s = live.stats
      const c = live.cat
      const g = useGame.getState()
      const a = audioDiagnostics()
      el.textContent =
        `fps      ${s.fps.toFixed(0).padStart(5)}\n` +
        `draws    ${String(s.drawCalls).padStart(5)}  / 100\n` +
        `tris     ${String(s.triangles).padStart(5)}  / 150k\n` +
        `prey     ${String(s.preyActive).padStart(5)}\n` +
        `hp/food  ${live.health.toFixed(0).padStart(3)} ${live.hunger.toFixed(0).padStart(3)}\n` +
        `pos      ${c.pos.x.toFixed(1)} ${c.pos.y.toFixed(1)} ${c.pos.z.toFixed(1)}\n` +
        `speed    ${c.speed.toFixed(2)}\n` +
        `action   ${c.action}${live.resting ? ' (rest)' : ''}\n` +
        `hunts    ${g.huntCount}/${HUNTS_TO_WARRIOR}${g.identity.warrior ? ' warrior' : ''}` +
        `   seed ${g.seed}\n` +
        // Three numbers that tell the three iOS failure modes apart. state
        // not running = the gesture never unlocked it. cues 0 = the driver is
        // not firing. Both fine but lvl 0 = nothing reaches the master bus.
        // All three healthy and still silent = the device is routing it away.
        `audio    ${a.state} ${a.rate}k  lvl ${a.level.toFixed(3)}\n` +
        `cues     ${a.total} (meow ${a.meow} step ${a.step} bird ${a.bird})` +
        `${a.purring ? ' purr' : ''}`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!DEBUG) return null

  return (
    <pre
      ref={ref}
      style={{
        position: 'fixed',
        top: 'calc(8px + var(--safe-top))',
        right: 'calc(10px + var(--safe-right))',
        margin: 0,
        padding: '8px 12px',
        font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#c8ffb0',
        background: 'rgba(0,0,0,0.62)',
        borderRadius: 8,
        pointerEvents: 'none',
        whiteSpace: 'pre',
        zIndex: 50,
      }}
    />
  )
}
