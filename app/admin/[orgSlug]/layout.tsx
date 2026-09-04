import { requireMember } from '@/lib/tenant/context';
import { AdminNav } from '@/components/admin/AdminNav';
import { SignOutButton } from '@/components/admin/SignOutButton';
import { Badge } from '@/components/ui/badge';

export default async function AdminLayout({
  params,
  children,
}: {
  params: Promise<{ orgSlug: string }>;
  children: React.ReactNode;
}) {
  const { orgSlug } = await params;
  const { org, user, role } = await requireMember(orgSlug, 'viewer', `/admin/${orgSlug}`);
  return (
    <div className="grid min-h-dvh md:grid-cols-[220px_1fr]">
      <aside className="border-b bg-muted/30 p-4 md:border-b-0 md:border-r">
        <div className="mb-4">
          <div className="font-semibold leading-tight">{org.name}</div>
          <div className="text-xs text-muted-foreground">Admin</div>
        </div>
        <AdminNav orgSlug={org.slug} />
        <div className="mt-6 grid gap-1 text-xs text-muted-foreground">
          <div className="truncate">{user.email}</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {role}
            </Badge>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
