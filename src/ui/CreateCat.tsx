import { useCallback } from 'react'
import {
  CREATE_SHEET_HEIGHT,
  EYE_COLORS,
  PELTS,
} from '../game/constants'
import {
  CREATE_BEGIN,
  CREATE_EYES_LABEL,
  CREATE_NAME_LABEL,
  CREATE_PELT_LABEL,
  CREATE_TITLE,
  NAME_PREFIXES,
} from '../content/lines'
import { catName, useGame } from '../game/store'

/**
 * Character creation. A sheet across the bottom of the screen with the real
 * cat standing above it on the canvas, slowly orbiting: every tap repaints the
 * actual model, so she is choosing a cat rather than choosing a swatch.
 *
 * Plain DOM over the canvas like the rest of the HUD, never in WebGL. It
 * re-renders on a tap and at no other time, and it adds no draw calls.
 */
export function CreateCat() {
  const phase = useGame((s) => s.phase)
  const identity = useGame((s) => s.identity)
  const setIdentity = useGame((s) => s.setIdentity)
  const beginPlay = useGame((s) => s.beginPlay)

  const begin = useCallback(() => beginPlay(), [beginPlay])

  if (phase !== 'create') return null

  const name = catName(identity)

  return (
    <div
      className="no-touch-scroll"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(${CREATE_SHEET_HEIGHT}px + var(--safe-bottom))`,
        paddingBottom: 'var(--safe-bottom)',
        paddingLeft: 'calc(22px + var(--safe-left))',
        paddingRight: 'calc(22px + var(--safe-right))',
        paddingTop: 16,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        background: 'linear-gradient(180deg, rgba(20,31,16,0.86) 0%, rgba(13,20,10,0.96) 100%)',
        borderTop: '2px solid rgba(255,255,255,0.22)',
        boxShadow: '0 -14px 40px rgba(0,0,0,0.45)',
      }}
    >
      {/* Title and the live name, on one line so the sheet stays short. The
          name is the payoff of the whole screen, so it is the biggest thing
          on it and it updates on every tap. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1, opacity: 0.55 }}>
          {CREATE_TITLE}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '0.01em',
            color: '#ffd98a',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {name}
        </div>
      </div>

      {/* Pelt and eyes share a row. Ten swatches fit an iPad in landscape. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <Row label={CREATE_PELT_LABEL}>
          {PELTS.map((p, i) => (
            <Swatch
              key={p.label}
              selected={i === identity.pelt}
              onTap={() => setIdentity({ pelt: i })}
              background={`linear-gradient(150deg, ${p.main} 0%, ${p.main} 56%, ${p.light} 56%, ${p.light} 100%)`}
            />
          ))}
        </Row>
        <Row label={CREATE_EYES_LABEL}>
          {EYE_COLORS.map((e, i) => (
            <Swatch
              key={e.label}
              selected={i === identity.eyes}
              onTap={() => setIdentity({ eyes: i })}
              background={e.color}
            >
              {/* A slit pupil, so an eye colour reads as an eye. */}
              <div
                style={{
                  width: 9,
                  height: 30,
                  borderRadius: '50%',
                  background: 'rgba(14,16,10,0.88)',
                }}
              />
            </Swatch>
          ))}
        </Row>
      </div>

      {/* Names, then the one way out of this screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1 }}>
        <Row label={CREATE_NAME_LABEL}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 8,
              flex: 1,
            }}
          >
            {NAME_PREFIXES.map((prefix, i) => (
              <PrefixButton
                key={prefix}
                label={prefix}
                selected={i === identity.prefix}
                onTap={() => setIdentity({ prefix: i })}
              />
            ))}
          </div>
        </Row>

        <button
          type="button"
          onPointerDown={begin}
          className="no-touch-scroll"
          style={{
            flex: '0 0 auto',
            width: 172,
            height: 92,
            borderRadius: 20,
            border: '3px solid rgba(255,255,255,0.55)',
            background: 'linear-gradient(180deg, #e8a13a 0%, #c9721f 100%)',
            color: '#2a1a06',
            // Buttons do not inherit the page font unless told to, and the
            // `font:` shorthand cannot take `inherit` as its family.
            fontFamily: 'inherit',
            fontSize: 30,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '0.01em',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
            cursor: 'pointer',
          }}
        >
          {CREATE_BEGIN}
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1,
          opacity: 0.62,
          width: 52,
          flex: '0 0 auto',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

interface SwatchProps {
  background: string
  selected: boolean
  onTap: () => void
  children?: React.ReactNode
}

/** 64px of colour inside a 76px target: comfortably over the 44px minimum. */
function Swatch({ background, selected, onTap, children }: SwatchProps) {
  return (
    <button
      type="button"
      onPointerDown={onTap}
      className="no-touch-scroll"
      style={{
        width: 62,
        height: 62,
        padding: 0,
        borderRadius: '50%',
        background,
        border: selected ? '5px solid #ffffff' : '3px solid rgba(255,255,255,0.28)',
        transform: selected ? 'scale(1.1)' : 'scale(1)',
        transition: 'transform 110ms ease-out, border-color 110ms linear',
        boxShadow: selected ? '0 0 16px rgba(255,214,130,0.7)' : '0 3px 8px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function PrefixButton({
  label,
  selected,
  onTap,
}: {
  label: string
  selected: boolean
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onPointerDown={onTap}
      className="no-touch-scroll"
      style={{
        height: 52,
        borderRadius: 14,
        border: selected ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.24)',
        background: selected ? '#ffd98a' : 'rgba(255,255,255,0.09)',
        color: selected ? '#241704' : '#f4efe2',
        fontFamily: 'inherit',
        fontSize: 21,
        fontWeight: selected ? 800 : 600,
        lineHeight: 1,
        letterSpacing: '0.01em',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
