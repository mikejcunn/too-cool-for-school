import { asc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { beneficiaries } from '@/lib/db/schema';
import { beneficiaryEarnings } from '@/lib/allocation/report-queries';
import { BeneficiariesEditor } from '@/components/admin/BeneficiariesEditor';

export default async function BeneficiariesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const [rows, earnings] = await Promise.all([
    db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.orgId, org.id))
      .orderBy(asc(beneficiaries.sortOrder), asc(beneficiaries.name)),
    beneficiaryEarnings(org.id, new Date(0), new Date(8640000000000000)),
  ]);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Beneficiaries</h1>
        <p className="text-sm text-muted-foreground">
          Groups that receive a share of sales — Math Club, Football, General Fund. Assign shares on the
          Allocations page.
        </p>
      </div>
      <BeneficiariesEditor
        orgSlug={org.slug}
        rows={rows.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          active: b.active,
          netCents: earnings.find((e) => e.beneficiaryId === b.id)?.netCents ?? 0,
        }))}
      />
    </div>
  );
}
