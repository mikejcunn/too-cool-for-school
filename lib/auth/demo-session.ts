/* Demo-only sign-in: creates an Auth.js database session for the seeded admin and sets
 * the session cookie directly, so a hosted demo needs no email delivery. Refuses to run
 * unless DEMO_MODE is on. */
import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';
import { isDemo } from '@/lib/demo';

export async function createDemoSession(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDemo()) return { ok: false, message: 'Demo sign-in is disabled.' };
  const email = (
    process.env.DEMO_ADMIN_EMAIL ||
    process.env.SEED_ADMIN_EMAIL ||
    'mike@runpayments.io'
  ).toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user)
    [user] = await db.insert(users).values({ email, name: 'Demo Admin', isPlatformAdmin: true }).returning();

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 86_400_000);
  await db.insert(sessions).values({ sessionToken: token, userId: user.id, expires });

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const secure = proto === 'https';
  const jar = await cookies();
  jar.set(secure ? '__Secure-authjs.session-token' : 'authjs.session-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires,
  });
  return { ok: true };
}
