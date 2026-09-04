'use client';
import { useTransition } from 'react';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { markFulfilledAction } from '@/app/admin/[orgSlug]/orders/actions';

export function FulfilButton({
  orgSlug,
  orderId,
  fulfilled,
}: {
  orgSlug: string;
  orderId: string;
  fulfilled: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={fulfilled ? 'outline' : 'default'}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markFulfilledAction(orgSlug, orderId, !fulfilled);
          toast.success(fulfilled ? 'Marked unfulfilled' : 'Marked fulfilled');
        })
      }
    >
      {fulfilled ? <Undo2 /> : <CheckCircle2 />}
      {fulfilled ? 'Undo fulfilled' : 'Mark fulfilled'}
    </Button>
  );
}
