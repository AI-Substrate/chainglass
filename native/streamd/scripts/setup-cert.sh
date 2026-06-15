#!/bin/bash
# Create + trust the stable self-signed codesigning cert "chainglass-dev" (Workshop 004
# § cert). Invoked by `just streamd-setup`. Reuses the exact CN the Phase 1 spike
# validated so the macOS TCC grants (Screen Recording, Accessibility) persist across
# rebuilds — the designated requirement is (bundle-id + cert-leaf), not a cdhash
# (Finding 02). Ad-hoc signing ("-") re-prompts every rebuild; do not use it here.
#
# 🖐 Interactive: macOS shows a GUI auth prompt for the trust step — RUN AT THE HOST MAC.
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
# -legacy + SHA1 PBE/MAC: Apple's Security framework can't read OpenSSL-3's default
# (SHA-256) PKCS12 MAC — `security import` fails with "MAC verification failed".
openssl pkcs12 -export -legacy -macalg sha1 \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES \
  -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -out "$TMP/cert.p12" -passout pass:spike

security import "$TMP/cert.p12" -k "$KEYCHAIN" -P spike -T /usr/bin/codesign
# Trust for code signing in the user trust domain — 🖐 GUI auth prompt on the host Mac.
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem"

echo "cert '$CN' created + trusted (login keychain)"
