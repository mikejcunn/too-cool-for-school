import { formatCents } from '@/lib/money';

export function Price({
  cents,
  compareAtCents,
  className,
}: {
  cents: number;
  compareAtCents?: number | null;
  className?: string;
}) {
  const showCompare = compareAtCents != null && compareAtCents > cents;
  return (
    <span className={className}>
      <span className="font-semibold">{formatCents(cents)}</span>
      {showCompare && (
        <span className="ml-2 text-sm text-muted-foreground line-through">{formatCents(compareAtCents)}</span>
      )}
    </span>
  );
}
