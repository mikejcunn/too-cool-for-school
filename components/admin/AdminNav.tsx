'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  PackageCheck,
  Settings,
  ShoppingBag,
  Store,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/fulfillment', label: 'Fulfillment', icon: PackageCheck },
  { href: '/products', label: 'Products', icon: Tag },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AdminNav({ orgSlug }: { orgSlug: string }) {
  const path = usePathname();
  const base = `/admin/${orgSlug}`;
  return (
    <nav className="grid gap-1 text-sm">
      {items.map(({ href, label, icon: Icon }) => {
        const full = `${base}${href}`;
        const active = href === '' ? path === base : path.startsWith(full);
        return (
          <Link
            key={href}
            href={full}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted',
              active && 'bg-muted font-medium'
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
      <div className="my-2 border-t" />
      <Link href={`/pos/${orgSlug}`} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
        <ShoppingBag className="h-4 w-4" /> POS mode
      </Link>
      <Link
        href={`/s/${orgSlug}`}
        className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted"
        target="_blank"
      >
        <Store className="h-4 w-4" /> View store
      </Link>
    </nav>
  );
}
