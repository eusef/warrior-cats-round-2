/**
 * Onboards a device that has never trusted the CA, then hands it to the game.
 *
 * This is the only plain-http thing this project serves, and it is plain http on
 * purpose. THE CHICKEN AND EGG: a device that has not yet trusted the CA cannot
 * open anything served over HTTPS, because that is exactly what the CA is for. So
 * the one thing it needs first has to arrive over http. That is also why this is
 * a separate server rather than a route on Vite: folding it in would stop it
 * working for the only device that ever needs it.
 *
 * THE QR CODE POINTS HERE, NOT AT THE GAME. A friend holding up a camera does not
 * know whether her iPad has trusted the certificate, and neither does the child
 * showing her the code. So this page finds out: it probes the game's https origin
 * and either forwards straight through, in about a tenth of a second, or shows
 * the three steps and forwards as soon as they are done. One code works for a
 * fresh iPad and an onboarded one, which is the whole reason it is worth an extra
 * hop. Before this, the QR encoded an https URL that an un-onboarded iPad
 * physically could not open: a bare TLS error and a dead end.
 *
 * Nothing here reaches the internet. The certificate is read off the laptop and
 * handed to a device on the same link.
 *
 *   node tools/ca-server.mjs
 *   http://<host>.local:7173/              onboard, then play
 *   http://<host>.local:7173/?join=ABCD    from a scanned code, room carried through
 *   http://<host>.local:7173/?stay         never auto-forward (for debugging)
 */
import { createServer } from 'node:http'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Must match NET_ONBOARD_PORT in src/game/constants.ts, and the banner in
 * tools/serve.sh. Duplicated rather than imported because this is a plain node
 * script with no build step, so it cannot read a .ts file.
 *
 * NOT 8080, which is too common to hand to a child as an address, and NOT 4173
 * or 5174: those are where Vite goes on its own, and a stray Vite landing on the
 * onboarding port would serve the game to the one device that cannot load it.
 */
const PORT = 7173

/** Must match `server.port` in vite.config.ts. Same duplication, same reason. */
const GAME_PORT = 5173

const local = execSync('scutil --get LocalHostName').toString().trim() + '.local'
const caPath = resolve(ROOT, 'certs/rootCA.crt')

if (!existsSync(caPath)) {
  console.error('no certs/rootCA.crt -- run ./tools/make-certs.sh first')
  process.exit(1)
}
const ca = readFileSync(caPath)

const PAGE = `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Join the forest</title>
<style>
 [hidden]{display:none !important}
 body{font:400 19px/1.55 system-ui,-apple-system,sans-serif;background:#1d2a17;color:#dfe6d4;
      margin:0;padding:28px;max-width:640px}
 h1{font-size:30px;font-weight:700;margin:0 0 6px}
 .sub{opacity:.6;margin:0 0 26px;font-size:16px}
 ol{padding-left:22px;margin:0} li{margin-bottom:18px}
 .btn{display:inline-block;background:#e8d9a0;color:#12180f;font-size:21px;font-weight:700;
      font-family:inherit;padding:15px 30px;border:0;border-radius:11px;text-decoration:none;
      min-height:44px;cursor:pointer}
 .btn.ghost{background:rgba(232,217,160,.14);color:#e8d9a0;
      border:2px solid rgba(232,217,160,.45)}
 b{color:#e8d9a0} .dim{opacity:.6;font-size:16px}
 .last{margin-top:30px;padding-top:20px;border-top:1px solid rgba(223,230,212,.18)}
 code{font:600 17px ui-monospace,Menlo,monospace;color:#9fd67a;word-break:break-all}
</style></head><body>
<h1>Join the forest</h1>
<p class="sub" id="sub">Checking this iPad...</p>

<div id="steps" hidden>
 <ol>
  <li><a class="btn" href="/ca">Get the certificate</a></li>
  <li>Open <b>Settings</b>. Near the top it now says <b>Profile Downloaded</b>.
      Tap it, then tap <b>Install</b> (top right).</li>
  <li>Still in Settings, go to <b>General &rarr; About &rarr; Certificate Trust
      Settings</b> and switch <b>mkcert</b> on.
      <br><span class="dim">This step is the one people miss. Installing the
      profile on its own is not enough.</span></li>
 </ol>
 <p class="last">Then come straight back here. The forest opens by itself.<br>
  <br><button type="button" class="btn ghost" id="recheck">I have done all three</button>
  <br><span class="dim">Nothing happening? The game is at <code id="addr"></code></span></p>
</div>

<div id="ready" hidden>
 <p>This iPad already trusts the certificate. Nothing to install.</p>
 <a class="btn" id="go" href="#">Open the forest</a>
</div>

<script>
(function () {
  var q = new URLSearchParams(location.search)
  var room = q.get('join')
  var stay = q.has('stay')

  // Derived from the address that actually got them here, never a baked-in name.
  // papa.local and 192.168.2.1 are both on the certificate, and whichever one
  // was scanned or typed is the one that will keep working.
  var origin = 'https://' + location.hostname + ':' + ${GAME_PORT}
  var game = origin + '/' + (room ? '?join=' + encodeURIComponent(room) : '')

  var el = function (id) { return document.getElementById(id) }
  var sub = el('sub'), steps = el('steps'), ready = el('ready')
  el('go').href = game
  el('addr').textContent = origin
  var n = 0, busy = false

  function probe() {
    // The whole test, in one request. A no-cors fetch resolves with an opaque
    // response whatever the status, and REJECTS when TLS fails -- which is
    // exactly the difference between an iPad that trusts the CA and one that does
    // not. Nothing is read out of the response, only whether it arrived at all.
    //
    // http asking for https is an upgrade, not mixed content, so this is allowed
    // from this page. Cache-busted, because a browser that has already refused
    // this origin once has to be made to open a genuinely new connection rather
    // than answer from whatever it remembers.
    //
    // A timeout counts as untrusted. On one Wi-Fi link a reachable server answers
    // in single-digit milliseconds, so 2.5s of silence is not slowness.
    var ctl = new AbortController()
    var timer = setTimeout(function () { ctl.abort() }, 2500)
    return fetch(origin + '/?probe=' + (++n) + '.' + Date.now(), {
      mode: 'no-cors', cache: 'no-store', signal: ctl.signal
    }).then(
      function () { clearTimeout(timer); return true },
      function () { clearTimeout(timer); return false }
    )
  }

  function check() {
    if (busy) return
    busy = true
    probe().then(function (ok) {
      busy = false
      if (!ok) {
        ready.hidden = true
        steps.hidden = false
        sub.textContent = 'Three steps, once per iPad. No internet needed.'
        return
      }
      steps.hidden = true
      if (stay) {
        ready.hidden = false
        sub.textContent = 'Ready.'
        return
      }
      sub.textContent = 'Opening the forest...'
      // replace(), not href: with href, Back lands here and forwards again, and
      // there is no way off this page.
      location.replace(game)
    })
  }

  // Re-probe every time she comes back to Safari, which is precisely what she
  // does after installing the profile and flipping the trust switch. This is the
  // reason she never has to type an https address anywhere: the page notices.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') check()
  })
  // Also covers a back-navigation restored from the page cache, where no script
  // re-runs and visibilitychange never fires. The busy flag makes the overlap
  // with the load-time probe a no-op rather than a second request.
  window.addEventListener('pageshow', check)
  el('recheck').addEventListener('click', check)
  check()
})()
</script>
</body></html>`

createServer((req, res) => {
  const path = (req.url || '/').split('?')[0]
  if (path === '/ca' || path === '/ca.crt') {
    res.writeHead(200, {
      // This exact content-type is what makes iOS Safari offer to install a
      // configuration profile instead of printing the PEM on screen as text.
      'content-type': 'application/x-x509-ca-cert',
      'content-disposition': 'attachment; filename="warrior-cats.crt"',
    })
    return res.end(ca)
  }
  // Every other path serves the page, so a mistyped address still lands on the
  // three steps rather than on a 404 a child cannot read.
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    // The page probes on load. A cached copy is harmless, but a cached copy of
    // an OLD page would keep pointing a scanned code at the wrong place.
    'cache-control': 'no-store',
  })
  res.end(PAGE)
  // No host argument, which binds BOTH stacks (`::` with IPv4-mapped) rather
  // than the `'0.0.0.0'` this used to pass. That was IPv4-only, and mDNS
  // advertises AAAA records: `papa.local` resolves to an IPv6 address first, so
  // Chrome on the laptop got connection refused and showed a bare error page
  // while curl succeeded by falling back to 127.0.0.1. On the iPad it happened to
  // pick IPv4 and worked, which is exactly the kind of luck not to depend on.
}).listen(PORT, () => {
  console.log(`[ca] http://${local}:${PORT}/   (plain http, on purpose)`)
})
