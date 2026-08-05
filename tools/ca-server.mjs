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
 * AND WHEN THE CAMERA WILL NOT READ THE CODE, SHE TYPES IT. That is the only
 * other way in, because there is no text field anywhere in the game: with no
 * `?join=` on the address this page shows a keypad of the thirty characters a
 * code can be made of, and once four are tapped it runs the very same probe a
 * scan runs and ends up in the very same two places. So the short address is
 * worth knowing by heart, and the host screen no longer promises something that
 * cannot be done.
 *
 * Nothing here reaches the internet. The certificate is read off the laptop and
 * handed to a device on the same link.
 *
 *   node tools/ca-server.mjs
 *   http://<host>.local:7173/              tap the code in, then onboard and play
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

/**
 * Must match NET_ROOM_ALPHABET and NET_ROOM_ID_LEN in src/game/constants.ts.
 * Duplicated for the same reason as the ports: no build step here, so no .ts.
 *
 * Thirty characters, because 0, 1, I, O, S and Z are all deliberately left out:
 * each of those is the twin of something else on screen, and a code has to be
 * readable from across a room. That omission is what makes it reasonable to put
 * the WHOLE alphabet on screen at once as keys -- thirty is a lot of buttons,
 * but there is no confusable pair among them, so the only mistake available is
 * plainly a mistake, and Undo covers it.
 */
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRTUVWXY'
const ROOM_LEN = 4

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

 /* The keypad. Never the CSS \`font\` shorthand with \`inherit\` as the family:
    that is not a legal shorthand and the browser drops the whole declaration,
    which cost this project every heading in v1. Separate properties only. */
 .slots{display:flex;gap:10px;margin:0 0 20px}
 .slot{width:58px;height:64px;border-radius:11px;box-sizing:border-box;
      background:rgba(223,230,212,.07);border:2px solid rgba(232,217,160,.32);
      display:flex;align-items:center;justify-content:center;
      font-size:32px;font-weight:700;line-height:1;color:#e8d9a0}
 .slot.on{background:rgba(232,217,160,.17);border-color:#e8d9a0}
 .slot:empty::after{content:'\\2022';opacity:.28;font-size:20px}
 /* auto-fit, so the same thirty keys lay out in three rows of ten with the iPad
    in landscape and reflow to more, shorter rows in portrait or on a narrower
    screen, without a media query and without any key ever going under 44px. */
 .keys{display:grid;grid-template-columns:repeat(auto-fit,minmax(52px,1fr));
      gap:8px;margin:0 0 18px}
 .key{min-height:52px;min-width:44px;padding:0;border:0;border-radius:10px;
      background:rgba(232,217,160,.14);color:#e8d9a0;
      font-family:inherit;font-size:23px;font-weight:700;line-height:1;
      touch-action:manipulation;-webkit-tap-highlight-color:transparent;
      -webkit-user-select:none;user-select:none;cursor:pointer}
 .key:active{background:#e8d9a0;color:#12180f}
</style></head><body>
<h1>Join the forest</h1>
<p class="sub" id="sub">Checking this iPad...</p>

<div id="pad" hidden>
 <div class="slots" id="slots"></div>
 <div class="keys" id="keys"></div>
 <button type="button" class="btn ghost" id="undo">&larr; Undo</button>
 <button type="button" class="btn ghost" id="again" hidden>Type a different code</button>
</div>

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
  // A function rather than a constant, because with no ?join= the code is not
  // known until she has finished tapping it in.
  function game() {
    return origin + '/' + (room ? '?join=' + encodeURIComponent(room) : '')
  }

  var el = function (id) { return document.getElementById(id) }
  var sub = el('sub'), steps = el('steps'), ready = el('ready'), pad = el('pad')
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

  // ONE probe, ONE decision, whether the code was scanned or tapped in. A typed
  // code reaches exactly the same two endings as a scanned one, so there is no
  // second path to keep in step with this one.
  function check() {
    // No code yet means she is still tapping, so there is nothing to check and
    // nothing to open. With ?join= present a code is known from the first frame
    // and this guard never fires.
    if (busy || !room) return
    busy = true
    var mine = room
    probe().then(function (ok) {
      busy = false
      // She tapped "Type a different code" while this was still in the air.
      if (room !== mine) return
      if (!ok) {
        ready.hidden = true
        steps.hidden = false
        sub.textContent = 'Three steps, once per iPad. No internet needed.'
        return
      }
      steps.hidden = true
      if (stay) {
        el('go').href = game()
        ready.hidden = false
        sub.textContent = 'Ready.'
        return
      }
      sub.textContent = 'Opening the forest...'
      // replace(), not href: with href, Back lands here and forwards again, and
      // there is no way off this page.
      location.replace(game())
    })
  }

  // ---- the keypad, for when the camera will not read the code -------------
  //
  // Taps only. No <input>, no keyboard, no autocapitalise and nothing to get
  // wrong: every key is a character a code can actually contain, so the only
  // mistake available is the wrong one of thirty, and Undo covers that.
  var ALPHABET = ${JSON.stringify(ROOM_ALPHABET)}
  var LEN = ${ROOM_LEN}
  var ASK = 'Tap the four letters underneath the code on the other iPad.'
  var typed = '', slots = []

  function draw() {
    for (var i = 0; i < LEN; i++) {
      slots[i].textContent = typed.charAt(i)
      slots[i].className = typed.charAt(i) ? 'slot on' : 'slot'
    }
  }

  function tap(e) {
    if (typed.length >= LEN) return
    typed += e.currentTarget.textContent
    draw()
    if (typed.length < LEN) return
    // The fourth character IS the go button. Nothing else to find and tap.
    room = typed
    el('keys').hidden = true
    el('undo').hidden = true
    el('again').hidden = false
    sub.textContent = 'Checking this iPad...'
    check()
  }

  function undo() {
    typed = typed.slice(0, -1)
    draw()
  }

  // The slots stay on screen through all of this, so a code typed wrong is
  // still readable while the three steps are showing and is one tap from being
  // retyped. Without this a mistyped code is a dead end that only a reload
  // escapes, and she would have no idea that was what went wrong.
  function again() {
    room = null
    typed = ''
    draw()
    steps.hidden = true
    ready.hidden = true
    el('keys').hidden = false
    el('undo').hidden = false
    el('again').hidden = true
    sub.textContent = ASK
  }

  function buildPad() {
    var slotRow = el('slots'), keyGrid = el('keys'), i, node
    for (i = 0; i < LEN; i++) {
      node = document.createElement('div')
      node.className = 'slot'
      slotRow.appendChild(node)
      slots.push(node)
    }
    for (i = 0; i < ALPHABET.length; i++) {
      node = document.createElement('button')
      node.type = 'button'
      node.className = 'key'
      node.textContent = ALPHABET.charAt(i)
      // currentTarget, so one shared handler reads its own key and no closure
      // captures a loop variable.
      node.addEventListener('click', tap)
      keyGrid.appendChild(node)
    }
    el('undo').addEventListener('click', undo)
    el('again').addEventListener('click', again)
    pad.hidden = false
    sub.textContent = ASK
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

  // A scanned code goes straight to the probe, exactly as it always has. No
  // code means nobody scanned anything, so do NOT forward: show the keypad and
  // wait, because forwarding to the game with no code lands her on the title
  // screen with nothing gained and the address retyped for nothing.
  if (room) check()
  else buildPad()
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
