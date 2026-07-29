#!/usr/bin/env bash
#
# Everything needed for two-player co-op, in one command, with no internet.
#
#   ./tools/serve.sh
#
# Three processes:
#   5173  https  the game and the connection page   (Vite)
#   8787  https  the signalling relay               (wrangler dev, local only)
#   8080  http   the certificate, for onboarding    (plain http, see ca-server)
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
  new iPad      http://$LOCAL:8080          <- install the certificate first

EOF
wait
