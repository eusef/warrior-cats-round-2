import { createRoot } from 'react-dom/client'
import '../../index.css'
import { SpikePage } from './SpikePage'

/**
 * Entry for `net.html`, the Phase 0 connection spike.
 *
 * Deliberately NOT wrapped in `<StrictMode>`, unlike `main.tsx`. StrictMode
 * double-invokes effects in development, which for this page means opening two
 * `RTCPeerConnection`s and two signalling sockets, so the second socket into a
 * room is the page's own and it immediately reports the room as full. That
 * failure looks exactly like a real one and would send a debugging session
 * straight at the Worker, which would be innocent.
 */
createRoot(document.getElementById('root')!).render(<SpikePage />)
