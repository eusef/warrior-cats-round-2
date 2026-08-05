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

/**
 * Port the signalling relay listens on, over PLAIN http, on LOOPBACK ONLY.
 * Must match NET_SIGNAL_PORT in src/game/constants.ts and the --port in
 * signaling/package.json.
 *
 * Deliberately not 8787, wrangler's default: another project on this laptop
 * was already listening there, so wrangler could not bind and this proxy
 * forwarded /signal into that unrelated server. The health probe passed and
 * pairing failed, which looks exactly like a router problem.
 */
const SIGNAL_PORT = 8791
/** Must match NET_SIGNAL_PATH in src/game/constants.ts. */
const SIGNAL_PATH = '/signal'

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
    proxy: {
      /**
       * The signalling relay, folded into this origin.
       *
       * This proxy is the fix for a real device failure, not a tidiness pass.
       * The relay used to serve its own HTTPS on 8787. From the laptop it was
       * fine: curl worked, Chrome worked, `openssl s_client` showed the same
       * certificate and the same TLS 1.3 as 5173, and it was bound to all
       * interfaces with the firewall off. Both iPads still failed to open a
       * single connection to it, the health fetch and the WebSocket alike,
       * while happily loading this page from 5173 over that same certificate.
       *
       * Proxying removes the question instead of answering it. The iPads only
       * ever talk to 5173, there is no cross-origin request so CORS stops
       * applying, and the relay needs no certificate at all now.
       *
       * `ws: true` is the load-bearing part. Without it the health probe would
       * pass and every WebSocket upgrade would 404, which reads as "the relay
       * is up but pairing is broken" and is a miserable thing to debug.
       */
      [`${SIGNAL_PATH}`]: {
        target: `http://127.0.0.1:${SIGNAL_PORT}`,
        ws: true,
        rewrite: (p) => p.replace(new RegExp(`^${SIGNAL_PATH}`), ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        // The game, and the only entry. The Phase 0 networking spike used to be
        // a second one; it was deleted when Phase 1 folded the transport into
        // the game, and the connect screen lives on the title screen now.
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
