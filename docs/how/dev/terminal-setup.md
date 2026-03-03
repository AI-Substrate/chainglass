# Terminal Setup Guide

The terminal feature provides browser-based shell access connected to tmux sessions. Sessions persist across page refreshes, browser restarts, and server restarts.

## Prerequisites

### Required
- **Node.js 20.19+** (enforced by engines)
- **tmux** — session multiplexer for persistent terminals
  ```bash
  # macOS
  brew install tmux

  # Ubuntu/Debian
  sudo apt install tmux
  ```
- **Xcode Command Line Tools** (macOS) — needed for node-pty native compilation
  ```bash
  xcode-select --install
  ```

### Optional
- **mkcert** — for HTTPS local dev (needed for clipboard API on remote devices)
  ```bash
  brew install mkcert
  ```

## Development

### Starting the terminal

```bash
# Start Next.js + terminal sidecar together
just dev
```

This runs `concurrently`:
1. **Next.js** on `PORT` (default 3002)
2. **Terminal sidecar** WebSocket server on `PORT + 1500` (default 4502)

The sidecar watches for file changes and auto-restarts via `tsx watch`.

### Port configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3000 | Next.js port. WS port derives from this |
| `TERMINAL_WS_PORT` | PORT + 1500 | Override WS port explicitly |
| `TERMINAL_WS_HOST` | 127.0.0.1 | Bind address. Justfile sets `0.0.0.0` for remote |

### How it works

1. Browser navigates to `/workspaces/<slug>/terminal`
2. Client connects via WebSocket to sidecar on port `location.port + 1500`
3. Sidecar runs `tmux new-session -A -s <session-name> -c <cwd>` (create-or-attach)
4. node-pty spawns a PTY attached to the tmux session
5. I/O pipes bidirectionally: browser ↔ WebSocket ↔ PTY ↔ tmux ↔ shell

When tmux isn't installed, the sidecar falls back to a raw shell and sends a warning to the browser (toast notification). Sessions won't persist in this mode.

## Remote Access (iPad / LAN)

This is a first-class use case — accessing the terminal from an iPad or other device on your local network.

### Step 1: Generate HTTPS certs

The clipboard API requires a secure context (HTTPS). Without it, the copy button shows a modal instead of writing to clipboard directly.

```bash
# Install mkcert and set up local CA
brew install mkcert
mkcert -install

# Generate certs for localhost AND your LAN IP
cd apps/web
mkdir -p certificates
mkcert -key-file certificates/localhost-key.pem \
       -cert-file certificates/localhost.pem \
       localhost 127.0.0.1 ::1 192.168.1.32
```

Replace `192.168.1.32` with your machine's actual LAN IP (`ifconfig | grep "inet "`).

### Step 2: Start with HTTPS

```bash
PORT=3002 just dev-https
```

This starts:
- Next.js with `--experimental-https` on `https://192.168.1.32:3002`
- Terminal sidecar with WSS (TLS) using the same certs

### Step 3: Access from iPad

Open `https://192.168.1.32:3002` in Safari or Edge on your iPad.

**First visit**: You'll see a certificate warning. Tap "Advanced" → "Proceed" (the cert is self-signed but safe for local dev).

**For native clipboard support** (no modal fallback), install the mkcert root CA on iPad:
1. AirDrop `"$(mkcert -CAROOT)/rootCA.pem"` to iPad
2. Settings → General → VPN & Device Management → install the profile
3. Settings → General → About → Certificate Trust Settings → enable full trust for mkcert

### Clipboard behavior

| Context | Clipboard API | Copy button behavior |
|---------|--------------|---------------------|
| `https://localhost:3002` | ✅ Available | Direct clipboard write |
| `https://192.168.1.32:3002` (trusted CA) | ✅ Available | Direct clipboard write |
| `https://192.168.1.32:3002` (untrusted) | ❌ Not available | Modal with selectable text |
| `http://192.168.1.32:3002` | ❌ Not available | Modal with selectable text |

The copy button uses a **deferred ClipboardItem Promise** pattern — `clipboard.write()` is called during the click gesture (preserving user activation), and the data promise resolves when the WebSocket response arrives from `tmux show-buffer`.

## Troubleshooting

### node-pty spawn-helper permission error

```
Error: posix_spawnp failed
```

The `spawn-helper` prebuild loses execute permission after `pnpm install --ignore-scripts`. Fix:

```bash
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

The justfile `install` recipe does this automatically.

### Terminal not connecting

1. Check sidecar is running — look for `[terminal]` prefix in console output
2. Verify port: browser connects to `location.port + 1500`
3. Check `TERMINAL_WS_HOST` — must be `0.0.0.0` for remote access (justfile sets this)

### WSS connection fails on HTTPS

- Ensure `TERMINAL_WS_CERT` and `TERMINAL_WS_KEY` env vars point to valid cert files
- `just dev-https` sets these automatically
- Check browser console for mixed content warnings (HTTPS page can't connect to `ws://`)

### tmux session not persisting

- Verify tmux is installed: `tmux -V`
- Check server logs for "tmux not available" message
- If you see the toast warning, you're in raw shell mode (no persistence)

### Terminal too small / wrong size

- The terminal auto-fits on mount and on container resize
- On iPad, there's a 140px bottom safe area for the keyboard accessory bar
- If overlay and full-page terminal share the same tmux session, tmux shrinks to the smallest client — close the overlay on the terminal page

### xterm.js dispose crash

If you see `_linkifier2 undefined` errors in console, addons must be disposed before the terminal. This is already handled in the cleanup code.

## Architecture

```
Browser                          Server (sidecar)
┌─────────────────┐              ┌─────────────────┐
│ xterm.js        │◄─── WS ───► │ terminal-ws.ts   │
│ (terminal-inner)│              │   ↕              │
│                 │              │ node-pty (PTY)   │
│ FitAddon        │              │   ↕              │
│ CanvasAddon     │              │ tmux session     │
│ WebLinksAddon   │              │   ↕              │
└─────────────────┘              │ shell (bash/zsh) │
                                 └─────────────────┘
```

The sidecar runs as a separate Node.js process alongside Next.js (not a custom server — preserves Turbopack HMR). Each browser WebSocket connection gets its own PTY process. tmux handles multi-client natively.
