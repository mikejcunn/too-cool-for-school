/* Pre-order windows: demand rollups, open/close, and vendor purchase orders. */
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, type Tx } from '@/lib/db';
import {
  inventoryMovements,
  orderLines,
  orders,
  preorderWindows,
  products,
  productVariants,
  purchaseOrderLines,
  purchaseOrders,
} from '@/lib/db/schema';
import { receiveStock } from '@/lib/inventory';
import { resolveMoney } from '@/lib/pricing/resolve-price';
import { audit } from '@/lib/audit';

export type PreorderWindow = typeof preorderWindows.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;

const PAID = ['paid', 'partially_refunded'] as const;

export interface WindowStats extends PreorderWindow {
  productCount: number;
  orderCount: number;
  demandUnits: number;
  demandCents: number;
}

export async function listWindows(orgId: string): Promise<WindowStats[]> {
  const wins = await db
    .select()
    .from(preorderWindows)
    .where(eq(preorderWindows.orgId, orgId))
    .orderBy(sql`${preorderWindows.closesAt} desc`);
  if (!wins.length) return [];
  const ids = wins.map((w) => w.id);
  const [prodCounts, demand] = await Promise.all([
    db
      .select({ windowId: products.preorderWindowId, n: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.orgId, orgId), inArray(products.preorderWindowId, ids)))
      .groupBy(products.preorderWindowId),
    db
      .select({
        windowId: orderLines.preorderWindowId,
        orders: sql<number>`count(distinct ${orderLines.orderId})::int`,
        units: sql<number>`coalesce(sum(${orderLines.quantity} - ${orderLines.refundedQuantity}), 0)::int`,
        cents: sql<number>`coalesce(sum((${orderLines.quantity} - ${orderLines.refundedQuantity}) * ${orderLines.unitPriceCents}), 0)::int`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orderLines.orgId, orgId),
          inArray(orderLines.preorderWindowId, ids),
          eq(orderLines.isPreorder, true),
          inArray(orders.status, [...PAID])
        )
      )
      .groupBy(orderLines.preorderWindowId),
  ]);
  return wins.map((w) => ({
    ...w,
    productCount: prodCounts.find((p) => p.windowId === w.id)?.n ?? 0,
    orderCount: demand.find((d) => d.windowId === w.id)?.orders ?? 0,
    demandUnits: demand.find((d) => d.windowId === w.id)?.units ?? 0,
    demandCents: demand.find((d) => d.windowId === w.id)?.cents ?? 0,
  }));
}

export interface DemandRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  unitCogsCents: number;
  demandQty: number;
  orderedQty: number;
  receivedQty: number;
}

export interface WindowDetail {
  window: PreorderWindow;
  demand: DemandRow[];
  purchaseOrders: (PurchaseOrder & { lineCount: number })[];
  orderCount: number;
}

export async function getWindowDetail(orgId: string, windowId: string): Promise<WindowDetail | null> {
  const [win] = await db
    .select()
    .from(preorderWindows)
    .where(and(eq(preorderWindows.orgId, orgId), eq(preorderWindows.id, windowId)));
  if (!win) return null;

  // Every active variant of every product in the window, even with zero demand.
  const variants = await db
    .select({ v: productVariants, p: products })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(products.orgId, orgId),
        eq(products.preorderWindowId, windowId),
        eq(productVariants.active, true)
      )
    )
    .orderBy(products.sortOrder, products.name, productVariants.position);

  const demand = await db
    .select({
      variantId: orderLines.variantId,
      qty: sql<number>`coalesce(sum(${orderLines.quantity} - ${orderLines.refundedQuantity}), 0)::int`,
      orders: sql<number>`count(distinct ${orderLines.orderId})::int`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        eq(orderLines.preorderWindowId, windowId),
        eq(orderLines.isPreorder, true),
        inArray(orders.status, [...PAID])
      )
    )
    .groupBy(orderLines.variantId);

  const pos = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.preorderWindowId, windowId)))
    .orderBy(purchaseOrders.createdAt);
  const poIds = pos.map((p) => p.id);
  const poLines = poIds.length
    ? await db.select().from(purchaseOrderLines).where(inArray(purchaseOrderLines.poId, poIds))
    : [];

  const rows: DemandRow[] = variants.map(({ v, p }) => ({
    variantId: v.id,
    productId: p.id,
    productName: p.name,
    variantLabel: v.label,
    sku: v.sku,
    unitCogsCents: resolveMoney(p, v).unitCogsCents,
    demandQty: demand.find((d) => d.variantId === v.id)?.qty ?? 0,
    orderedQty: poLines
      .filter((l) => l.variantId === v.id && pos.find((po) => po.id === l.poId)?.status !== 'cancelled')
      .reduce((n, l) => n + l.quantityOrdered, 0),
    receivedQty: poLines.filter((l) => l.variantId === v.id).reduce((n, l) => n + l.quantityReceived, 0),
  }));
  const [oc] = await db
    .select({ n: sql<number>`count(distinct ${orderLines.orderId})::int` })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        eq(orderLines.preorderWindowId, windowId),
        inArray(orders.status, [...PAID])
      )
    );
  return {
    window: win,
    demand: rows,
    purchaseOrders: pos.map((po) => ({ ...po, lineCount: poLines.filter((l) => l.poId === po.id).length })),
    orderCount: oc?.n ?? 0,
  };
}

export type WindowStatus = PreorderWindow['status'];

export async function setWindowStatus(
  orgId: string,
  windowId: string,
  status: WindowStatus,
  actorUserId: string | null
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(preorderWindows)
      .where(and(eq(preorderWindows.orgId, orgId), eq(preorderWindows.id, windowId)))
      .for('update');
    if (!before) throw new Error('Window not found');
    await tx.update(preorderWindows).set({ status }).where(eq(preorderWindows.id, windowId));
    await audit(tx, {
      orgId,
      actorUserId,
      actorType: actorUserId ? 'user' : 'system',
      action: 'preorder_window.status',
      entityType: 'preorder_window',
      entityId: windowId,
      before: { status: before.status },
      after: { status },
    });
  });
}

/** Cron: close every open window whose closes_at has passed. Returns the ids closed. */
export async function closeDueWindows(now = new Date()): Promise<{ orgId: string; windowId: string }[]> {
  const due = await db
    .select({ id: preorderWindows.id, orgId: preorderWindows.orgId })
    .from(preorderWindows)
    .where(and(eq(preorderWindows.status, 'open'), lt(preorderWindows.closesAt, now)));
  for (const w of due) await setWindowStatus(w.orgId, w.id, 'closed', null);
  return due.map((w) => ({ orgId: w.orgId, windowId: w.id }));
}

/** Build a PO covering demand not yet covered by earlier (non-cancelled) POs. */
export async function createPurchaseOrderFromWindow(
  orgId: string,
  windowId: string,
  actorUserId: string,
  vendor: { vendorName: string; vendorContact?: string | null; notes?: string | null }
): Promise<{ ok: true; poId: string; lines: number } | { ok: false; message: string }> {
  const detail = await getWindowDetail(orgId, windowId);
  if (!detail) return { ok: false, message: 'Window not found.' };
  const needed = detail.demand
    .map((d) => ({ ...d, qty: Math.max(0, d.demandQty - d.orderedQty) }))
    .filter((d) => d.qty > 0);
  if (needed.length === 0)
    return { ok: false, message: 'Every pre-ordered unit is already on a purchase order.' };

  const poId = await db.transaction(async (tx) => {
    const total = needed.reduce((n, d) => n + d.qty * d.unitCogsCents, 0);
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        orgId,
        preorderWindowId: windowId,
        vendorName: vendor.vendorName,
        vendorContact: vendor.vendorContact ?? null,
        notes: vendor.notes ?? null,
        status: 'draft',
        totalCostCents: total,
        createdBy: actorUserId,
      })
      .returning({ id: purchaseOrders.id });
    await tx.insert(purchaseOrderLines).values(
      needed.map((d) => ({
        poId: po.id,
        variantId: d.variantId,
        quantityOrdered: d.qty,
        unitCostCents: d.unitCogsCents,
      }))
    );
    if (detail.window.status === 'open' || detail.window.status === 'closed') {
      await tx.update(preorderWindows).set({ status: 'ordered' }).where(eq(preorderWindows.id, windowId));
    }
    await audit(tx, {
      orgId,
      actorUserId,
      action: 'purchase_order.create',
      entityType: 'purchase_order',
      entityId: po.id,
      after: { windowId, lines: needed.length, totalCostCents: total },
    });
    return po.id;
  });
  return { ok: true, poId, lines: needed.length };
}

export interface PoDetail {
  po: PurchaseOrder;
  window: PreorderWindow | null;
  lines: (PurchaseOrderLine & { sku: string; label: string; productName: string })[];
}

export async function getPurchaseOrder(orgId: string, poId: string): Promise<PoDetail | null> {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.id, poId)));
  if (!po) return null;
  const [window] = po.preorderWindowId
    ? await db.select().from(preorderWindows).where(eq(preorderWindows.id, po.preorderWindowId))
    : [null];
  const lines = await db
    .select({
      l: purchaseOrderLines,
      sku: productVariants.sku,
      label: productVariants.label,
      productName: products.name,
    })
    .from(purchaseOrderLines)
    .innerJoin(productVariants, eq(productVariants.id, purchaseOrderLines.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(purchaseOrderLines.poId, poId))
    .orderBy(products.name, productVariants.position);
  return {
    po,
    window: window ?? null,
    lines: lines.map((r) => ({ ...r.l, sku: r.sku, label: r.label, productName: r.productName })),
  };
}

export async function updatePurchaseOrder(
  orgId: string,
  poId: string,
  actorUserId: string,
  patch: Partial<Pick<PurchaseOrder, 'vendorName' | 'vendorContact' | 'notes' | 'shippingCents' | 'status'>>
): Promise<void> {
  await db.transaction(async (tx) => {
    const set: typeof patch & { submittedAt?: Date } = { ...patch };
    if (patch.status === 'submitted') set.submittedAt = new Date();
    await tx
      .update(purchaseOrders)
      .set(set)
      .where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.id, poId)));
    await audit(tx, {
      orgId,
      actorUserId,
      action: 'purchase_order.update',
      entityType: 'purchase_order',
      entityId: poId,
      after: patch,
    });
  });
}

/**
 * Receive units against PO lines. Each unit received goes on hand (`receive`), then the
 * portion that satisfies outstanding pre-order demand is taken back out (`preorder_fill`)
 * so only the surplus remains sellable as stock.
 */
export async function receivePurchaseOrderLines(
  orgId: string,
  poId: string,
  actorUserId: string,
  received: { lineId: string; quantity: number }[]
): Promise<{ ok: true; poStatus: PurchaseOrder['status'] } | { ok: false; message: string }> {
  const detail = await getPurchaseOrder(orgId, poId);
  if (!detail) return { ok: false, message: 'Purchase order not found.' };
  if (detail.po.status === 'cancelled') return { ok: false, message: 'This purchase order is cancelled.' };
  const positive = received.filter((r) => Number.isInteger(r.quantity) && r.quantity > 0);
  if (positive.length === 0) return { ok: false, message: 'Enter at least one received quantity.' };

  const status = await db.transaction(async (tx) => {
    for (const r of positive) {
      const line = detail.lines.find((l) => l.id === r.lineId);
      if (!line) throw new Error('Unknown PO line');
      await tx
        .update(purchaseOrderLines)
        .set({ quantityReceived: line.quantityReceived + r.quantity })
        .where(eq(purchaseOrderLines.id, line.id));
      await receiveStock(tx, {
        orgId,
        variantId: line.variantId,
        quantity: r.quantity,
        type: 'receive',
        referenceType: 'purchase_order',
        referenceId: poId,
        createdBy: actorUserId,
      });

      if (detail.po.preorderWindowId) {
        const fill = await outstandingBacklog(tx, orgId, detail.po.preorderWindowId, line.variantId);
        const take = Math.min(r.quantity, fill);
        if (take > 0) {
          await receiveStock(tx, {
            orgId,
            variantId: line.variantId,
            quantity: -take,
            type: 'preorder_fill',
            referenceType: 'purchase_order',
            referenceId: poId,
            note: 'Allocated to pre-orders',
            createdBy: actorUserId,
          });
        }
      }
    }
    const fresh = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId));
    const complete = fresh.every((l) => l.quantityReceived >= l.quantityOrdered);
    const poStatus: PurchaseOrder['status'] = complete ? 'received' : 'partially_received';
    await tx
      .update(purchaseOrders)
      .set({ status: poStatus, receivedAt: complete ? new Date() : null })
      .where(eq(purchaseOrders.id, poId));
    if (complete && detail.po.preorderWindowId) {
      const others = await tx
        .select({ status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.preorderWindowId, detail.po.preorderWindowId),
            inArray(purchaseOrders.status, ['draft', 'submitted', 'partially_received'])
          )
        );
      if (others.length === 0)
        await tx
          .update(preorderWindows)
          .set({ status: 'received' })
          .where(eq(preorderWindows.id, detail.po.preorderWindowId));
    }
    await audit(tx, {
      orgId,
      actorUserId,
      action: 'purchase_order.receive',
      entityType: 'purchase_order',
      entityId: poId,
      after: { received: positive, poStatus },
    });
    return poStatus;
  });
  return { ok: true, poStatus: status };
}

/** Pre-order demand for a variant in a window not yet covered by preorder_fill movements. */
async function outstandingBacklog(
  tx: Tx,
  orgId: string,
  windowId: string,
  variantId: string
): Promise<number> {
  const [d] = await tx
    .select({
      qty: sql<number>`coalesce(sum(${orderLines.quantity} - ${orderLines.refundedQuantity}), 0)::int`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        eq(orderLines.preorderWindowId, windowId),
        eq(orderLines.variantId, variantId),
        eq(orderLines.isPreorder, true),
        inArray(orders.status, [...PAID])
      )
    );
  const poIds = await tx
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.orgId, orgId), eq(purchaseOrders.preorderWindowId, windowId)));
  const [f] = poIds.length
    ? await tx
        .select({ filled: sql<number>`coalesce(-sum(${inventoryMovements.quantity}), 0)::int` })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.orgId, orgId),
            eq(inventoryMovements.variantId, variantId),
            eq(inventoryMovements.type, 'preorder_fill'),
            eq(inventoryMovements.referenceType, 'purchase_order'),
            inArray(
              inventoryMovements.referenceId,
              poIds.map((p) => p.id)
            )
          )
        )
    : [{ filled: 0 }];
  return Math.max(0, (d?.qty ?? 0) - (f?.filled ?? 0));
}
