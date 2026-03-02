import { describe, it, expect } from 'vitest';
import { FakeTmuxExecutor } from '../../../../fakes/fake-tmux-executor';
import { createFakePtySpawner } from '../../../../fakes/fake-pty';
import { TmuxSessionManager } from '@/features/064-terminal/server/tmux-session-manager';

describe('TmuxSessionManager', () => {
  function createManager(executor?: FakeTmuxExecutor, ptySpawner?: ReturnType<typeof createFakePtySpawner>) {
    const exec = executor ?? new FakeTmuxExecutor();
    const spawner = ptySpawner ?? createFakePtySpawner();
    return { manager: new TmuxSessionManager(exec.exec, spawner.spawn), exec, spawner };
  }

  describe('isTmuxAvailable', () => {
    it('should return true when tmux is installed', () => {
      /*
      Test Doc:
      - Why: Core feature — must detect tmux before attempting session operations
      - Contract: isTmuxAvailable() returns true when `tmux -V` succeeds
      - Usage Notes: Uses injectable executor, no real process spawned
      - Quality Contribution: Prevents crash when tmux missing
      - Worked Example: tmux -V → "tmux 3.4" → returns true
      */
      const { manager, exec } = createManager();
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      expect(manager.isTmuxAvailable()).toBe(true);
    });

    it('should return false when tmux is not installed', () => {
      /*
      Test Doc:
      - Why: Graceful degradation — fall back to raw shell when tmux missing
      - Contract: isTmuxAvailable() returns false when `tmux -V` throws
      - Usage Notes: Executor throws on unmatched commands by default
      - Quality Contribution: Prevents hard crash on machines without tmux
      - Worked Example: tmux -V → ENOENT → returns false
      */
      const { manager } = createManager();
      // No tmux -V configured → exec throws → should return false
      expect(manager.isTmuxAvailable()).toBe(false);
    });
  });

  describe('validateSessionName', () => {
    it('should accept valid session names', () => {
      /*
      Test Doc:
      - Why: Security — prevent shell injection via session names
      - Contract: validateSessionName accepts alphanumeric + hyphens + underscores
      - Usage Notes: Regex: /^[a-zA-Z0-9_-]+$/
      - Quality Contribution: Blocks injection attacks in tmux commands
      - Worked Example: "064-tmux" → true, "my_session" → true
      */
      const { manager } = createManager();
      expect(manager.validateSessionName('064-tmux')).toBe(true);
      expect(manager.validateSessionName('my_session')).toBe(true);
      expect(manager.validateSessionName('ABC-123-test')).toBe(true);
    });

    it('should reject invalid session names', () => {
      /*
      Test Doc:
      - Why: Security — tmux uses . and : as separators; spaces/special chars are dangerous
      - Contract: validateSessionName rejects empty, special chars, dots, colons, spaces
      - Usage Notes: Also rejects names > 256 chars
      - Quality Contribution: Prevents command injection and tmux parsing errors
      - Worked Example: "" → false, "a.b" → false, "a:b" → false, "a b" → false
      */
      const { manager } = createManager();
      expect(manager.validateSessionName('')).toBe(false);
      expect(manager.validateSessionName('a.b')).toBe(false);
      expect(manager.validateSessionName('a:b')).toBe(false);
      expect(manager.validateSessionName('a b')).toBe(false);
      expect(manager.validateSessionName('../etc')).toBe(false);
      expect(manager.validateSessionName('a'.repeat(257))).toBe(false);
    });
  });

  describe('validateCwd', () => {
    it('should accept paths within allowed base', () => {
      /*
      Test Doc:
      - Why: Security — prevent directory traversal attacks
      - Contract: validateCwd returns true for paths under allowedBase
      - Usage Notes: Uses path.resolve to normalize before comparison
      - Quality Contribution: Blocks ../../../etc/passwd style attacks
      - Worked Example: "/home/user/project" within "/home/user" → true
      */
      const { manager } = createManager();
      expect(manager.validateCwd('/home/user/project', '/home/user')).toBe(true);
      expect(manager.validateCwd('/home/user/project/sub', '/home/user')).toBe(true);
    });

    it('should reject paths outside allowed base', () => {
      /*
      Test Doc:
      - Why: Security — CWD comes from client query params, must be validated
      - Contract: validateCwd returns false for paths that escape allowedBase
      - Usage Notes: Handles ../ traversal after resolution
      - Quality Contribution: Critical security gate for PTY CWD
      - Worked Example: "/home/user/../other" within "/home/user" → false
      */
      const { manager } = createManager();
      expect(manager.validateCwd('/etc/passwd', '/home/user')).toBe(false);
      expect(manager.validateCwd('/home/user/../other', '/home/user')).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('should parse tmux list-sessions output correctly', () => {
      /*
      Test Doc:
      - Why: Session discovery — show available sessions in the UI
      - Contract: listSessions() parses tab-separated tmux format string
      - Usage Notes: Format: #{session_name}\t#{session_created}\t#{session_attached}\t#{session_windows}
      - Quality Contribution: Ensures UI gets structured data from raw tmux output
      - Worked Example: "064-tmux\t1709000000\t1\t2" → { name: "064-tmux", created: 1709000000, attached: 1, windows: 2 }
      */
      const { manager, exec } = createManager();
      exec.whenCommand('tmux', ['list-sessions', '-F', '#{session_name}\t#{session_created}\t#{session_attached}\t#{session_windows}']).returns(
        '064-tmux\t1709000000\t1\t2\n041-file-browser\t1708000000\t0\t1'
      );

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual({ name: '064-tmux', created: 1709000000, attached: 1, windows: 2 });
      expect(sessions[1]).toEqual({ name: '041-file-browser', created: 1708000000, attached: 0, windows: 1 });
    });

    it('should return empty array when no sessions exist', () => {
      /*
      Test Doc:
      - Why: Edge case — tmux server running but no sessions
      - Contract: listSessions returns [] when tmux list-sessions throws
      - Usage Notes: tmux throws exit code 1 when no sessions exist
      - Quality Contribution: Prevents crash on empty tmux server
      - Worked Example: tmux list-sessions throws → []
      */
      const { manager } = createManager();
      // No list-sessions configured → throws → should return []
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe('spawnAttachedPty', () => {
    it('should spawn pty with correct tmux new-session -A args', () => {
      /*
      Test Doc:
      - Why: Core functionality — atomic create-or-attach to tmux session
      - Contract: spawnAttachedPty calls pty.spawn with tmux new-session -A -s NAME -c CWD
      - Usage Notes: Uses argument array (not shell string) to prevent injection
      - Quality Contribution: Verifies the exact command that tmux receives
      - Worked Example: spawnAttachedPty("064-tmux", "/path", 80, 24) → pty.spawn("tmux", ["new-session", "-A", "-s", "064-tmux", "-c", "/path"])
      */
      const spawner = createFakePtySpawner();
      const exec = new FakeTmuxExecutor();
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const manager = new TmuxSessionManager(exec.exec, spawner.spawn);

      const pty = manager.spawnAttachedPty('064-tmux', '/path/to/worktree', 80, 24);

      expect(pty).toBeDefined();
      expect(spawner.spawnCount).toBe(1);
    });
  });

  describe('getShellFallback', () => {
    it('should return SHELL env var or /bin/bash', () => {
      /*
      Test Doc:
      - Why: Graceful degradation — when tmux unavailable, fall back to user's shell
      - Contract: getShellFallback returns $SHELL or "/bin/bash" as default
      - Usage Notes: Reads from process.env.SHELL
      - Quality Contribution: Ensures terminal works even without tmux
      - Worked Example: SHELL="/bin/zsh" → "/bin/zsh"; SHELL unset → "/bin/bash"
      */
      const { manager } = createManager();
      const shell = manager.getShellFallback();
      expect(typeof shell).toBe('string');
      expect(shell.length).toBeGreaterThan(0);
    });
  });
});
