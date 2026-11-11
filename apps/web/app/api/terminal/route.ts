import { auth } from '@/auth';
import { sortTerminalSessions } from '@/features/064-terminal/lib/sort-terminal-sessions';
import { createCommandExecutor } from '@/features/064-terminal/server/exec-command';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** argv, off the event loop, 3 s timeout: a slow tmux must not stall every other API request. */
const execCommand = createCommandExecutor();

interface SessionInfo {
  name: string;
  attached: number;
  windows: number;
  created: number;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const output = (
      await execCommand('tmux', [
        'list-sessions',
        '-F',
        '#{session_name}|#{session_attached}|#{session_windows}|#{session_created}',
      ])
    ).trim();

    if (!output) {
      return NextResponse.json({ sessions: [], tmux: true });
    }

    const sessions: SessionInfo[] = output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, attached, windows, created] = line.split('|');
        return {
          name: name ?? '',
          attached: Number.parseInt(attached ?? '0', 10),
          windows: Number.parseInt(windows ?? '0', 10),
          created: Number.parseInt(created ?? '0', 10),
        };
      });

    return NextResponse.json({ sessions: sortTerminalSessions(sessions), tmux: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    // No server yet ("no server running"), or no tmux binary (ENOENT): tmux is simply absent.
    if (msg.includes('no server running') || msg.includes('ENOENT')) {
      return NextResponse.json({ sessions: [], tmux: false });
    }
    return NextResponse.json({ sessions: [], tmux: false, error: msg }, { status: 500 });
  }
}
