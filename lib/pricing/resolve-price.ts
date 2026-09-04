/* Effective per-unit money for a variant: variant override wins over product value. */

export interface ProductMoney {
  priceCents: number;
  cogsCents: number;
  msrpCents: number | null;
}

export interface VariantMoneyOverrides {
  priceCentsOverride: number | null;
  cogsCentsOverride: number | null;
  msrpCentsOverride: number | null;
}

export interface EffectiveMoney {
  unitPriceCents: number;
  unitCogsCents: number;
  unitMsrpCents: number | null;
}

export function resolveMoney(product: ProductMoney, variant: VariantMoneyOverrides): EffectiveMoney {
  return {
    unitPriceCents: variant.priceCentsOverride ?? product.priceCents,
    unitCogsCents: variant.cogsCentsOverride ?? product.cogsCents,
    unitMsrpCents: variant.msrpCentsOverride ?? product.msrpCents,
  };
}
