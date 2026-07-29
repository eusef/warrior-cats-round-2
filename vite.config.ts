import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * HTTPS on the LAN, if the certificate exists.
 *
 * This is what makes two-player co-op possible at all. WebRTC requires a secure
 * context, and `http://192.168.1.52:5173` is not one: it does not warn, it just
 * silently has no `RTCPeerConnection`. Confirmed on the iPad, 2026-07-29, that
 * a locally-trusted certificate flips `isSecureContext` to true and WebRTC
 * becomes available, with no internet involved anywhere.
 *
 * CONDITIONAL ON PURPOSE. With no `certs/`, this falls back to plain http and
 * the game runs exactly as it always has. Solo play must never depend on a
 * certificate having been generated, and a fresh clone must not fail to start.
 *
 * Run `./tools/make-certs.sh` to create it.
 */
const CERT = resolve(__dirname, 'certs/lan-cert.pem')
const KEY = resolve(__dirname, 'certs/lan-key.pem')
const https =
  existsSync(CERT) && existsSync(KEY)
    ? { cert: readFileSync(CERT), key: readFileSync(KEY) }
    : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // 5173 is not negotiable: her iPad bookmark points at it, and Vite silently
    // falling forward to 5174 when something else holds the port looks exactly
    // like the game being broken.
    port: 5173,
    strictPort: true,
    https,
  },
  build: {
    rollupOptions: {
      input: {
        // The game.
        main: resolve(__dirname, 'index.html'),
        // The Phase 0 networking spike. A separate entry, importing nothing
        // from the game beyond `constants.ts`, so nothing here can regress
        // single player. Deleted once the transport is folded into the game.
        net: resolve(__dirname, 'net.html'),
      },
    },
  },
})
