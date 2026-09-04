/* Idempotent seed: Friends of Winthrop org, admin user, beneficiaries, classrooms,
 * an event, products with variants + opening stock, and allocation rules.
 * Run: pnpm db:seed (loads .env.local). Safe to re-run. */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import {
  allocationRuleSplits,
  allocationRules,
  beneficiaries,
  classrooms,
  events,
  inventoryMovements,
  memberships,
  organizations,
  preorderWindows,
  productVariants,
  products,
  users,
} from './schema';

const ORG_SLUG = process.env.DEFAULT_ORG_SLUG || 'friends-of-winthrop';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'mike@runpayments.io';
const DEMO = process.env.DEMO_MODE === 'true' || process.env.RUN_MOCK_GATEWAY === 'true';
const RUN_MID = process.env.SEED_RUN_MID || (DEMO ? 'DEMO' : null);
const RUN_PUBLIC_KEY = process.env.SEED_RUN_PUBLIC_KEY || (DEMO ? 'demo-public-key' : null);

async function main() {
  // ── Org ──────────────────────────────────────────────────────────────────
  const [org] = await db
    .insert(organizations)
    .values({
      slug: ORG_SLUG,
      name: 'Friends of Winthrop',
      shortName: 'FOW',
      contactEmail: 'friendsofwinthrop@example.org',
      brandColor: '#1d4ed8',
      runMid: RUN_MID,
      runPublicKey: RUN_PUBLIC_KEY,
      orderPrefix: 'W',
    })
    .onConflictDoUpdate({
      target: organizations.slug,
      set: {
        name: 'Friends of Winthrop',
        runMid: RUN_MID,
        runPublicKey: RUN_PUBLIC_KEY,
      },
    })
    .returning();
  console.log(`org ${org.slug} (${org.id})`);

  // ── Admin user + membership ──────────────────────────────────────────────
  const [admin] = await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, name: 'Mike', isPlatformAdmin: true })
    .onConflictDoUpdate({ target: users.email, set: { isPlatformAdmin: true } })
    .returning();
  await db
    .insert(memberships)
    .values({ orgId: org.id, userId: admin.id, role: 'admin', acceptedAt: new Date() })
    .onConflictDoNothing();
  console.log(`admin ${admin.email}`);

  // ── Beneficiaries ────────────────────────────────────────────────────────
  const benDefs = [
    { slug: 'general-fund', name: 'General Fund', description: 'Enrichment programs and school-wide needs' },
    { slug: 'math-club', name: 'Math Club' },
    { slug: 'football', name: 'Football Team' },
  ];
  const bens: Record<string, string> = {};
  for (const [i, b] of benDefs.entries()) {
    const [row] = await db
      .insert(beneficiaries)
      .values({ orgId: org.id, ...b, sortOrder: i })
      .onConflictDoUpdate({ target: [beneficiaries.orgId, beneficiaries.slug], set: { name: b.name } })
      .returning();
    bens[b.slug] = row.id;
  }

  // ── Classrooms ───────────────────────────────────────────────────────────
  const rooms = [
    ['K', 'Ms. Alvarez'],
    ['K', 'Mr. Chen'],
    ['1', 'Mrs. Patel'],
    ['2', 'Ms. Ortiz'],
    ['3', 'Mr. Kowalski'],
    ['4', 'Mrs. Nguyen'],
    ['5', 'Ms. Brennan'],
  ] as const;
  const existingRooms = await db.select().from(classrooms).where(eq(classrooms.orgId, org.id));
  if (existingRooms.length === 0) {
    await db
      .insert(classrooms)
      .values(rooms.map(([grade, teacherName], i) => ({ orgId: org.id, grade, teacherName, sortOrder: i })));
  }

  // ── Event ────────────────────────────────────────────────────────────────
  const existingEvents = await db.select().from(events).where(eq(events.orgId, org.id));
  if (existingEvents.length === 0) {
    await db.insert(events).values({
      orgId: org.id,
      name: 'Fall Festival',
      startsAt: new Date('2026-10-17T14:00:00-04:00'),
      endsAt: new Date('2026-10-17T18:00:00-04:00'),
      location: 'Winthrop Elementary, 325 Bay Rd, Hamilton MA',
      kind: 'both',
    });
  }

  // ── Pre-order window (for the hoodie) ────────────────────────────────────
  let [win] = await db
    .select()
    .from(preorderWindows)
    .where(and(eq(preorderWindows.orgId, org.id), eq(preorderWindows.name, 'Fall Hoodie Pre-order')));
  if (!win) {
    [win] = await db
      .insert(preorderWindows)
      .values({
        orgId: org.id,
        name: 'Fall Hoodie Pre-order',
        opensAt: new Date('2026-09-08T00:00:00-04:00'),
        closesAt: new Date('2026-10-02T23:59:59-04:00'),
        status: 'open',
        expectedDeliveryOn: '2026-10-30',
      })
      .returning();
  }

  // ── Products ─────────────────────────────────────────────────────────────
  type VariantSeed = { sku: string; size?: string; color?: string; label: string; onHand: number };
  type ProductSeed = {
    slug: string;
    name: string;
    description: string;
    category: string;
    priceCents: number;
    cogsCents: number;
    msrpCents: number | null;
    saleMode?: 'stock' | 'preorder';
    preorderWindowId?: string | null;
    variants: VariantSeed[];
  };

  const sizes = ['YS', 'YM', 'YL', 'AS', 'AM', 'AL', 'AXL'];
  const teeVariants: VariantSeed[] = [];
  for (const color of ['Navy', 'Grey']) {
    for (const size of sizes) {
      teeVariants.push({
        sku: `TEE-${color.slice(0, 3).toUpperCase()}-${size}`,
        size,
        color,
        label: `${size} / ${color}`,
        onHand: 12,
      });
    }
  }
  const hoodieVariants: VariantSeed[] = sizes.map((size) => ({
    sku: `HOOD-NAV-${size}`,
    size,
    color: 'Navy',
    label: `${size} / Navy`,
    onHand: 0,
  }));

  const productSeeds: ProductSeed[] = [
    {
      slug: 'spirit-tee',
      name: 'Winthrop Spirit Tee',
      description: 'Soft cotton tee with the Winthrop wildcat. Youth and adult sizes.',
      category: 'Apparel',
      priceCents: 1800,
      cogsCents: 700,
      msrpCents: 2200,
      variants: teeVariants,
    },
    {
      slug: 'fall-hoodie',
      name: 'Winthrop Hoodie (Pre-order)',
      description: 'Heavyweight navy hoodie. Pre-order now; delivered to classrooms after the window closes.',
      category: 'Apparel',
      priceCents: 4000,
      cogsCents: 1900,
      msrpCents: 4500,
      saleMode: 'preorder',
      preorderWindowId: win.id,
      variants: hoodieVariants,
    },
    {
      slug: 'beanie',
      name: 'Winthrop Beanie',
      description: 'Knit beanie, one size.',
      category: 'Accessories',
      priceCents: 1500,
      cogsCents: 600,
      msrpCents: null,
      variants: [{ sku: 'BEANIE', label: 'One size', onHand: 30 }],
    },
    {
      slug: 'sticker-pack',
      name: 'Sticker Pack',
      description: 'Five die-cut Winthrop stickers.',
      category: 'Accessories',
      priceCents: 500,
      cogsCents: 120,
      msrpCents: null,
      variants: [{ sku: 'STICKERS', label: 'Pack of 5', onHand: 100 }],
    },
  ];

  const productIds: Record<string, string> = {};
  for (const [i, p] of productSeeds.entries()) {
    const { variants, ...fields } = p;
    const [prod] = await db
      .insert(products)
      .values({ orgId: org.id, ...fields, status: 'active', hasVariants: variants.length > 1, sortOrder: i })
      .onConflictDoUpdate({
        target: [products.orgId, products.slug],
        set: {
          name: fields.name,
          priceCents: fields.priceCents,
          cogsCents: fields.cogsCents,
          msrpCents: fields.msrpCents,
        },
      })
      .returning();
    productIds[p.slug] = prod.id;

    for (const [j, v] of variants.entries()) {
      const existing = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.orgId, org.id), eq(productVariants.sku, v.sku)));
      if (existing.length > 0) continue;
      const [variant] = await db
        .insert(productVariants)
        .values({
          orgId: org.id,
          productId: prod.id,
          sku: v.sku,
          size: v.size ?? null,
          color: v.color ?? null,
          label: v.label,
          onHand: v.onHand,
          position: j,
        })
        .returning();
      if (v.onHand > 0) {
        await db.insert(inventoryMovements).values({
          orgId: org.id,
          variantId: variant.id,
          type: 'receive',
          quantity: v.onHand,
          onHandAfter: v.onHand,
          reservedAfter: 0,
          referenceType: 'manual',
          note: 'Opening stock (seed)',
          createdBy: admin.id,
        });
      }
    }
  }
  console.log(`products: ${Object.keys(productIds).join(', ')}`);

  // ── Allocation rules ─────────────────────────────────────────────────────
  const [defaultRule] = await db
    .select()
    .from(allocationRules)
    .where(
      and(
        eq(allocationRules.orgId, org.id),
        isNull(allocationRules.productId),
        eq(allocationRules.active, true)
      )
    );
  if (!defaultRule) {
    const [rule] = await db
      .insert(allocationRules)
      .values({ orgId: org.id, productId: null, name: 'Org default' })
      .returning();
    await db.insert(allocationRuleSplits).values({
      ruleId: rule.id,
      beneficiaryId: bens['general-fund'],
      kind: 'percent',
      percentBps: 10000,
      position: 0,
    });
  }
  const [hoodieRule] = await db
    .select()
    .from(allocationRules)
    .where(
      and(
        eq(allocationRules.orgId, org.id),
        eq(allocationRules.productId, productIds['fall-hoodie']),
        eq(allocationRules.active, true)
      )
    );
  if (!hoodieRule) {
    const [rule] = await db
      .insert(allocationRules)
      .values({
        orgId: org.id,
        productId: productIds['fall-hoodie'],
        name: 'Hoodie: Football 60 / General 40',
      })
      .returning();
    await db.insert(allocationRuleSplits).values([
      { ruleId: rule.id, beneficiaryId: bens['football'], kind: 'percent', percentBps: 6000, position: 0 },
      {
        ruleId: rule.id,
        beneficiaryId: bens['general-fund'],
        kind: 'percent',
        percentBps: 4000,
        position: 1,
      },
    ]);
  }
  console.log('allocation rules ok');
}

main()
  .then(() => {
    console.log('seed complete');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
