import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/lib/auth';
import { isDemo } from '@/lib/demo';
import { createDemoSession } from '@/lib/auth/demo-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Search = { next?: string; error?: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { next, error } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(safeNext(next));

  async function sendLink(formData: FormData) {
    'use server';
    const email = String(formData.get('email') || '')
      .trim()
      .toLowerCase();
    const redirectTo = safeNext(String(formData.get('next') || ''));
    try {
      await signIn('resend', { email, redirectTo });
    } catch (e) {
      // Auth.js signals its redirect by throwing; anything else is a real error.
      if (e instanceof AuthError) redirect(`/login?error=${encodeURIComponent(e.type)}`);
      throw e;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Volunteer sign in</CardTitle>
          <CardDescription>We&apos;ll email you a one-time link. No password needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendLink} className="grid gap-4">
            <input type="hidden" name="next" value={next ?? ''} />
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.org"
              />
            </div>
            {error ? <p className="text-sm text-destructive">Sign-in failed ({error}). Try again.</p> : null}
            <Button type="submit">Email me a sign-in link</Button>
          </form>
          {isDemo() && (
            <form
              className="mt-4 border-t pt-4"
              action={async () => {
                'use server';
                const r = await createDemoSession();
                if (r.ok) redirect('/admin');
                redirect('/login?error=DemoDisabled');
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Demo: sign in as admin (no email needed)
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
}
