#!/bin/bash
# T005(a) — create + trust the stable self-signed codesigning cert "chainglass-dev"
# (Workshop 004 § cert). Throwaway spike script; the production version is Phase 4's
# `just streamd-setup`.
# 🖐 Interactive: macOS shows a GUI auth prompt for the trust step.
set -euo pipefail

CN="chainglass-dev"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-certificate -c "$CN" >/dev/null 2>&1; then
  echo "cert '$CN' already in keychain — nothing to do"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/ext.cnf" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = codesign_ext
prompt = no
[dn]
CN = chainglass-dev
[codesign_ext]
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
basicConstraints = critical,CA:false
EOF

openssl req -x509 -newkey rsa:2048 -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
  -days 3650 -nodes -config "$TMP/ext.cnf"
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -out "$TMP/cert.p12" -passout pass:spike

security import "$TMP/cert.p12" -k "$KEYCHAIN" -P spike -T /usr/bin/codesign
# Trust for code signing in the user trust domain — 🖐 GUI auth prompt on the host Mac.
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem"

echo "cert '$CN' created + trusted (login keychain)"
