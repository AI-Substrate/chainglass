import { auth } from '@/auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function bypassProxy(req: NextRequest) {
  return NextResponse.next();
}

export const proxy =
  process.env.DISABLE_AUTH === 'true'
    ? bypassProxy
    : auth((req) => {
        if (!req.auth) {
          const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
          if (isApiRoute) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const loginUrl = new URL('/login', req.nextUrl.origin);
          return NextResponse.redirect(loginUrl);
        }
        return NextResponse.next();
      });

export const config = {
  matcher: [
    '/((?!login|api/health|api/auth|api/event-popper|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
