export interface LineTotalInput {
  unitPriceCents: number;
  quantity: number;
}

export interface OrderTotals {
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
}

/** Tax is applied to the subtotal at `taxRateBps` (basis points), rounded half-up to the cent. */
export function computeTotals(lines: LineTotalInput[], taxRateBps = 0, feeCents = 0): OrderTotals {
  const subtotalCents = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
  return { subtotalCents, taxCents, feeCents, totalCents: subtotalCents + taxCents + feeCents };
}
