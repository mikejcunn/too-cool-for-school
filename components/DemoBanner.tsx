import { isDemo } from '@/lib/demo';

/** Thin bar shown on every page while DEMO_MODE is on. */
export function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <div className="bg-amber-400 px-3 py-1 text-center text-xs font-medium text-amber-950">
      Demo mode · no real payments are processed · any card number works (ending 0000 declines, 9999 simulates
      a network failure)
    </div>
  );
}
