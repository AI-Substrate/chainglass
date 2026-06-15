import Foundation
import CryptoKit

/// Remote-view stream-socket auth (dossier T004 — Finding 03, a FROZEN contract).
///
/// Mirrors the web side byte-for-byte:
///  - Signing key: HKDF-SHA256 over the bootstrap code (salt/info/length from
///    `packages/shared/.../signing-key.ts`), or `AUTH_SECRET` UTF-8 bytes when set —
///    the raw key is used directly for HMAC, never re-encoded (FX003).
///  - JWT: HS256, claims `iss=chainglass`, `aud=remote-view-ws`, `exp`; NO `cwd`.
///  - Upgrade gate: Origin allowlist (mirrors `terminal-auth.ts`) → token verify.
///    Bad token → `E_AUTH` close 4401; bad origin → `E_ORIGIN` close 4402 (AC-9).
///
/// `test/contracts/remote-view-auth-vectors.json` is the cross-language oracle; the
/// Swift verifier accepts `good` and rejects every other vector byte-identically.
enum RemoteViewAuth {
    static let jwtIssuer = "chainglass"
    static let jwtAudience = "remote-view-ws"

    // HKDF parameters — frozen, must match signing-key.ts exactly.
    static let hkdfSalt = "chainglass.signing.salt.v1"
    static let hkdfInfo = "chainglass.signing.info.v1"
    static let hkdfKeyLength = 32

    // MARK: Signing key

    /// HKDF-SHA256 derive the 32-byte signing key from the bootstrap code string.
    /// RFC 5869 full HKDF — byte-identical to Node `hkdfSync('sha256', code, salt, info, 32)`.
    static func deriveSigningKey(fromCode code: String) -> [UInt8] {
        let derived = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: Data(code.utf8)),
            salt: Data(hkdfSalt.utf8),
            info: Data(hkdfInfo.utf8),
            outputByteCount: hkdfKeyLength
        )
        return derived.withUnsafeBytes { Array($0) }
    }

    /// `.chainglass/bootstrap-code.json` shape (subset; `{version, code, createdAt, rotatedAt}`).
    private struct BootstrapCodeFile: Decodable { let code: String }

    /// Resolve the signing key: `AUTH_SECRET` (UTF-8, no HKDF) when set, else HKDF over
    /// the bootstrap code read from `bootstrapPath`. Mirrors `activeSigningSecret`.
    static func signingKey(
        bootstrapPath: String?,
        env: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> [UInt8] {
        if let secret = env["AUTH_SECRET"], !secret.isEmpty {
            return Array(secret.utf8)
        }
        guard let path = bootstrapPath else { throw AuthError.bootstrapMissing }
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let file = try JSONDecoder().decode(BootstrapCodeFile.self, from: data)
        return deriveSigningKey(fromCode: file.code)
    }

    // MARK: JWT verify

    struct JWTClaims: Equatable, Decodable {
        var sub: String
        var iss: String
        var aud: String
        var iat: Double?
        var exp: Double?
    }

    enum AuthError: Error, Equatable {
        case malformed
        case unsupportedAlg
        case badSignature
        case wrongIssuer
        case wrongAudience
        case expired
        case missingSubject
        case bootstrapMissing
    }

    private struct JWTHeader: Decodable { let alg: String }

    /// Verify an HS256 JWT against `key` and assert the remote-view claims. Never throws;
    /// returns the typed failure. `now` is injectable for deterministic tests.
    static func verifyJWT(
        _ token: String,
        key: [UInt8],
        now: TimeInterval = Date().timeIntervalSince1970
    ) -> Result<JWTClaims, AuthError> {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3,
              let headerData = base64urlDecode(String(parts[0])),
              let payloadData = base64urlDecode(String(parts[1])),
              let signature = base64urlDecode(String(parts[2]))
        else { return .failure(.malformed) }

        guard let header = try? JSONDecoder().decode(JWTHeader.self, from: headerData),
              header.alg == "HS256"
        else { return .failure(.unsupportedAlg) }

        let signingInput = Data("\(parts[0]).\(parts[1])".utf8)
        guard HMAC<SHA256>.isValidAuthenticationCode(
            signature, authenticating: signingInput, using: SymmetricKey(data: key)
        ) else { return .failure(.badSignature) }

        guard let claims = try? JSONDecoder().decode(JWTClaims.self, from: payloadData) else {
            return .failure(.malformed)
        }
        guard claims.iss == jwtIssuer else { return .failure(.wrongIssuer) }
        guard claims.aud == jwtAudience else { return .failure(.wrongAudience) }
        if let exp = claims.exp, exp <= now { return .failure(.expired) }
        guard !claims.sub.isEmpty else { return .failure(.missingSubject) }
        return .success(claims)
    }

    /// Decode base64url (no padding) → bytes. `nil` on invalid input.
    static func base64urlDecode(_ s: String) -> Data? {
        var str = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let rem = str.count % 4
        if rem > 0 { str += String(repeating: "=", count: 4 - rem) }
        return Data(base64Encoded: str)
    }

    // MARK: Origin allowlist (mirrors terminal-auth.ts)

    /// Parse a comma-separated allowed-origins env value. `nil`/blank → nil (caller
    /// falls back to the localhost default).
    static func parseAllowedOrigins(_ envValue: String?) -> Set<String>? {
        guard let envValue else { return nil }
        let list = envValue.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return list.isEmpty ? nil : Set(list)
    }

    /// Default Origin allowlist for browser WS upgrades.
    static func buildDefaultAllowedOrigins(
        port: String, httpsEnabled: Bool, hosts: [String] = ["localhost", "127.0.0.1"]
    ) -> Set<String> {
        var out = Set<String>()
        for h in hosts {
            out.insert("http://\(h):\(port)")
            if httpsEnabled { out.insert("https://\(h):\(port)") }
        }
        return out
    }

    // MARK: Upgrade gate

    enum UpgradeAuthResult: Equatable {
        case ok(username: String)
        /// `code` = WS close code (4401 E_AUTH / 4402 E_ORIGIN); `errorCode` = wire error.
        case rejected(code: Int, errorCode: ErrorCode, reason: String)
    }

    /// Full upgrade auth: Origin allowlist → token presence → JWT verify. Origin
    /// failures close 4402 (`E_ORIGIN`); token failures close 4401 (`E_AUTH`). The WS
    /// layer (T006) extracts `origin`/`token` from the request and calls this.
    static func authorizeUpgrade(
        origin: String?,
        token: String?,
        allowedOrigins: Set<String>,
        key: [UInt8],
        now: TimeInterval = Date().timeIntervalSince1970
    ) -> UpgradeAuthResult {
        guard let origin, !origin.isEmpty else {
            return .rejected(code: 4402, errorCode: .eOrigin, reason: "origin header missing")
        }
        guard origin != "null" else {
            return .rejected(code: 4402, errorCode: .eOrigin, reason: "origin null rejected")
        }
        guard allowedOrigins.contains(origin) else {
            return .rejected(code: 4402, errorCode: .eOrigin, reason: "origin not allowed: \(origin)")
        }
        guard let token, !token.isEmpty else {
            return .rejected(code: 4401, errorCode: .eAuth, reason: "missing auth token")
        }
        switch verifyJWT(token, key: key, now: now) {
        case .success(let claims):
            return .ok(username: claims.sub)
        case .failure:
            return .rejected(code: 4401, errorCode: .eAuth, reason: "invalid or expired token")
        }
    }
}
