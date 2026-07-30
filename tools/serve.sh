#!/usr/bin/env bash
#
# Everything needed for two-player co-op, in one command, with no internet.
#
#   ./tools/serve.sh
#
# Three processes:
#   5173  https  the game, the connection page, and /signal  (Vite)
#   8787  http   the relay, LOOPBACK ONLY, proxied by Vite   (wrangler dev)
#   7173  http   onboarding, and where every scanned QR lands
#
# 7173 must match NET_ONBOARD_PORT in src/game/constants.ts and PORT in
# tools/ca-server.mjs. It has to be up for a QR code to be scannable at all: the
# code points at the onboarding page, which forwards to the game once it has
# proved the scanning iPad trusts the certificate.
#
# The relay is deliberately not reachable from the network. It had its own HTTPS
# listener on 8787 and both iPads failed to open any connection to it, while
# loading the page from 5173 over the very same certificate. Vite proxies it now
# and the problem is gone rather than understood.
#
# Ctrl-C stops all three.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL="$(scutil --get LocalHostName).local"

if [ ! -f certs/lan-cert.pem ]; then
  echo "no certificate yet -- running tools/make-certs.sh"
  bash tools/make-certs.sh
  echo
fi

# Kill the whole process group on exit, or wrangler and the CA server survive a
# Ctrl-C and hold their ports. 5173 in particular must be free next time.
trap 'kill 0' EXIT INT TERM

node tools/ca-server.mjs &
(cd signaling && npm run --silent dev) &
npm run --silent dev -- --host &

sleep 3
cat <<EOF

  ready, and nothing here touches the internet

  play          https://$LOCAL:5173
  connect       https://$LOCAL:5173/net.html
  new iPad      http://$LOCAL:7173          <- plain http, and where the QR points

EOF
wait
