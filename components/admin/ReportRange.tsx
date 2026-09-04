'use client';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function ReportRange({ orgSlug, from, to }: { orgSlug: string; from: string; to: string }) {
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        router.push(`/admin/${orgSlug}/reports?from=${fd.get('from')}&to=${fd.get('to')}`);
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        From
        <Input type="date" name="from" defaultValue={from} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        To
        <Input type="date" name="to" defaultValue={to} />
      </label>
      <Button type="submit" size="sm" variant="outline">
        Apply
      </Button>
    </form>
  );
}
