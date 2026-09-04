import NextAuth, { type NextAuthConfig } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';

const devLogLinks = process.env.AUTH_DEV_LOG_LINKS === 'true' && !process.env.AUTH_RESEND_KEY;

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: '/login', verifyRequest: '/verify', error: '/login' },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM || 'login@example.org',
      ...(devLogLinks
        ? {
            // Local dev without an email key: print the magic link instead of sending it.
            sendVerificationRequest: async ({ identifier, url }) => {
              console.log(`\n[auth] magic link for ${identifier}:\n${url}\n`);
            },
          }
        : {}),
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
