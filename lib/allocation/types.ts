export type AllocationBasis = 'margin' | 'gross';

export interface SplitSnapshot {
  beneficiaryId: string;
  kind: 'percent' | 'fixed';
  /** 0..10000 when kind = percent. */
  percentBps?: number | null;
  /** cents per unit sold when kind = fixed. */
  fixedCentsPerUnit?: number | null;
  position: number;
}

/** Stored on order_lines.allocation_rule_snapshot at time of sale. */
export interface RuleSnapshot {
  ruleId: string | null;
  basis: AllocationBasis;
  splits: SplitSnapshot[];
}

export interface AllocationAmount {
  beneficiaryId: string;
  amountCents: number;
}
