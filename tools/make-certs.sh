#!/usr/bin/env bash
#
# Issue the LAN TLS certificate that lets two iPads run multiplayer with no
# internet at all. Run once; re-run when the certificate expires.
#
#   ./tools/make-certs.sh
#
# Two things here are load-bearing and neither is obvious.
#
# THE PRIMARY NAME IS <host>.local, NOT AN IP. macOS advertises its Bonjour
# name over mDNS on whatever link it is attached to, and iPadOS resolves it
# natively with no configuration. A certificate bound to 192.168.1.52 works at
# home and stops working the moment the laptop becomes a hotspot on a plane,
# because Internet Sharing hands out a different subnet entirely. The .local
# name is the same on every network, which is the whole point.
#
# THE LEAF IS 397 DAYS, NOT MKCERT'S DEFAULT. mkcert issues roughly 27 months,
# and iOS rejects any TLS certificate whose validity exceeds 398 days. That is
# why this script signs its own leaf with openssl instead of just calling
# `mkcert <names>`: the mkcert CA is doing the trust, but the leaf's lifetime
# has to be ours.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="certs"
DAYS=397

command -v mkcert >/dev/null || { echo "mkcert not found: brew install mkcert"; exit 1; }

CAROOT="$(mkcert -CAROOT)"
[ -f "$CAROOT/rootCA.pem" ] || mkcert -CAROOT >/dev/null

LOCAL_NAME="$(scutil --get LocalHostName).local"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"

mkdir -p "$OUT"

# 192.168.2.1 is not a guess. It is the fixed address macOS gives itself when
# Internet Sharing brings up its Wi-Fi access point, which is how three devices
# get onto one network on a plane with no router. `papa.local` is what should
# actually be used there and resolves over that link via mDNS; this is the
# belt-and-braces fallback for when someone is typing an address by hand and
# mDNS is being unhelpful.
cat > "$OUT/san.cnf" <<EOF
[req]
distinguished_name = dn
[dn]
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
DNS.1 = $LOCAL_NAME
DNS.2 = localhost
IP.1 = 127.0.0.1
IP.2 = $LAN_IP
IP.3 = 192.168.2.1
EOF

openssl req -newkey rsa:2048 -nodes \
  -keyout "$OUT/lan-key.pem" -subj "/CN=warrior-cats-lan" -out "$OUT/lan.csr" 2>/dev/null

openssl x509 -req -in "$OUT/lan.csr" \
  -CA "$CAROOT/rootCA.pem" -CAkey "$CAROOT/rootCA-key.pem" -CAcreateserial \
  -days "$DAYS" -sha256 -extfile "$OUT/san.cnf" -extensions ext \
  -out "$OUT/lan-cert.pem" 2>/dev/null

cp "$CAROOT/rootCA.pem" "$OUT/rootCA.crt"
rm -f "$OUT/lan.csr" "$OUT/san.cnf" "$OUT/.srl" 2>/dev/null || true

echo "certificate issued"
echo "  primary   https://$LOCAL_NAME     (works on any network, including a hotspot)"
echo "  also      https://$LAN_IP          (this network only)"
openssl x509 -in "$OUT/lan-cert.pem" -noout -enddate | sed 's/^/  expires  /'
echo "  root CA   $OUT/rootCA.crt  -> install on each iPad, then trust it in"
echo "            Settings > General > About > Certificate Trust Settings"
