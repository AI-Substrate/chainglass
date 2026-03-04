# Workshop: Multi-Host OAuth for Chainglass

**Type**: Integration Pattern
**Plan**: 063-login
**Spec**: [login-spec.md](../login-spec.md)
**Created**: 2026-03-04
**Status**: Draft

**Related Documents**:
- [github-oauth-setup.md](../../how/auth/github-oauth-setup.md)
- [auth domain.md](../../domains/_platform/auth/domain.md)

**Domain Context**:
- **Primary Domain**: _platform/auth
- **Related Domains**: None (self-contained change)

---

## Purpose

Chainglass is accessed from multiple hosts — `localhost:3000`, LAN IPs like `192.168.1.32:3000`, and potentially more. The current GitHub OAuth setup hardcodes a single callback URL, so login fails when accessing from any host other than the one registered with GitHub. This workshop evaluates approaches to make OAuth work from any host without manual per-host configuration.

## Key Questions Addressed

- How does GitHub validate OAuth callback URLs?
- Can we support multiple hosts with a single OAuth registration?
- What's the least-configuration approach for developers?
- Do we need to migrate from OAuth App to GitHub App?

---

## Problem

```
┌──────────────────────────────────────────────────────────┐
│ User visits http://192.168.1.32:3000                     │
│ → Redirected to /login                                   │
│ → Clicks "Sign in with GitHub"                           │
│ → Auth.js builds redirect_uri from request Host header   │
│ → GitHub gets: redirect_uri=http://192.168.1.32:3000/... │
│ → GitHub rejects: doesn't match registered callback      │
│   (http://localhost:3000/api/auth/callback/github)        │
│ → ❌ Login fails                                         │
└──────────────────────────────────────────────────────────┘
```

## How GitHub Validates Callbacks

GitHub OAuth Apps validate `redirect_uri` against the registered callback URL:

| Rule | Detail |
|------|--------|
| **Host+port must match exactly** | `localhost:3000` ≠ `192.168.1.32:3000` |
| **Path must be a subdirectory** | `/api/auth/callback/github` matches `/api/auth/callback/github/extra` but not `/other` |
| **Subdomains may differ** | `oauth.example.com` matches `example.com` registration |
| **One callback URL per OAuth App** | Cannot register multiple |

**Key constraint**: GitHub OAuth Apps support exactly **one** callback URL.

---

## Options Evaluated

### Option A: Multiple OAuth Apps (one per host)

Create a separate GitHub OAuth App for each host.

```
OAuth App "Chainglass (localhost)"
  → Callback: http://localhost:3000/api/auth/callback/github
  → Client ID: abc123

OAuth App "Chainglass (LAN)"
  → Callback: http://192.168.1.32:3000/api/auth/callback/github
  → Client ID: def456

OAuth App "Chainglass (other)"
  → Callback: http://other-host:3000/api/auth/callback/github
  → Client ID: ghi789
```

Each `.env.local` sets the matching `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.

| Pro | Con |
|-----|-----|
| Simple, proven | Manual setup per host |
| No code changes | Multiple OAuth Apps to manage |
| Each host fully independent | Credentials scattered across machines |

**Verdict**: Works but doesn't scale. Rejected.

---

### Option B: GitHub App (supports 10 callback URLs) ✅ RECOMMENDED

**GitHub Apps** support up to **10 callback URLs**. Auth.js GitHub provider works with GitHub Apps — you just provide the Client ID and Client Secret.

```
GitHub App "Chainglass"
  → Callback URLs:
    1. http://localhost:3000/api/auth/callback/github
    2. http://192.168.1.32:3000/api/auth/callback/github
    3. http://10.0.0.5:3000/api/auth/callback/github
    ... up to 10
```

Auth.js with `trustHost: true` auto-detects the request host from headers and sends the matching `redirect_uri` to GitHub. GitHub checks it against the list and allows it.

```
┌──────────────────────────────────────────────────────────┐
│ User visits http://192.168.1.32:3000                     │
│ → Auth.js reads Host header: 192.168.1.32:3000           │
│ → Builds redirect_uri: http://192.168.1.32:3000/api/...  │
│ → GitHub checks against 10 registered URLs               │
│ → ✅ Match found! OAuth proceeds                         │
│ → Callback returns to http://192.168.1.32:3000/api/...   │
│ → ✅ User logged in on the correct host                  │
└──────────────────────────────────────────────────────────┘
```

| Pro | Con |
|-----|-----|
| Up to 10 hosts, one registration | Max 10 URLs (sufficient for local dev) |
| No code changes beyond config | Must migrate from OAuth App to GitHub App |
| `trustHost: true` already set | Need to add new URLs when hosts change |
| Same Client ID/Secret everywhere | |
| Fine-grained permissions | |

**Why this wins**: Single app, shared credentials, no per-host `.env.local` differences for auth, 10 URLs covers all reasonable local/LAN scenarios.

---

### Option C: Proxy/tunnel approach

Route all OAuth callbacks through a single known host, then redirect.

| Pro | Con |
|-----|-----|
| Only one callback URL needed | Adds infrastructure complexity |
| Works with OAuth App | Extra network hop |
| | Harder to debug |

**Verdict**: Over-engineered for local tooling. Rejected.

---

### Option D: `AUTH_URL` env var per host

Set `AUTH_URL=http://192.168.1.32:3000` in each host's `.env.local`, and register that URL with GitHub.

| Pro | Con |
|-----|-----|
| No code changes | Still single callback URL (OAuth App) |
| Auth.js respects AUTH_URL | Must update GitHub AND .env.local per host |
| | Doesn't solve the fundamental problem |

**Verdict**: Workaround, not a solution. Rejected.

---

## Recommended Approach: Migrate to GitHub App

### Migration Steps

#### 1. Create GitHub App

1. Go to **GitHub Settings** > **Developer settings** > **GitHub Apps**
   - Direct link: https://github.com/settings/apps
2. Click **New GitHub App**
3. Fill in:

| Field | Value |
|-------|-------|
| **GitHub App name** | `Chainglass` (must be globally unique) |
| **Homepage URL** | `http://localhost:3000` |
| **Callback URLs** | Add all hosts (see below) |
| **Expire user authorization tokens** | ✅ Checked |
| **Request user authorization during install** | ✅ Checked |
| **Webhook** | ❌ Uncheck "Active" (not needed) |

4. Under **Callback URLs**, add:
   ```
   http://localhost:3000/api/auth/callback/github
   http://192.168.1.32:3000/api/auth/callback/github
   ```
   Add more as needed (up to 10).

5. **Permissions**: Under "Account permissions", set:
   - Email addresses: Read-only (for user identification)
   - All others: No access

6. Click **Create GitHub App**

#### 2. Get Credentials

On the app page:
1. **Client ID** — displayed on the page
2. **Client Secret** — click **Generate a new client secret**

> Note: GitHub Apps use "Client ID" (not "App ID") for OAuth. The Client ID
> looks like `Iv1.abc123...` (different format from OAuth App IDs like `Ov23li...`).

#### 3. Update `.env.local`

```bash
# Replace OAuth App credentials with GitHub App credentials
AUTH_GITHUB_ID=Iv1.your_github_app_client_id
AUTH_GITHUB_SECRET=your_github_app_client_secret
AUTH_SECRET=your_existing_secret  # keep the same
```

Same `.env.local` works on ALL machines — no per-host changes needed.

#### 4. No Code Changes Required

Auth.js GitHub provider works identically with GitHub Apps — same OAuth 2.0 flow. The `trustHost: true` config auto-detects the host from the request, and GitHub validates against the registered callback URLs list.

```typescript
// src/auth.ts — NO CHANGES NEEDED
providers: [GitHub],
trustHost: true,  // already set — auto-detects host from request
```

#### 5. Delete Old OAuth App

Once verified, delete the old OAuth App at https://github.com/settings/developers.

### Adding a New Host Later

1. Go to GitHub App settings
2. Add new callback URL: `http://NEW_HOST:3000/api/auth/callback/github`
3. That's it — no code or env changes

---

## Auth.js Host Detection Flow

```
Request arrives at http://192.168.1.32:3000/api/auth/signin/github
         │
         ▼
┌─────────────────────────────┐
│ Auth.js checks trustHost    │
│ trustHost: true             │
│                             │
│ Reads headers:              │
│  - Host: 192.168.1.32:3000  │
│  - X-Forwarded-Host (if set)│
│  - X-Forwarded-Proto        │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ AUTH_URL set?               │
│  YES → use AUTH_URL         │
│  NO  → derive from Host    │
│                             │
│ Result:                     │
│  origin = http://192.168.   │
│           1.32:3000         │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Build redirect_uri:         │
│ http://192.168.1.32:3000    │
│ /api/auth/callback/github   │
│                             │
│ Send to GitHub OAuth flow   │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ GitHub validates against    │
│ registered callback URLs    │
│                             │
│ ✅ Match → proceed          │
│ ❌ No match → error         │
└─────────────────────────────┘
```

**Key insight**: With `trustHost: true` and **no** `AUTH_URL` set, Auth.js derives the origin from the request. This means the same code automatically works on any host — as long as that host's callback URL is registered with the GitHub App.

**Important**: Do NOT set `AUTH_URL` in `.env.local` if you want auto-detection. `AUTH_URL` overrides host detection and locks to one origin.

---

## Checklist for Implementation

- [ ] Create GitHub App at github.com/settings/apps
- [ ] Add all callback URLs (localhost + LAN IPs)
- [ ] Generate Client Secret
- [ ] Update `.env.local` with new Client ID / Secret
- [ ] Remove `AUTH_URL` from `.env.local` (if set) — let trustHost auto-detect
- [ ] Copy updated `.env.local` to all machines
- [ ] Verify login from each host
- [ ] Delete old OAuth App
- [ ] Update `docs/how/auth/github-oauth-setup.md` to reference GitHub App

---

## Open Questions

### Q1: What if we exceed 10 callback URLs?

**RESOLVED**: 10 is sufficient. Chainglass is a local dev tool — even with localhost, several LAN IPs, and maybe a tunnel, 10 is plenty. If exceeded, create a second GitHub App.

### Q2: Do we need to change `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` env var names?

**RESOLVED**: No. Auth.js GitHub provider reads `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` regardless of whether they come from an OAuth App or a GitHub App.

### Q3: Will existing session cookies still work after migration?

**RESOLVED**: Yes. JWT sessions are signed by `AUTH_SECRET`, not the GitHub credentials. Existing sessions remain valid. Users won't need to re-login.
