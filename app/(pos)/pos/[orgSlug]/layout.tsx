import Link from 'next/link';
import { requireMember } from '@/lib/tenant/context';

export default async function PosLayout({
  params,
  children,
}: {
  params: Promise<{ orgSlug: string }>;
  children: React.ReactNode;
}) {
  const { orgSlug } = await params;
  const { org, user } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-4 py-2 text-sm">
        <div className="font-semibold">{org.name} · POS</div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="hidden sm:inline">{user.email}</span>
          <Link href={`/admin/${org.slug}`} className="hover:underline">
            Admin
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
