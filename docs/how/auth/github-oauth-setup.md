# GitHub OAuth App Setup

This guide walks you through creating a GitHub OAuth App for Chainglass authentication.

> **Composition with bootstrap-code** (Plan 084):
> GitHub OAuth is **not** the first auth layer. The
> [bootstrap-code popup](./bootstrap-code.md) is the always-on outer gate; every
> fresh browser must enter the bootstrap code before the UI renders, regardless
> of whether GitHub OAuth is configured. GitHub OAuth, when enabled, layers
> behind that as an optional second factor.
>
> If you don't want to set up GitHub OAuth (e.g. personal/dev use), set
> `DISABLE_GITHUB_OAUTH=true` in `apps/web/.env.local` — the bootstrap gate
> stays on by itself and `AUTH_SECRET` becomes optional (the cookie HMAC key
> is HKDF-derived from the bootstrap code in that mode). See
> [bootstrap-code.md § 5 — Composition with GitHub OAuth](./bootstrap-code.md#5--composition-with-github-oauth)
> for the full configuration matrix.
>
> Continue reading **only if you want GitHub OAuth on top of the bootstrap gate.**

## Prerequisites

- A GitHub account
- Access to create OAuth Apps (any GitHub account can do this)

## Step 1: Create the OAuth App

1. Go to **GitHub Settings** > **Developer settings** > **OAuth Apps**
   - Direct link: https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in the form:

| Field | Value |
|-------|-------|
| **Application name** | `Chainglass (local)` |
| **Homepage URL** | `http://localhost:3000` |
| **Authorization callback URL** | `http://localhost:3000/api/auth/callback/github` |

4. Under **"Enable Device Flow"**, leave it unchecked (not needed)
5. Click **Register application**

## Step 2: Get Your Credentials

After creating the app, you'll see the app settings page:

1. **Client ID** — displayed on the page, copy it
2. **Client Secret** — click **Generate a new client secret**, copy it immediately (it won't be shown again)

## Step 3: Configure Chainglass

Create a `.env.local` file in `apps/web/`:

```bash
# GitHub OAuth credentials (from Step 2)
AUTH_GITHUB_ID=your_client_id_here
AUTH_GITHUB_SECRET=your_client_secret_here

# Session encryption key (generate a random 32+ character string)
# You can generate one with: openssl rand -base64 32
AUTH_SECRET=your_random_secret_here
```

## Step 4: Configure Allowed Users

Create or edit `.chainglass/auth.yaml` in the project root:

```yaml
allowed_users:
  - jakkaj
```

Add any GitHub usernames that should have access.

## Step 5: Verify

1. Start the dev server: `pnpm dev`
2. Visit `http://localhost:3000` — you should be redirected to `/login`
3. Click **Sign in with GitHub**
4. Authorize the app on GitHub
5. You should be redirected back to the dashboard

## Troubleshooting

### "Application not found" error on GitHub
- Double-check the **Client ID** in your `.env.local` matches the one on the OAuth App page.

### Redirect loop after login
- Verify the **Authorization callback URL** is exactly `http://localhost:3000/api/auth/callback/github` (no trailing slash). Auth.js v5 uses this convention.

### "User not authorized" after login
- Check `.chainglass/auth.yaml` contains your GitHub username (case-insensitive).

### Cookie not being set
- Chainglass runs on HTTP (not HTTPS). The session cookie is set with `secure: false` and `httpOnly: true`. This is by design for local tooling.

### Different port
- If running on a port other than 3000, update both the **Homepage URL** and **Authorization callback URL** in the GitHub OAuth App settings, and restart the dev server.

### Build errors with `next-auth` on Next.js 16
- `next-auth@5.0.0-beta.30` imports `next/server` without the `.js` extension, which breaks Next.js 16 ESM resolution in production builds. If you see `ERR_MODULE_NOT_FOUND` for `next/server`, patch `node_modules/next-auth/lib/env.js` to change `from "next/server"` to `from "next/server.js"`. This needs to be re-applied after `pnpm install`. A future stable release of next-auth should fix this.

### API returns 500 without `.env.local`
- The `/api/auth/session` endpoint returns 500 if `AUTH_SECRET` is not set. This is expected — configure `.env.local` first, then restart the dev server.
