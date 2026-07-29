/**
 * Serves the root certificate over PLAIN HTTP so a new iPad can be onboarded
 * with no internet at all. This is the aeroplane case and it is the reason this
 * file exists rather than the certificate being served by Vite.
 *
 * THE CHICKEN AND EGG: a device that has not yet trusted the CA cannot open
 * anything this project serves over HTTPS, because that is exactly what the CA
 * is for. So the one thing it needs first has to arrive over http. Everything
 * else stays https.
 *
 * Nothing here reaches the internet. The certificate is read off the laptop and
 * handed to a device on the same link.
 *
 *   node tools/ca-server.mjs
 *   http://<host>.local:8080/
 */
import { createServer } from 'node:http'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 8080

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
 body{font:400 19px/1.55 system-ui,-apple-system,sans-serif;background:#1d2a17;color:#dfe6d4;
      margin:0;padding:28px;max-width:640px}
 h1{font-size:30px;font-weight:700;margin:0 0 6px}
 .sub{opacity:.6;margin:0 0 26px;font-size:16px}
 ol{padding-left:22px;margin:0} li{margin-bottom:18px}
 a.btn{display:inline-block;background:#e8d9a0;color:#12180f;font-size:21px;font-weight:700;
       padding:15px 30px;border-radius:11px;text-decoration:none;min-height:44px}
 b{color:#e8d9a0} .last{margin-top:30px;padding-top:20px;
       border-top:1px solid rgba(223,230,212,.18)}
 code{font:600 17px ui-monospace,Menlo,monospace;color:#9fd67a;word-break:break-all}
</style></head><body>
<h1>Join the forest</h1>
<p class="sub">Three steps, once per iPad. No internet needed.</p>
<ol>
 <li><a class="btn" href="/ca">Get the certificate</a></li>
 <li>Open <b>Settings</b>. Near the top it now says <b>Profile Downloaded</b>.
     Tap it, then tap <b>Install</b> (top right).</li>
 <li>Still in Settings, go to <b>General &rarr; About &rarr; Certificate Trust
     Settings</b> and switch <b>mkcert</b> on.
     <br><span style="opacity:.6;font-size:16px">This step is the one people
     miss. Installing the profile on its own is not enough.</span></li>
</ol>
<p class="last">Then open <code>https://${local}:5173</code> and you are in.</p>
</body></html>`

createServer((req, res) => {
  if (req.url === '/ca' || req.url === '/ca.crt') {
    res.writeHead(200, {
      // This exact content-type is what makes iOS Safari offer to install a
      // configuration profile instead of printing the PEM on screen as text.
      'content-type': 'application/x-x509-ca-cert',
      'content-disposition': 'attachment; filename="warrior-cats.crt"',
    })
    return res.end(ca)
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGE)
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[ca] http://${local}:${PORT}/   (plain http, on purpose)`)
})
