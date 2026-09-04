import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { ReCaptchaProvider } from 'next-recaptcha-v3';
import { requireOrg } from '@/lib/tenant/context';
import { loadCart } from '@/lib/checkout/cart';
import { Badge } from '@/components/ui/badge';

export default async function StoreLayout({
  params,
  children,
}: {
  params: Promise<{ orgSlug: string }>;
  children: React.ReactNode;
}) {
  const { orgSlug } = await params;
  const org = await requireOrg(orgSlug);
  const cart = await loadCart(org.id);
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const brand = org.brandColor ? ({ '--primary': org.brandColor } as React.CSSProperties) : undefined;

  const body = (
    <div style={brand} className="flex min-h-dvh flex-col">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href={`/s/${org.slug}`} className="flex items-center gap-3">
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="h-8 w-8 rounded" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
                {(org.shortName ?? org.name).slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="font-semibold">{org.name} Store</span>
          </Link>
          <Link
            href={`/s/${org.slug}/cart`}
            className="relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="hidden sm:inline">Cart</span>
            {cart.itemCount > 0 && (
              <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1">
                {cart.itemCount}
              </Badge>
            )}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {org.name}
        {org.contactEmail ? (
          <>
            {' · '}
            <a className="underline" href={`mailto:${org.contactEmail}`}>
              {org.contactEmail}
            </a>
          </>
        ) : null}
      </footer>
    </div>
  );

  return siteKey ? <ReCaptchaProvider reCaptchaKey={siteKey}>{body}</ReCaptchaProvider> : body;
}
