import { resolveTerminalWsBaseUrl } from '@/features/064-terminal/lib/resolve-terminal-ws-url';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveTerminalWsBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('derived (no override)', () => {
    it('maps a localhost page to IPv4 127.0.0.1 (dodges ::1 squatters)', () => {
      /*
      Test Doc:
      - Why: `localhost` resolves to IPv6 ::1 first; the sidecar + devtunnel
        forward are reliable on IPv4, and ::1:<port> can be squatted by an
        orphaned sidecar from another worktree. Force 127.0.0.1.
      - Contract: hostname 'localhost' → 127.0.0.1 in the WS host.
      - Usage Notes: Origin header still carries the page origin, so the
        sidecar allowlist is unaffected.
      - Quality Contribution: Makes the WS immune to the ::1 collision.
      - Worked Example: {hostname:'localhost',port:'3000',protocol:'https:'} → 'wss://127.0.0.1:4500'.
      */
      const base = resolveTerminalWsBaseUrl({
        hostname: 'localhost',
        port: '3000',
        protocol: 'https:',
      });
      expect(base).toBe('wss://127.0.0.1:4500');
    });

    it('uses ws for an http page and defaults empty port to 3000', () => {
      /*
      Test Doc:
      - Why: Plain-HTTP dev and default-port pages must still resolve.
      - Contract: http + empty port → ws://host:4500.
      - Usage Notes: Number('' || '3000') = 3000 → +1500 = 4500.
      - Quality Contribution: Guards the empty-port fallback branch.
      - Worked Example: {hostname:'10.0.0.5',port:'',protocol:'http:'} → 'ws://10.0.0.5:4500'.
      */
      const base = resolveTerminalWsBaseUrl({
        hostname: '10.0.0.5',
        port: '',
        protocol: 'http:',
      });
      expect(base).toBe('ws://10.0.0.5:4500');
    });
  });

  describe('override (NEXT_PUBLIC_TERMINAL_WS_URL)', () => {
    it('normalizes https → wss and ignores page location', () => {
      /*
      Test Doc:
      - Why: Dev tunnels expose the sidecar on its own subdomain; page-port maths
        can't reach it, so the override must win and be scheme-normalized.
      - Contract: https override → wss, page location ignored.
      - Usage Notes: Override read from process.env at call time.
      - Quality Contribution: Proves the tunnel path bypasses the +1500 derivation.
      - Worked Example: 'https://abc-4500.aue.devtunnels.ms' → 'wss://abc-4500.aue.devtunnels.ms'.
      */
      vi.stubEnv('NEXT_PUBLIC_TERMINAL_WS_URL', 'https://abc-4500.aue.devtunnels.ms');
      const base = resolveTerminalWsBaseUrl({
        hostname: 'abc-3000.aue.devtunnels.ms',
        port: '',
        protocol: 'https:',
      });
      expect(base).toBe('wss://abc-4500.aue.devtunnels.ms');
    });

    it('strips a trailing slash and an explicit /terminal path', () => {
      /*
      Test Doc:
      - Why: Operators may paste the URL with or without /terminal; we must not
        double up the path (the caller appends /terminal).
      - Contract: trailing slash and trailing /terminal are stripped from the base.
      - Usage Notes: Idempotent normalization.
      - Quality Contribution: Prevents `/terminal/terminal` and `//terminal` bugs.
      - Worked Example: 'wss://h/terminal/' → 'wss://h'.
      */
      vi.stubEnv('NEXT_PUBLIC_TERMINAL_WS_URL', 'wss://h/terminal/');
      const base = resolveTerminalWsBaseUrl({
        hostname: 'ignored',
        port: '3000',
        protocol: 'https:',
      });
      expect(base).toBe('wss://h');
    });

    it('accepts an already-ws override unchanged (minus path)', () => {
      /*
      Test Doc:
      - Why: A ws:// override (no TLS) must pass through without scheme mangling.
      - Contract: ws:// stays ws://; only path/slash trimming applies.
      - Usage Notes: replace(/^http:/) must not match 'ws:'.
      - Quality Contribution: Guards against accidental ws→wss promotion.
      - Worked Example: 'ws://localhost:9999/terminal' → 'ws://localhost:9999'.
      */
      vi.stubEnv('NEXT_PUBLIC_TERMINAL_WS_URL', 'ws://localhost:9999/terminal');
      const base = resolveTerminalWsBaseUrl({
        hostname: 'ignored',
        port: '3000',
        protocol: 'http:',
      });
      expect(base).toBe('ws://localhost:9999');
    });

    it('IGNORES the override on a localhost page (local mode unbroken)', () => {
      /*
      Test Doc:
      - Why: A tunnel override left in .env.local must NOT hijack the WS URL when
        developing on localhost — that previously broke local mode.
      - Contract: localhost page derives wss://127.0.0.1:4500 even with override set.
      - Usage Notes: isLocalOrLanHostname('localhost') === true short-circuits override.
      - Quality Contribution: Lets the override live permanently in .env.local.
      - Worked Example: override set + {hostname:'localhost',port:'3000'} → 'wss://127.0.0.1:4500'.
      */
      vi.stubEnv('NEXT_PUBLIC_TERMINAL_WS_URL', 'wss://abc-4500.aue.devtunnels.ms/terminal');
      const base = resolveTerminalWsBaseUrl({
        hostname: 'localhost',
        port: '3000',
        protocol: 'https:',
      });
      expect(base).toBe('wss://127.0.0.1:4500');
    });

    it('IGNORES the override on a LAN-IP page (iPad/phone path unbroken)', () => {
      /*
      Test Doc:
      - Why: LAN-IP browsing (iPad on the same Wi-Fi) shares the host with the
        sidecar and relies on the +1500 derivation; the override must not engage.
      - Contract: a 192.168.x page derives ws(s)://<ip>:4500 even with override set.
      - Usage Notes: RFC 1918 ranges are treated as local.
      - Quality Contribution: Protects the documented remote-LAN access flow.
      - Worked Example: override set + {hostname:'192.168.1.32',port:'3002'} → 'wss://192.168.1.32:4502'.
      */
      vi.stubEnv('NEXT_PUBLIC_TERMINAL_WS_URL', 'wss://abc-4500.aue.devtunnels.ms/terminal');
      const base = resolveTerminalWsBaseUrl({
        hostname: '192.168.1.32',
        port: '3002',
        protocol: 'https:',
      });
      expect(base).toBe('wss://192.168.1.32:4502');
    });
  });
});
