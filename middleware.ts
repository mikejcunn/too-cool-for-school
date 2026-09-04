import { NextResponse, type NextRequest } from 'next/server';

/* Cheap cookie gate for authenticated areas. The real membership check runs in the
 * route-group layouts via requireMember(); this only saves a render for anonymous users.
 * Kept edge-safe on purpose (no DB, no Auth.js import). */
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const gated =
    pathname.startsWith('/admin') || pathname.startsWith('/pos') || pathname.startsWith('/platform');
  if (!gated) return NextResponse.next();
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (hasSession) return NextResponse.next();
  const login = new URL('/login', req.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/admin/:path*', '/pos/:path*', '/platform/:path*'] };
