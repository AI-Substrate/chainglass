import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
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
  matcher: ['/((?!login|api/health|api/auth|_next/static|_next/image|favicon\\.ico).*)'],
};
