// A management fee is carved out of the existing line items rather than
// added on top: applying a 2% fee to a single $5,000 line splits it into
// $4,900 for the original item + $100 "Management fee" line, so the
// document total is unchanged. Reversing it (unchecking the toggle) scales
// the remaining lines back up and drops the fee line.

export type ManagementFeeLine = {
  description: string;
  quantity: number;
  unit_price: number;
  is_management_fee?: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function managementFeeLineTotal(lineItems: ManagementFeeLine[]): number {
  const feeLine = lineItems.find((li) => li.is_management_fee);
  return feeLine ? round2(Number(feeLine.quantity) * Number(feeLine.unit_price)) : 0;
}

export function applyManagementFee<T extends ManagementFeeLine>(
  lineItems: T[],
  ratePercent: number
): T[] {
  const factor = 1 - ratePercent / 100;
  const base = lineItems.filter((li) => !li.is_management_fee);
  const subtotal = base.reduce(
    (sum, li) => sum + Number(li.quantity) * Number(li.unit_price),
    0
  );
  const feeAmount = round2(subtotal * (ratePercent / 100));
  const scaled = base.map((li) => ({
    ...li,
    unit_price: round2(Number(li.unit_price) * factor),
  }));
  return [
    ...scaled,
    {
      description: `Management fee (${ratePercent}%)`,
      quantity: 1,
      unit_price: feeAmount,
      is_management_fee: true,
    } as T,
  ];
}

export function removeManagementFee<T extends ManagementFeeLine>(
  lineItems: T[],
  ratePercent: number
): T[] {
  const factor = 1 - ratePercent / 100;
  const base = lineItems.filter((li) => !li.is_management_fee);
  if (factor <= 0) return base;
  return base.map((li) => ({
    ...li,
    unit_price: round2(Number(li.unit_price) / factor),
  }));
}
