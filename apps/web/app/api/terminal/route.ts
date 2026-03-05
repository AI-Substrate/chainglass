import { execSync } from 'node:child_process';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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
    const output = execSync(
      'tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}"',
      {
        encoding: 'utf8',
        timeout: 5000,
      }
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

    return NextResponse.json({ sessions, tmux: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('no server running') || msg.includes('not found')) {
      return NextResponse.json({ sessions: [], tmux: false });
    }
    return NextResponse.json({ sessions: [], tmux: false, error: msg }, { status: 500 });
  }
}
